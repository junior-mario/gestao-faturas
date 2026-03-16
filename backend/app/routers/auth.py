import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import (
    AuthChangePasswordIn,
    AuthLoginIn,
    AuthMeOut,
    AuthTokenOut,
    UserCreateIn,
    UserOut,
    UserPasswordUpdateIn,
)

AUTH_BOOTSTRAP_USERNAME = os.getenv("AUTH_USERNAME", "admin")
AUTH_BOOTSTRAP_PASSWORD = os.getenv("AUTH_PASSWORD", "admin123")
AUTH_SECRET = os.getenv("AUTH_SECRET", "")
AUTH_TOKEN_TTL_HOURS = int(os.getenv("AUTH_TOKEN_TTL_HOURS", "12"))
AUTH_PASSWORD_ITERATIONS = int(os.getenv("AUTH_PASSWORD_ITERATIONS", "200000"))
_EFFECTIVE_SECRET = AUTH_SECRET or "gestao-faturas-dev-secret"

_security = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/auth")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_username(username: str) -> str:
    normalized = username.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="username nao pode ser vazio")
    return normalized


def _validate_password(value: str, field_name: str = "password") -> str:
    password = value.strip()
    if len(password) < 6:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} deve ter pelo menos 6 caracteres",
        )
    return password


def _hash_password(password: str, salt_hex: str | None = None, iterations: int = AUTH_PASSWORD_ITERATIONS) -> str:
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored_hash: str) -> bool:
    parts = stored_hash.split("$", 3)
    if len(parts) != 4:
        return False
    algorithm, iterations_raw, salt_hex, hash_hex = parts
    if algorithm != "pbkdf2_sha256":
        return False
    try:
        iterations = int(iterations_raw)
    except ValueError:
        return False
    candidate_hash = _hash_password(password, salt_hex=salt_hex, iterations=iterations)
    candidate_hex = candidate_hash.split("$", 3)[3]
    return hmac.compare_digest(candidate_hex, hash_hex)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _unauthorized(detail: str = "Nao autenticado") -> None:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _sign(payload_b64: str) -> str:
    return hmac.new(
        _EFFECTIVE_SECRET.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _create_token(user: User) -> tuple[str, str]:
    expires_at_dt = datetime.now(timezone.utc) + timedelta(hours=AUTH_TOKEN_TTL_HOURS)
    payload = {
        "uid": user.id,
        "usr": user.username,
        "exp": int(expires_at_dt.timestamp()),
    }
    payload_json = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_b64 = _b64url_encode(payload_json)
    signature = _sign(payload_b64)
    token = f"{payload_b64}.{signature}"
    return token, expires_at_dt.isoformat()


def _decode_token(token: str) -> dict:
    parts = token.split(".", 1)
    if len(parts) != 2:
        _unauthorized("Token invalido")

    payload_b64, signature = parts
    expected = _sign(payload_b64)
    if not hmac.compare_digest(signature, expected):
        _unauthorized("Token invalido")

    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        _unauthorized("Token invalido")

    exp = payload.get("exp")
    if not isinstance(exp, int):
        _unauthorized("Token invalido")
    if datetime.now(timezone.utc).timestamp() >= exp:
        _unauthorized("Token expirado")
    return payload


def ensure_default_admin(db: Session) -> None:
    username = _normalize_username(AUTH_BOOTSTRAP_USERNAME)
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        return

    bootstrap_password = AUTH_BOOTSTRAP_PASSWORD.strip()
    if len(bootstrap_password) < 6:
        bootstrap_password = "admin123"

    now = _now_iso()
    admin_user = User(
        username=username,
        password_hash=_hash_password(bootstrap_password),
        is_admin=True,
        active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(admin_user)
    db.commit()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
    db: Session = Depends(get_db),
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        _unauthorized()

    payload = _decode_token(credentials.credentials)
    uid = payload.get("uid")
    if not isinstance(uid, int):
        _unauthorized("Token invalido")

    user = db.get(User, uid)
    if not user or not user.active:
        _unauthorized("Usuario invalido")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Apenas administrador")
    return user


@router.post("/login", response_model=AuthTokenOut)
def login(data: AuthLoginIn, db: Session = Depends(get_db)):
    username = _normalize_username(data.username)
    user = (
        db.query(User)
        .filter(User.username == username, User.active == True)
        .first()
    )
    if not user or not _verify_password(data.password, user.password_hash):
        _unauthorized("Usuario ou senha invalidos")

    access_token, expires_at = _create_token(user)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_at": expires_at,
    }


@router.get("/me", response_model=AuthMeOut)
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "is_admin": current_user.is_admin,
    }


@router.post("/logout")
def logout(_: User = Depends(get_current_user)):
    return {"ok": True}


@router.post("/change-password")
def change_my_password(
    data: AuthChangePasswordIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _verify_password(data.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Senha atual invalida")

    new_password = _validate_password(data.new_password, "new_password")
    current_user.password_hash = _hash_password(new_password)
    current_user.updated_at = _now_iso()
    db.commit()
    return {"ok": True}


@router.get("/users", response_model=list[UserOut])
def list_users(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(User)
        .filter(User.active == True)
        .order_by(User.username.asc())
        .all()
    )


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    data: UserCreateIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    username = _normalize_username(data.username)
    password = _validate_password(data.password, "password")

    exists = db.query(User).filter(User.username == username).first()
    if exists:
        raise HTTPException(status_code=409, detail="Usuario ja existe")

    now = _now_iso()
    user = User(
        username=username,
        password_hash=_hash_password(password),
        is_admin=bool(data.is_admin),
        active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}/password")
def update_user_password(
    user_id: int,
    data: UserPasswordUpdateIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user or not user.active:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    new_password = _validate_password(data.new_password, "new_password")
    user.password_hash = _hash_password(new_password)
    user.updated_at = _now_iso()
    db.commit()
    return {"ok": True}
