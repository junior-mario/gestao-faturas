import json
import os
import re
import smtplib
import uuid
from html import escape
from datetime import datetime, timezone
from email.message import EmailMessage

import httpx
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

<strong>RESUMO DA FATURA</strong>
{{invoice_table_html}}

<strong>DOWNLOAD</strong>
{{download_link_html}}

Em caso de duvidas, estamos a disposicao.

Atenciosamente,
Departamento de TI
Quinta da Baroneza"""
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASS = os.getenv("SMTP_PASS", "").strip()
SMTP_STARTTLS = os.getenv("SMTP_STARTTLS", "true").lower() in ("1", "true", "yes", "on")
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").lower() in ("1", "true", "yes", "on")
SMTP_FROM = os.getenv("SMTP_FROM", "mario.franco@quintadabaroneza.com.br").strip()
SMTP_TEST_TO = os.getenv("SMTP_TEST_TO", "mario.franco@quintadabaroneza.com.br").strip()
EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "smtp").strip().lower()
GRAPH_TENANT_ID = os.getenv("GRAPH_TENANT_ID", "").strip()
GRAPH_CLIENT_ID = os.getenv("GRAPH_CLIENT_ID", "").strip()
GRAPH_CLIENT_SECRET = os.getenv("GRAPH_CLIENT_SECRET", "").strip()
GRAPH_SENDER = os.getenv("GRAPH_SENDER", "").strip()

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


def _normalize_email_list(value: str, field_name: str = "email_test_to") -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail=f"{field_name} nao pode ser vazio")

    emails = [
        item.strip()
        for item in re.split(r"[,\n;]+", normalized)
        if item and item.strip()
    ]
    if not emails:
        raise HTTPException(status_code=400, detail=f"{field_name} nao pode ser vazio")

    invalid = [
        email
        for email in emails
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email)
    ]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} contem email(s) invalido(s): {', '.join(invalid)}",
        )

    deduped = list(dict.fromkeys(emails))
    return ", ".join(deduped)


def _parse_email_list(value: str, field_name: str = "email_test_to") -> list[str]:
    normalized = _normalize_email_list(value, field_name=field_name)
    return [item.strip() for item in normalized.split(",") if item.strip()]


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


def _get_email_test_to(db: Session) -> str:
    return _get_config_value(
        db,
        "email_test_to",
        SMTP_TEST_TO,
    )


def _get_app_config(db: Session) -> dict[str, str]:
    return {
        "public_url": _get_public_url(db),
        "email_subject_template": _get_email_subject_template(db),
        "email_body_template": _get_email_body_template(db),
        "email_test_to": _get_email_test_to(db),
    }


def _safe_value(value: str | None) -> str:
    if value is None:
        return "-"
    normalized = str(value).strip()
    return normalized if normalized else "-"


def _render_template(template: str, values: dict[str, str]) -> str:
    pattern = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")

    def _replace(match: re.Match[str]) -> str:
        key = match.group(1)
        return values.get(key, "")

    return pattern.sub(_replace, template)


def _build_email_values(
    fatura: Fatura,
    monthly_record: FaturaMonthly | None,
    ano: int,
    mes: int,
    public_url: str,
) -> dict[str, str]:
    mes_name = MONTH_NAMES[mes - 1] if 1 <= mes <= 12 else str(mes)
    periodo = f"{mes_name}/{ano}"
    valor = (
        monthly_record.valor_override
        if monthly_record and monthly_record.valor_override
        else fatura.valor
    )
    has_files = bool(monthly_record and _parse_json_list(monthly_record.arquivo_nome))
    download_link = (
        f"{public_url}/api/monthly/{fatura.id}/page/{ano}/{mes}"
        if has_files
        else "-"
    )
    nome_fatura = _safe_value(fatura.nome)
    periodo_value = periodo
    valor_value = _safe_value(valor)
    conta_value = _safe_value(fatura.conta if fatura.conta != "-" else None)
    emissao_value = _safe_value(monthly_record.emissao if monthly_record else None)
    vencimento_value = _safe_value(monthly_record.vencimento if monthly_record else None)

    invoice_rows = [
        ("Fatura", nome_fatura),
        ("Periodo", periodo_value),
        ("Valor", valor_value),
        ("Conta", conta_value),
        ("Emissao", emissao_value),
        ("Vencimento", vencimento_value),
    ]
    invoice_table_text = "\n".join(
        f"{label.upper()} ............ {value}" for label, value in invoice_rows
    )
    invoice_table_html = (
        "<table style=\"border-collapse:collapse;width:100%;max-width:560px;"
        "font-family:Segoe UI,Arial,sans-serif;font-size:14px;\">"
        + "".join(
            (
                "<tr>"
                "<td style=\"padding:8px 10px;border:1px solid #d7dfdb;"
                "background:#f6faf8;font-weight:600;width:38%;\">"
                f"{escape(label)}"
                "</td>"
                "<td style=\"padding:8px 10px;border:1px solid #d7dfdb;\">"
                f"{escape(value)}"
                "</td>"
                "</tr>"
            )
            for label, value in invoice_rows
        )
        + "</table>"
    )

    return {
        "nome_fatura": nome_fatura,
        "mes_nome": _safe_value(mes_name),
        "ano": str(ano),
        "periodo": periodo,
        "valor": valor_value,
        "conta": conta_value,
        "emissao": emissao_value,
        "vencimento": vencimento_value,
        "download_link": _safe_value(download_link),
        "download_link_html": (
            "-"
            if download_link == "-"
            else f'<a href="{download_link}">{download_link}</a>'
        ),
        "invoice_table_text": invoice_table_text,
        "invoice_table_html": invoice_table_html,
    }


def _build_email_payload(
    fatura: Fatura,
    monthly_record: FaturaMonthly | None,
    ano: int,
    mes: int,
    db: Session,
) -> tuple[str, str, str]:
    config = _get_app_config(db)
    values = _build_email_values(
        fatura=fatura,
        monthly_record=monthly_record,
        ano=ano,
        mes=mes,
        public_url=config["public_url"],
    )

    subject_template = config["email_subject_template"]
    body_template = config["email_body_template"]

    subject = _render_template(subject_template, values)
    text_values = dict(values)
    text_values["download_link_html"] = text_values["download_link"]
    text_values["invoice_table_html"] = text_values["invoice_table_text"]
    text_template = re.sub(r"<[^>]+>", "", body_template)
    text_body = _render_template(text_template, text_values)

    html_template = body_template
    if (
        values["download_link"] != "-"
        and "{{download_link_html}}" not in html_template
        and "{{download_link}}" not in html_template
    ):
        html_template = f"{html_template}\n\nDOWNLOAD\n{{{{download_link_html}}}}"

    html_raw = _render_template(html_template, values)
    html_body = (
        "<html><body style=\"font-family:Segoe UI,Arial,sans-serif;line-height:1.45;\">"
        + "<br>".join(html_raw.splitlines())
        + "</body></html>"
    )

    return subject, text_body, html_body


def _send_smtp_email(
    subject: str,
    text_body: str,
    html_body: str,
    to_emails: list[str],
) -> None:
    if not SMTP_HOST:
        raise HTTPException(
            status_code=400,
            detail="SMTP_HOST nao configurado no backend",
        )
    if not to_emails:
        raise HTTPException(status_code=400, detail="Nenhum destinatario informado")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = ", ".join(to_emails)
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    smtp = None
    try:
        if SMTP_USE_SSL:
            smtp = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20)
        else:
            smtp = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20)
            smtp.ehlo()
            if SMTP_STARTTLS:
                smtp.starttls()
                smtp.ehlo()

        if SMTP_USER and SMTP_PASS:
            smtp.login(SMTP_USER, SMTP_PASS)

        smtp.send_message(msg, to_addrs=to_emails)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Falha ao enviar email HTML de teste: {exc}",
        ) from exc
    finally:
        if smtp is not None:
            try:
                smtp.quit()
            except Exception:
                pass


def _get_graph_access_token() -> str:
    missing = [
        key
        for key, value in (
            ("GRAPH_TENANT_ID", GRAPH_TENANT_ID),
            ("GRAPH_CLIENT_ID", GRAPH_CLIENT_ID),
            ("GRAPH_CLIENT_SECRET", GRAPH_CLIENT_SECRET),
            ("GRAPH_SENDER", GRAPH_SENDER),
        )
        if not value
    ]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Configuracao Graph incompleta: {', '.join(missing)}",
        )

    token_url = f"https://login.microsoftonline.com/{GRAPH_TENANT_ID}/oauth2/v2.0/token"
    payload = {
        "grant_type": "client_credentials",
        "client_id": GRAPH_CLIENT_ID,
        "client_secret": GRAPH_CLIENT_SECRET,
        "scope": "https://graph.microsoft.com/.default",
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(token_url, data=payload)
        resp.raise_for_status()
        token = resp.json().get("access_token")
        if not token:
            raise HTTPException(status_code=500, detail="Graph sem access_token")
        return token
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Falha ao autenticar no Microsoft Graph "
                f"({exc.response.status_code}): {exc.response.text}"
            ),
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Falha ao autenticar no Microsoft Graph: {exc}",
        ) from exc


def _send_graph_email(
    subject: str,
    text_body: str,
    html_body: str,
    to_emails: list[str],
) -> None:
    if not to_emails:
        raise HTTPException(status_code=400, detail="Nenhum destinatario informado")

    token = _get_graph_access_token()
    graph_url = f"https://graph.microsoft.com/v1.0/users/{GRAPH_SENDER}/sendMail"
    payload = {
        "message": {
            "subject": subject,
            "body": {
                "contentType": "HTML",
                "content": html_body,
            },
            "toRecipients": [
                {"emailAddress": {"address": email}}
                for email in to_emails
            ],
        },
        "saveToSentItems": True,
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(
                graph_url,
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
            )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Falha ao enviar email via Microsoft Graph "
                f"({exc.response.status_code}): {exc.response.text}"
            ),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Falha ao enviar email via Microsoft Graph: {exc}",
        ) from exc


def _send_email(
    subject: str,
    text_body: str,
    html_body: str,
    to_emails: list[str],
) -> None:
    if EMAIL_PROVIDER == "graph":
        _send_graph_email(
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            to_emails=to_emails,
        )
        return
    if EMAIL_PROVIDER == "smtp":
        _send_smtp_email(
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            to_emails=to_emails,
        )
        return
    if EMAIL_PROVIDER == "auto":
        graph_ready = all(
            [GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_SENDER]
        )
        if graph_ready:
            _send_graph_email(
                subject=subject,
                text_body=text_body,
                html_body=html_body,
                to_emails=to_emails,
            )
        else:
            _send_smtp_email(
                subject=subject,
                text_body=text_body,
                html_body=html_body,
                to_emails=to_emails,
            )
        return
    raise HTTPException(
        status_code=400,
        detail="EMAIL_PROVIDER invalido. Use smtp, graph ou auto.",
    )


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
    subject, text_body, html_body = _build_email_payload(
        fatura=fatura,
        monthly_record=record,
        ano=ano,
        mes=mes,
        db=db,
    )
    config = _get_app_config(db)
    recipients = _parse_email_list(config["email_test_to"])
    _send_email(
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        to_emails=recipients,
    )

    now = datetime.now(timezone.utc).isoformat()
    record.enviada = True
    record.updated_at = now

    db.commit()
    db.refresh(record)
    return record


@router.post("/monthly/{fatura_id}/email-html-test")
def send_html_test_email(
    fatura_id: int,
    ano: int = Query(...),
    mes: int = Query(...),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    fatura = db.query(Fatura).filter(Fatura.id == fatura_id).first()
    if not fatura:
        raise HTTPException(status_code=404, detail="Fatura nao encontrada")

    record = (
        db.query(FaturaMonthly)
        .filter(
            FaturaMonthly.fatura_id == fatura_id,
            FaturaMonthly.ano == ano,
            FaturaMonthly.mes == mes,
        )
        .first()
    )

    subject, text_body, html_body = _build_email_payload(
        fatura=fatura,
        monthly_record=record,
        ano=ano,
        mes=mes,
        db=db,
    )
    config = _get_app_config(db)
    test_recipients = _parse_email_list(config["email_test_to"])
    _send_email(
        subject=f"[TESTE HTML] {subject}",
        text_body=text_body,
        html_body=html_body,
        to_emails=test_recipients,
    )
    return {"ok": True, "to": ", ".join(test_recipients)}


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
    if data.email_test_to is not None:
        _set_config_value(
            db,
            "email_test_to",
            _normalize_email_list(data.email_test_to, "email_test_to"),
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
