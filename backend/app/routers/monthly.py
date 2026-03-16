import json
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AppConfig, Fatura, FaturaMonthly
from app.routers.auth import get_current_user
from app.schemas import (
    AppConfigOut,
    AppConfigUpdate,
    FaturaWithMonthly,
    MonthlyOut,
    MonthlyUpdate,
)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
DEFAULT_PUBLIC_URL = os.getenv("PUBLIC_URL", "http://localhost:8080").rstrip("/")
DEFAULT_EMAIL_SUBJECT_TEMPLATE = "Fatura | {{nome_fatura}} | {{mes_nome}}/{{ano}}"
DEFAULT_EMAIL_BODY_TEMPLATE = """Prezados,

Encaminhamos a fatura referente a {{nome_fatura}} ({{mes_nome}}/{{ano}}).

RESUMO DA FATURA
FATURA ............ {{nome_fatura}}
PERIODO ........... {{periodo}}
VALOR ............. {{valor}}
CONTA ............. {{conta}}
EMISSAO ........... {{emissao}}
VENCIMENTO ........ {{vencimento}}

DOWNLOAD
{{download_link}}

Em caso de duvidas, estamos a disposicao.

Atenciosamente,
Departamento de TI
Quinta da Baroneza"""

MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

router = APIRouter()


def _parse_json_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return parsed
    except (json.JSONDecodeError, TypeError):
        pass
    return [value] if value else []


def _normalize_public_url(value: str) -> str:
    normalized = value.strip().rstrip("/")
    if not normalized:
        raise HTTPException(status_code=400, detail="public_url nao pode ser vazio")
    if not normalized.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400,
            detail="public_url deve comecar com http:// ou https://",
        )
    return normalized


def _normalize_non_empty(value: str, field_name: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail=f"{field_name} nao pode ser vazio")
    return normalized


def _get_config_value(db: Session, key: str, default: str) -> str:
    config = db.get(AppConfig, key)
    if config and config.value:
        return config.value
    return default


def _set_config_value(db: Session, key: str, value: str) -> None:
    config = db.get(AppConfig, key)
    if config:
        config.value = value
    else:
        db.add(AppConfig(key=key, value=value))


def _get_public_url(db: Session) -> str:
    return _get_config_value(db, "public_url", DEFAULT_PUBLIC_URL).rstrip("/")


def _set_public_url(db: Session, value: str) -> str:
    normalized = _normalize_public_url(value)
    _set_config_value(db, "public_url", normalized)
    db.commit()
    return normalized


def _get_email_subject_template(db: Session) -> str:
    return _get_config_value(
        db,
        "email_subject_template",
        DEFAULT_EMAIL_SUBJECT_TEMPLATE,
    )


def _get_email_body_template(db: Session) -> str:
    return _get_config_value(
        db,
        "email_body_template",
        DEFAULT_EMAIL_BODY_TEMPLATE,
    )


def _get_app_config(db: Session) -> dict[str, str]:
    return {
        "public_url": _get_public_url(db),
        "email_subject_template": _get_email_subject_template(db),
        "email_body_template": _get_email_body_template(db),
    }


