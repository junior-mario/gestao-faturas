# Guia de Conexao de Email (SMTP + Microsoft Graph)

## Objetivo
Este documento centraliza todas as instrucoes para implementar o recurso de envio de email usado neste projeto em outros projetos.

## ATENCAO (Seguranca)
Este arquivo **nao** deve conter credenciais reais em repositorio.
- Use placeholders no versionamento.
- Configure os valores reais apenas no `.env` local/seguro.
- Se houver exposicao acidental, rotacione imediatamente as credenciais.

## Arquitetura usada no projeto
- Backend: FastAPI
- Transporte de email:
  - `EMAIL_PROVIDER=graph` (padrao atual em producao deste projeto)
  - suporta fallback para SMTP (`EMAIL_PROVIDER=smtp` ou `auto`)
- Destinatarios:
  - Configurados dinamicamente no sistema via configuracao `email_test_to`
  - Campo na UI: `Destinatario(s) dos emails (envio e teste)`
- Frontend:
  - Botao `Email` envia via backend (`/api/monthly/{id}/email`)
  - Botao `Teste HTML` envia via backend (`/api/monthly/{id}/email-html-test`)

## Credenciais e variaveis em uso neste projeto
Conteudo atual do `.env`:

```env
# Banco e arquivos
DATABASE_URL=sqlite:///./data/faturas.db
UPLOAD_DIR=/app/uploads

# URL publica usada para montar o link de download no email
PUBLIC_URL=https://seu-dominio-ou-ip

# Login inicial (bootstrap)
AUTH_USERNAME=<usuario_admin_inicial>
AUTH_PASSWORD=<senha_admin_inicial>
AUTH_SECRET=<chave_secreta_forte>
AUTH_TOKEN_TTL_HOURS=12
AUTH_PASSWORD_ITERATIONS=200000

# SMTP
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=<email_remetente@dominio.com>
SMTP_PASS=<senha_ou_app_password>
SMTP_STARTTLS=true
SMTP_USE_SSL=false
SMTP_FROM=<email_remetente@dominio.com>

# Destinatario padrao inicial (fallback)
SMTP_TEST_TO=<email_destino@dominio.com>

# Provedor de envio: smtp | graph | auto
EMAIL_PROVIDER=graph

# Microsoft Graph (OAuth2 / client credentials)
GRAPH_TENANT_ID=<tenant_id>
GRAPH_CLIENT_ID=<client_id>
GRAPH_CLIENT_SECRET=<client_secret_value>
GRAPH_SENDER=<email_remetente@dominio.com>
```

## Configuracao de ambiente no Docker Compose
As variaveis sao injetadas no backend por `docker-compose.yml`:

```yaml
environment:
  - SMTP_HOST=${SMTP_HOST:-}
  - SMTP_PORT=${SMTP_PORT:-587}
  - SMTP_USER=${SMTP_USER:-}
  - SMTP_PASS=${SMTP_PASS:-}
  - SMTP_STARTTLS=${SMTP_STARTTLS:-true}
  - SMTP_USE_SSL=${SMTP_USE_SSL:-false}
  - SMTP_FROM=${SMTP_FROM:-mario.franco@quintadabaroneza.com.br}
  - SMTP_TEST_TO=${SMTP_TEST_TO:-mario.franco@quintadabaroneza.com.br}
  - EMAIL_PROVIDER=${EMAIL_PROVIDER:-smtp}
  - GRAPH_TENANT_ID=${GRAPH_TENANT_ID:-}
  - GRAPH_CLIENT_ID=${GRAPH_CLIENT_ID:-}
  - GRAPH_CLIENT_SECRET=${GRAPH_CLIENT_SECRET:-}
  - GRAPH_SENDER=${GRAPH_SENDER:-}
```

## Fluxo de envio implementado
1. Usuario configura destinatario(s) na tela de configuracao (`email_test_to`).
2. Usuario clica em:
   - `Email`: envia email real e marca fatura como enviada.
   - `Teste HTML`: envia email de teste com prefixo `[TESTE HTML]`.
3. Backend monta assunto/corpo a partir do template salvo e dispara via:
   - Microsoft Graph (quando `EMAIL_PROVIDER=graph`)
   - SMTP (quando `EMAIL_PROVIDER=smtp`)
   - `auto` tenta Graph e cai para SMTP se Graph nao estiver configurado.

## Endpoints de referencia
- `GET /api/config`
  - Retorna configuracoes incluindo `email_test_to`.
- `PUT /api/config`
  - Atualiza configuracoes (inclui `email_test_to`, templates etc.).
- `POST /api/monthly/{fatura_id}/email?ano=YYYY&mes=MM`
  - Envia email normal (backend) e marca enviada.
- `POST /api/monthly/{fatura_id}/email-html-test?ano=YYYY&mes=MM`
  - Envia email de teste HTML.

## Campo de destinatarios
- Chave persistida: `email_test_to`
- Formato aceito:
  - separado por virgula `,`
  - ponto e virgula `;`
  - quebra de linha
- O backend valida formato de email e remove duplicados.

## Requisitos no Azure (Microsoft Graph)
No App Registration:
1. Permissao `Microsoft Graph -> Mail.Send` (Application).
2. Admin consent aplicado.
3. `GRAPH_SENDER` deve ser mailbox valida para envio.
4. `GRAPH_CLIENT_SECRET` deve ser o **Value** do secret (nao o ID).

## Erros comuns e diagnostico rapido
- `AADSTS7000215 invalid_client`:
  - `GRAPH_CLIENT_SECRET` invalido/expirado ou foi usado o Secret ID.
- `SMTP_HOST nao configurado no backend`:
  - faltam variaveis SMTP e `EMAIL_PROVIDER` esta em `smtp` (ou `auto` sem Graph valido).
- Multiplo envio por clique:
  - no frontend atual os botoes `Email` e `Teste HTML` ficam bloqueados durante envio para evitar clique duplicado.

## Passo a passo para replicar em outro projeto
1. Copiar variaveis de email para `.env`.
2. Injetar variaveis no container backend.
3. Implementar servico de envio com 3 modos: `smtp`, `graph`, `auto`.
4. Criar tela de configuracao para:
   - `public_url`
   - templates de email
   - `email_test_to`
5. Expor endpoints de envio:
   - envio normal
   - envio de teste HTML
6. Adicionar bloqueio de clique durante envio no frontend.

## Comandos uteis
```powershell
# Subir/rebuild
docker compose up -d --build

# Ver containers
docker compose ps

# Ver logs do backend
docker compose logs --tail=100 backend
```
