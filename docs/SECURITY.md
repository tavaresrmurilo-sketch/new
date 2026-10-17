# Segurança e privacidade

## Autenticação e sessões
- Senhas com bcrypt (custo 12); política: ≥ 8 caracteres, letras e números, bloqueio de senhas comuns.
- Sessões opacas: o cookie (`__Host-mx_session` em produção — `HttpOnly`, `Secure`, `SameSite=Lax`) guarda um token aleatório de 256 bits; o banco guarda apenas o **HMAC-SHA256** do token. Expiração deslizante (padrão 30 dias), revogação por dispositivo e de todas as sessões ao trocar/redefinir senha ou suspender a conta.
- Tokens de verificação de e-mail e de redefinição de senha: uso único, consumo atômico, HMAC no banco, validade de 48 h / 1 h; pedidos anteriores são invalidados.
- Respostas sem enumeração de contas na recuperação de senha; tempo de resposta equalizado no login.
- Google OAuth com `state` + PKCE (S256) em cookie HttpOnly de curta duração; vínculo a conta existente só com e-mail verificado pelo Google.

## Autorização
- Toda Server Action e Route Handler verifica a sessão e o papel **no servidor** (`assertUser`, `assertAdmin`, `assertOrgRole`). IDs vindos do cliente nunca são confiados sem checagem de posse.
- Papéis por organização: OWNER > ADMIN > EDITOR. Administradores da plataforma só existem via variáveis de ambiente/seed.
- Regras de visibilidade pública centralizadas (`src/server/events/visibility.ts`): rascunhos, eventos em análise/recusados e organizações suspensas nunca aparecem publicamente.

## Proteções da aplicação
- **CSRF**: Server Actions validam a origem nativamente; Route Handlers que alteram estado exigem mesma origem (`isSameOrigin`).
- **Rate limiting** compartilhado entre instâncias (PostgreSQL, janela fixa) em login, cadastro, recuperação de senha, uploads, geocodificação, denúncias, engajamento, convites e checkout.
- **Cabeçalhos**: Content-Security-Policy restritiva (origens de mapa e imagens calculadas do ambiente), `frame-ancestors 'none'`, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (geolocalização só na própria origem), COOP.
- **Uploads**: validação pelo conteúdo (sharp), limite de 8 MB e 50 MP, reencode para WebP (remove EXIF/GPS), nomes aleatórios, servidos com `nosniff` e CSP `sandbox`.
- **Conteúdo de usuário** é sempre renderizado como texto; links em descrições recebem `rel="nofollow ugc noopener noreferrer"`; só URLs `http(s)` são aceitas.
- **Redirecionamentos** internos validados (`safeNextPath`) contra open redirect; o link de ingressos passa por `/r/<id>` apenas para URLs http(s) de eventos públicos.
- **Webhooks do Stripe** com verificação de assinatura e idempotência por ID de evento.
- **Rotinas agendadas** protegidas por `CRON_SECRET` (comparação em tempo constante).
- **Auditoria** (`AuditLog`) de login, cadastro, mudanças de senha, moderação, papéis, planos e exclusão de conta.

## LGPD
- Coleta mínima; métricas de visualização usam um hash diário rotativo (sem guardar IP); denúncias anônimas guardam apenas hash do IP.
- Titular pode **baixar seus dados** (JSON) e **excluir a conta** (anonimização irreversível) em `/perfil/privacidade`.
- Cookies apenas estritamente necessários (sessão, organização ativa, tema) — sem rastreadores de terceiros.
- Rotina de manutenção apaga sessões expiradas, tokens antigos, marcas de visualização (> 3 dias) e cache de geocodificação (> 90 dias).
- Textos de `/termos` e `/privacidade` são uma versão inicial e devem ser revisados por assessoria jurídica antes do lançamento.

## Limitações conhecidas / próximos passos
- `script-src 'unsafe-inline'` é necessário para a hidratação do Next.js sem CSP com nonce (que tornaria todas as páginas dinâmicas sem cache). Avaliar nonce quando o cache de páginas públicas não for relevante.
- 2FA para contas de organizadores e administradores ainda não implementado.
- O limitador de taxa em PostgreSQL é adequado ao volume inicial; com tráfego alto, migrar para Redis (Upstash) mantendo a mesma interface (`rateLimit(name, subject)`).

## Como reportar vulnerabilidades
Envie para **seguranca@mixtour.app** com passos para reproduzir. Não teste contra dados de outros usuários.
