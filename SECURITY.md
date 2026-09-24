# Segurança — JR Cortex AI

## Autenticação e sessões
- Senhas com **bcrypt (custo 12)**; política mínima de 10 caracteres com letras e números.
- Sessões em banco: cookie `jrc_session` **httpOnly**, `SameSite=Lax`, `Secure` em produção. O banco guarda apenas o **HMAC-SHA256** do token (`AUTH_SECRET`), nunca o token.
- **Timeout** por inatividade (`SESSION_IDLE_TIMEOUT_MINUTES`, padrão 30) e expiração absoluta (`SESSION_MAX_AGE_HOURS`, padrão 12).
- Bloqueio temporário após 5 tentativas inválidas (15 min); tempo de resposta equalizado para usuários inexistentes (evita enumeração).
- Sessões são revogadas ao desativar usuário ou trocar seu papel.

## Autorização (RBAC)
Papéis: `SUPER_ADMIN`, `ADMIN_CLIENTE`, `DIRETOR`, `FINANCEIRO`, `COMERCIAL`, `ANALISTA`, `VIEWER`, com permissões por módulo (`src/server/auth/permissions.ts`), persistidas em `Role/Permission/RolePermission`.

- Páginas: `requirePage(permission)`; APIs: `requireApi(permission)`; ferramentas da IA: permissão própria por ferramenta.
- Dados sensíveis (ex.: **folha salarial**) exigem `payroll:view`; sem ela, despesas de pessoal aparecem agregadas como "Pessoal (detalhe restrito)" no DRE, relatórios e chat.
- Tentativas negadas são registradas (`access.denied`) no audit log.
- **SUPER_ADMIN (JR Admin)** vê apenas metadados operacionais. Acesso aos dados de um cliente exige `SupportAccessGrant` criado pelo próprio cliente (motivo + prazo), é somente leitura e auditado (`support.enter/exit`).

## Isolamento entre empresas (tenant isolation)
- Contexto de tenant derivado exclusivamente da sessão.
- Todas as consultas incluem `tenantId`; SQL bruto usa `Prisma.sql` parametrizado e tabelas em whitelist.
- Extensão Prisma `tenantDb()` injeta `tenantId` como defesa em profundidade.
- Testes automatizados de isolamento.

## Proteções de aplicação
| Ameaça | Mitigação |
|---|---|
| SQL Injection | Prisma + consultas parametrizadas; nenhum SQL gerado por IA ou usuário |
| CSRF | Verificação de `Origin` × host em toda rota mutável (`apiRoute`); cookies `SameSite=Lax`; Server Actions com checagem nativa |
| XSS | React escapa por padrão; renderizador markdown próprio sem HTML; CSP restritiva; sanitização de textos livres |
| Clickjacking | `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| Injeção de fórmulas (CSV/Excel) | `neutralizeFormula` em exportações |
| SSRF (API REST) | Somente HTTPS; hosts privados/metadata bloqueados; timeouts |
| Upload malicioso | Extensão/tamanho validados, parsing isolado, limite de linhas |
| Abuso | Rate limiting por IP/usuário (login, cadastro, chat, importação, exportação) |
| Vazamento em logs | Logger estruturado com redação automática de campos sensíveis |

Cabeçalhos: HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`; `poweredByHeader` desativado.

> O rate limiter é em memória (instância única). Em múltiplas instâncias, troque o store por Redis (interface em `src/server/security/rate-limit.ts`).

## Credentials Vault
Senhas/tokens de sistemas externos **nunca** ficam em texto puro: AES-256-GCM com `ENCRYPTION_KEY` (32 bytes base64), IV aleatório e AAD vinculada a tenant/integração/chave. Campo `keyVersion` preparado para rotação de chave. Credenciais só são decifradas no motor de sincronização e nunca retornam ao navegador.

## Validação
Toda entrada de API é validada com **Zod**; registros de conectores e planilhas passam pelos schemas canônicos antes da gravação. Erros retornam 422 com a lista de problemas.

## Auditoria
`AuditLog` registra usuário, data, ação, recurso, empresa, IP, user-agent e resultado. Exemplos: `auth.login`, `dre.viewed`, `cashflow.viewed`, `customers.viewed`, `report.exported`, `chat.question`, `chat.feedback`, `integration.created/updated/synced/tested/deleted`, `import.uploaded/processed`, `insights.generated`, `user.created/updated`, `knowledge.*`, `settings.*`, `privacy.*`, `support.*`, `admin.*`, `access.denied`. Consulta paginada e filtrável em **Auditoria**.

## Privacidade (LGPD)
- **Controle de acesso** por papel e permissão.
- **Minimização**: a IA recebe apenas fatos agregados necessários; nenhum provedor externo sem consentimento do cliente.
- **Treinamento externo**: sempre desabilitado.
- **Retenção** configurável (`dataRetentionDays`): a rotina agendada remove conversas, arquivos brutos importados e histórico de relatórios mais antigos que o prazo; dados financeiros só são excluídos por ação explícita do cliente.
- **Exportação** (portabilidade) em JSON e **exclusão** dos dados empresariais, ambas auditadas.
- Dados demonstrativos isolados no tenant JR Demo e sinalizados em todas as telas e relatórios.

## Variáveis sensíveis
`AUTH_SECRET`, `ENCRYPTION_KEY`, chaves de IA e `CRON_SECRET` apenas em variáveis de ambiente/secret manager. `.env` está no `.gitignore`; `.env.example` não contém valores reais.

## Reportar vulnerabilidades
Envie para a equipe de segurança da JR Consultorias. Não abra issues públicas com detalhes exploráveis.
