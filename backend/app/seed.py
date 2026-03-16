from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import Fatura

FATURAS_INICIAIS = [
    {"nome": "Vivo Móvel 5 linhas", "conta": "453765143", "valor": "R$ 219,00", "moeda": "BRL", "valor_num": 219.00, "dia": 6, "grupo": "Vivo"},
    {"nome": "Vivo Móvel 105 linhas", "conta": "360833957", "valor": "R$ 5.142,37", "moeda": "BRL", "valor_num": 5142.37, "dia": 7, "grupo": "Vivo"},
    {"nome": "Anti DDoS", "conta": "433119662", "valor": "R$ 3.830,00", "moeda": "BRL", "valor_num": 3830.00, "dia": 18, "grupo": "Telecom"},
    {"nome": "Monitora Dados 1Gb", "conta": "445060708", "valor": "R$ 272,00", "moeda": "BRL", "valor_num": 272.00, "dia": 18, "grupo": "Telecom"},
    {"nome": "Monitora Dados 400Mb", "conta": "445060714", "valor": "R$ 261,00", "moeda": "BRL", "valor_num": 261.00, "dia": 18, "grupo": "Telecom"},
    {"nome": "IP Dedicado 1Gb", "conta": "445060704", "valor": "R$ 24.365,45", "moeda": "BRL", "valor_num": 24365.45, "dia": 18, "grupo": "Telecom"},
    {"nome": "IP Dedicado 400Mb", "conta": "445060710", "valor": "R$ 6.140,14", "moeda": "BRL", "valor_num": 6140.14, "dia": 18, "grupo": "Telecom"},
    {"nome": "Vivo Plataforma Digital (M365)", "conta": "TIA-1-01068166", "valor": "R$ 11.082,55", "moeda": "BRL", "valor_num": 11082.55, "dia": 27, "grupo": "Vivo"},
    {"nome": "Vivo Voz Corporativo", "conta": "2490-2000", "valor": "R$ 5.270,00", "moeda": "BRL", "valor_num": 5270.00, "dia": 19, "grupo": "Vivo"},
    {"nome": "Vivo Managed Security (Firewall)", "conta": "457640718", "valor": "R$ 3.287,65", "moeda": "BRL", "valor_num": 3287.65, "dia": 6, "grupo": "Vivo"},
    {"nome": "Azure Suporte", "conta": "SI 530034434", "valor": "R$ 177,67", "moeda": "BRL", "valor_num": 177.67, "dia": 9, "grupo": "Cloud"},
    {"nome": "Azure Backup", "conta": "SI 530034434", "valor": "R$ 12.280,07", "moeda": "BRL", "valor_num": 12280.07, "dia": 9, "grupo": "Cloud"},
    {"nome": "Digital Ocean", "conta": "SI 530034357", "valor": "$ 734,30", "moeda": "USD", "valor_num": 734.30, "dia": 1, "grupo": "Cloud"},
    {"nome": "G-Suite", "conta": "SI 530034358", "valor": "R$ 324,80", "moeda": "BRL", "valor_num": 324.80, "dia": 1, "grupo": "SaaS"},
    {"nome": "Tenorshare (1)", "conta": "SI 530034436", "valor": "$ 29,95", "moeda": "USD", "valor_num": 29.95, "dia": 29, "grupo": "SaaS"},
    {"nome": "Tenorshare (2)", "conta": "SI 530034436", "valor": "$ 19,95", "moeda": "USD", "valor_num": 19.95, "dia": 29, "grupo": "SaaS"},
    {"nome": "Trae", "conta": "-", "valor": "$ 3,00", "moeda": "USD", "valor_num": 3.00, "dia": 12, "grupo": "SaaS"},
    {"nome": "Notion", "conta": "-", "valor": "$ 48,00", "moeda": "USD", "valor_num": 48.00, "dia": 12, "grupo": "SaaS"},
    {"nome": "Dyad", "conta": "-", "valor": "$ 30,00", "moeda": "USD", "valor_num": 30.00, "dia": 13, "grupo": "SaaS"},
    {"nome": "SupaBase", "conta": "-", "valor": "$ 37,57", "moeda": "USD", "valor_num": 37.57, "dia": 16, "grupo": "SaaS"},
    {"nome": "Claude", "conta": "-", "valor": "R$ 660,00", "moeda": "BRL", "valor_num": 660.00, "dia": 24, "grupo": "SaaS"},
]


def seed_faturas(db: Session) -> bool:
    count = db.query(Fatura).count()
    if count > 0:
        return False

    now = datetime.now(timezone.utc).isoformat()
    for data in FATURAS_INICIAIS:
        fatura = Fatura(**data, ativo=True, created_at=now)
        db.add(fatura)

    db.commit()
    return True