def _get_or_create_monthly(
    db: Session, fatura_id: int, ano: int, mes: int
) -> FaturaMonthly:
    record = (
        db.query(FaturaMonthly)
        .filter(
            FaturaMonthly.fatura_id == fatura_id,
            FaturaMonthly.ano == ano,
            FaturaMonthly.mes == mes,
        )
        .first()
    )
    if not record:
        now = datetime.now(timezone.utc).isoformat()
        record = FaturaMonthly(
            fatura_id=fatura_id,
            ano=ano,
            mes=mes,
            enviada=False,
            created_at=now,
            updated_at=now,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
    return record


@router.get("/monthly", response_model=list[FaturaWithMonthly])
def list_monthly(
    ano: int,
    mes: int,
    busca: str | None = None,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    query = db.query(Fatura).filter(Fatura.ativo == True)
    if busca:
        like = f"%{busca}%"
        query = query.filter(Fatura.nome.ilike(like))
    faturas = query.order_by(Fatura.dia).all()

    monthly_records = (
        db.query(FaturaMonthly)
        .filter(FaturaMonthly.ano == ano, FaturaMonthly.mes == mes)
        .all()
    )
    monthly_map = {m.fatura_id: m for m in monthly_records}

    result = []
    for f in faturas:
        m = monthly_map.get(f.id)
        nomes = _parse_json_list(m.arquivo_nome) if m else []
        fatura_dict = {
            "id": f.id,
            "nome": f.nome,
            "conta": f.conta,
            "valor": f.valor,
            "moeda": f.moeda,
            "valor_num": f.valor_num,
            "dia": f.dia,
            "grupo": f.grupo,
            "ativo": f.ativo,
            "created_at": f.created_at,
            "monthly": (
                {
                    "id": m.id,
                    "fatura_id": m.fatura_id,
                    "ano": m.ano,
                    "mes": m.mes,
                    "valor_override": m.valor_override,
                    "emissao": m.emissao,
                    "vencimento": m.vencimento,
                    "arquivo_nome": m.arquivo_nome,
                    "arquivos": nomes,
                    "enviada": m.enviada,
                    "created_at": m.created_at,
                    "updated_at": m.updated_at,
                }
                if m
                else None
            ),
        }
        result.append(fatura_dict)

    return result


@router.put("/monthly/{fatura_id}", response_model=MonthlyOut)
def update_monthly(
    fatura_id: int,
    data: MonthlyUpdate,
    ano: int = Query(...),
    mes: int = Query(...),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    fatura = db.query(Fatura).filter(Fatura.id == fatura_id).first()
    if not fatura:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")

    record = _get_or_create_monthly(db, fatura_id, ano, mes)
    now = datetime.now(timezone.utc).isoformat()

    if data.valor_override is not None:
        record.valor_override = data.valor_override
    if data.emissao is not None:
        record.emissao = data.emissao
    if data.vencimento is not None:
        record.vencimento = data.vencimento
    record.updated_at = now

    db.commit()
    db.refresh(record)
    return record


@router.post("/monthly/{fatura_id}/upload", response_model=MonthlyOut)
async def upload_file(
    fatura_id: int,
    ano: int = Query(...),
    mes: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    fatura = db.query(Fatura).filter(Fatura.id == fatura_id).first()
    if not fatura:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")

    record = _get_or_create_monthly(db, fatura_id, ano, mes)

    ext = os.path.splitext(file.filename)[1] if file.filename else ""
    dir_path = os.path.join(UPLOAD_DIR, str(ano), str(mes))
    os.makedirs(dir_path, exist_ok=True)
    stored_name = f"{fatura_id}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = os.path.join(dir_path, stored_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    now = datetime.now(timezone.utc).isoformat()

    existing_names = _parse_json_list(record.arquivo_nome)
    existing_paths = _parse_json_list(record.arquivo_path)
    existing_names.append(file.filename or stored_name)
    existing_paths.append(file_path)

    record.arquivo_nome = json.dumps(existing_names)
    record.arquivo_path = json.dumps(existing_paths)
    record.updated_at = now

    db.commit()
    db.refresh(record)
    return record


@router.get("/monthly/{fatura_id}/download")
def download_file(
    fatura_id: int,
    ano: int = Query(...),
    mes: int = Query(...),
    idx: int = Query(0),
    db: Session = Depends(get_db),
):
    record = (
        db.query(FaturaMonthly)
        .filter(
            FaturaMonthly.fatura_id == fatura_id,
            FaturaMonthly.ano == ano,
            FaturaMonthly.mes == mes,
        )
        .first()
    )
    if not record or not record.arquivo_path:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    names = _parse_json_list(record.arquivo_nome)
    paths = _parse_json_list(record.arquivo_path)

    if idx < 0 or idx >= len(paths):
        raise HTTPException(status_code=404, detail="Índice de arquivo inválido")

    file_path = paths[idx]
    file_name = names[idx] if idx < len(names) else os.path.basename(file_path)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no disco")

    return FileResponse(
        file_path,
        filename=file_name,
        media_type="application/octet-stream",
    )


@router.post("/monthly/{fatura_id}/email", response_model=MonthlyOut)
def mark_email_sent(
    fatura_id: int,
    ano: int = Query(...),
    mes: int = Query(...),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    fatura = db.query(Fatura).filter(Fatura.id == fatura_id).first()
    if not fatura:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")

    record = _get_or_create_monthly(db, fatura_id, ano, mes)
    now = datetime.now(timezone.utc).isoformat()
    record.enviada = True
    record.updated_at = now

    db.commit()
    db.refresh(record)
    return record


@router.delete("/monthly/{fatura_id}/reset")
def reset_monthly(
    fatura_id: int,
    ano: int = Query(...),
    mes: int = Query(...),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    record = (
        db.query(FaturaMonthly)
        .filter(
            FaturaMonthly.fatura_id == fatura_id,
            FaturaMonthly.ano == ano,
            FaturaMonthly.mes == mes,
        )
        .first()
    )
    if not record:
        return {"ok": True}

    for path in _parse_json_list(record.arquivo_path):
        if os.path.exists(path):
            os.remove(path)

    db.delete(record)
    db.commit()
    return {"ok": True}


@router.get("/config", response_model=AppConfigOut)
def get_config(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    return _get_app_config(db)


@router.put("/config", response_model=AppConfigOut)
def update_config(
    data: AppConfigUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    payload = data.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail="Nenhuma configuracao enviada")

    if data.public_url is not None:
        _set_config_value(db, "public_url", _normalize_public_url(data.public_url))
    if data.email_subject_template is not None:
        _set_config_value(
            db,
            "email_subject_template",
            _normalize_non_empty(data.email_subject_template, "email_subject_template"),
        )
    if data.email_body_template is not None:
        _set_config_value(
            db,
            "email_body_template",
            _normalize_non_empty(data.email_body_template, "email_body_template"),
        )

    db.commit()
    return _get_app_config(db)


@router.get("/monthly/{fatura_id}/page/{ano}/{mes}", response_class=HTMLResponse)
def download_page(
    fatura_id: int,
    ano: int,
    mes: int,
    db: Session = Depends(get_db),
):
    fatura = db.query(Fatura).filter(Fatura.id == fatura_id).first()
    if not fatura:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")

    record = (
        db.query(FaturaMonthly)
        .filter(
            FaturaMonthly.fatura_id == fatura_id,
            FaturaMonthly.ano == ano,
            FaturaMonthly.mes == mes,
        )
        .first()
    )

    names = _parse_json_list(record.arquivo_nome) if record else []
    mes_name = MONTH_NAMES[mes - 1]
    public_url = _get_public_url(db)

    if not names:
        files_html = '<p style="color:#888;">Nenhum arquivo disponível.</p>'
    else:
        items = []
        for i, name in enumerate(names):
            url = f"{public_url}/api/monthly/{fatura_id}/download?ano={ano}&mes={mes}&idx={i}"
            items.append(
                f'<a href="{url}" '
                f'style="display:inline-flex;align-items:center;gap:8px;padding:12px 20px;'
                f'background:#2e7d5b;color:#fff;border-radius:8px;text-decoration:none;'
                f'font-size:14px;margin:4px 0;" '
                f'download="{name}">'
                f'&#128196; {name}</a>'
            )
        files_html = "".join(items)

    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Download — {fatura.nome} — {mes_name}/{ano}</title>
<style>
  body {{ font-family: 'Segoe UI', sans-serif; background: #f0f4f2; margin: 0; padding: 40px 20px; }}
  .card {{ max-width: 500px; margin: 0 auto; background: #fff; border-radius: 12px;
           box-shadow: 0 2px 12px rgba(0,0,0,0.1); padding: 32px; }}
  h1 {{ font-size: 18px; color: #1a3a2a; margin: 0 0 4px; }}
  .period {{ color: #666; font-size: 14px; margin-bottom: 24px; }}
  .files {{ display: flex; flex-direction: column; gap: 8px; }}
  .footer {{ margin-top: 24px; font-size: 12px; color: #999; text-align: center; }}
</style>
</head>
<body>
  <div class="card">
    <h1>{fatura.nome}</h1>
    <div class="period">{mes_name}/{ano}</div>
    <div class="files">{files_html}</div>
    <div class="footer">Quinta da Baroneza — Departamento de TI</div>
  </div>
</body>
</html>"""
    return HTMLResponse(content=html)
