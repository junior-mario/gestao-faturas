from pydantic import BaseModel


class FaturaBase(BaseModel):
    nome: str
    conta: str = "-"
    valor: str
    moeda: str = "BRL"
    valor_num: float
    dia: int
    grupo: str


class FaturaCreate(FaturaBase):
    pass


class FaturaUpdate(BaseModel):
    nome: str | None = None
    conta: str | None = None
    valor: str | None = None
    moeda: str | None = None
    valor_num: float | None = None
    dia: int | None = None
    grupo: str | None = None


class FaturaOut(FaturaBase):
    id: int
    ativo: bool
    created_at: str

    model_config = {"from_attributes": True}


class MonthlyUpdate(BaseModel):
    valor_override: str | None = None
    emissao: str | None = None
    vencimento: str | None = None


class MonthlyOut(BaseModel):
    id: int
    fatura_id: int
    ano: int
    mes: int
    valor_override: str | None = None
    emissao: str | None = None
    vencimento: str | None = None
    arquivo_nome: str | None = None
    arquivos: list[str] = []
    enviada: bool
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class FaturaWithMonthly(FaturaOut):
    monthly: MonthlyOut | None = None


class StatsOut(BaseModel):
    total: int
    pendentes: int
    anexadas: int
    enviadas: int


class PublicUrlOut(BaseModel):
    public_url: str


class PublicUrlUpdate(BaseModel):
    public_url: str


class AppConfigOut(BaseModel):
    public_url: str
    email_subject_template: str
    email_body_template: str


class AppConfigUpdate(BaseModel):
    public_url: str | None = None
    email_subject_template: str | None = None
    email_body_template: str | None = None


class AuthLoginIn(BaseModel):
    username: str
    password: str


class AuthTokenOut(BaseModel):
    access_token: str
    token_type: str
    expires_at: str


class AuthMeOut(BaseModel):
    id: int
    username: str
    is_admin: bool


class AuthChangePasswordIn(BaseModel):
    old_password: str
    new_password: str


class UserCreateIn(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool
    created_at: str

    model_config = {"from_attributes": True}


class UserPasswordUpdateIn(BaseModel):
    new_password: str
