from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Fatura
from app.routers.auth import get_current_user
from app.schemas import FaturaCreate, FaturaUpdate, FaturaOut, StatsOut
from app.seed import seed_faturas

router = APIRouter()


@router.get("/faturas", response_model=list[FaturaOut])
def list_faturas(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    return db.query(Fatura).filter(Fatura.ativo == True).order_by(Fatura.dia).all()


@router.post("/faturas", response_model=FaturaOut, status_code=201)
def create_fatura(
    data: FaturaCreate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    fatura = Fatura(
        **data.model_dump(),
        ativo=True,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(fatura)
    db.commit()
    db.refresh(fatura)
    return fatura


@router.put("/faturas/{fatura_id}", response_model=FaturaOut)
def update_fatura(
    fatura_id: int,
    data: FaturaUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    fatura = db.query(Fatura).filter(Fatura.id == fatura_id).first()
    if not fatura:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(fatura, key, value)

    db.commit()
    db.refresh(fatura)
    return fatura


@router.delete("/faturas/{fatura_id}")
def delete_fatura(
    fatura_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    fatura = db.query(Fatura).filter(Fatura.id == fatura_id).first()
    if not fatura:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")

    fatura.ativo = False
    db.commit()
    return {"ok": True}


@router.get("/stats", response_model=StatsOut)
def get_stats(
    ano: int,
    mes: int,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    from app.models import FaturaMonthly

    faturas = db.query(Fatura).filter(Fatura.ativo == True).all()
    total = len(faturas)
    fatura_ids = [f.id for f in faturas]

    monthly_records = (
        db.query(FaturaMonthly)
        .filter(
            FaturaMonthly.fatura_id.in_(fatura_ids),
            FaturaMonthly.ano == ano,
            FaturaMonthly.mes == mes,
        )
        .all()
    )

    monthly_map = {m.fatura_id: m for m in monthly_records}
    enviadas = sum(1 for m in monthly_records if m.enviada)
    anexadas = sum(
        1 for m in monthly_records if m.arquivo_nome and not m.enviada
    )
    pendentes = total - enviadas - anexadas

    return StatsOut(
        total=total, pendentes=pendentes, anexadas=anexadas, enviadas=enviadas
    )


@router.post("/seed")
def run_seed(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    inserted = seed_faturas(db)
    if inserted:
        return {"ok": True, "message": "Dados iniciais inseridos."}
    return {"ok": False, "message": "Dados já existem."}
