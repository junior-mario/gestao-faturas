from sqlalchemy import Column, Integer, Text, Float, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class Fatura(Base):
    __tablename__ = "faturas"

    id = Column(Integer, primary_key=True, autoincrement=True)
    nome = Column(Text, nullable=False)
    conta = Column(Text, nullable=False, default="-")
    valor = Column(Text, nullable=False)
    moeda = Column(Text, nullable=False, default="BRL")
    valor_num = Column(Float, nullable=False)
    dia = Column(Integer, nullable=False)
    grupo = Column(Text, nullable=False)
    ativo = Column(Boolean, nullable=False, default=True)
    created_at = Column(Text, nullable=False)

    monthly = relationship("FaturaMonthly", back_populates="fatura")


class FaturaMonthly(Base):
    __tablename__ = "fatura_monthly"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fatura_id = Column(Integer, ForeignKey("faturas.id"), nullable=False)
    ano = Column(Integer, nullable=False)
    mes = Column(Integer, nullable=False)
    valor_override = Column(Text, nullable=True)
    emissao = Column(Text, nullable=True)
    vencimento = Column(Text, nullable=True)
    arquivo_nome = Column(Text, nullable=True)
    arquivo_path = Column(Text, nullable=True)
    enviada = Column(Boolean, nullable=False, default=False)
    created_at = Column(Text, nullable=False)
    updated_at = Column(Text, nullable=False)

    fatura = relationship("Fatura", back_populates="monthly")

    __table_args__ = (
        UniqueConstraint("fatura_id", "ano", "mes", name="uq_fatura_month"),
    )


class AppConfig(Base):
    __tablename__ = "app_config"

    key = Column(Text, primary_key=True)
    value = Column(Text, nullable=False)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(Text, nullable=False, unique=True)
    password_hash = Column(Text, nullable=False)
    is_admin = Column(Boolean, nullable=False, default=False)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(Text, nullable=False)
    updated_at = Column(Text, nullable=False)
