# Segurança

- **Isolamento multi-tenant:** `tenantDb(orgId)` (extensão Prisma) injeta `organizationId` em leituras, atualizações e exclusões e força o valor em criações; relacionamentos recebidos do cliente são validados com `assertOwned`/`assertMember`. Coberto por testes de integração.
- **Autenticação:** sessões opacas (token aleatório de 256 bits, armazenado como HMAC), cookie `__Host-` em produção, HttpOnly, Secure, SameSite=Lax, expiração absoluta e por inatividade, revogação em troca de senha e bloqueio.
- **Autorização:** permissões granulares por papel, verificadas em toda Server Action (`defineAction`) e página (`requireCtx`). Workspaces somente leitura (teste expirado, cancelamento, exclusão agendada, modo suporte) bloqueiam escrita no servidor.
- **Entradas:** validação Zod em todas as ações e rotas; uploads com lista de tipos permitidos e limite de tamanho; exportações neutralizam fórmulas de planilha.
- **Rede:** CSP, HSTS (produção), X-Frame-Options, Referrer-Policy, Permissions-Policy; webhooks só para URLs públicas (bloqueio de IPs internos) e sem seguir redirecionamentos.
- **Segredos:** apenas em variáveis de ambiente; segredos de webhook cifrados com AES-256-GCM; API keys com hash e exibição única.
- **IA:** nunca executa ações sem confirmação; resultados gerados são revisados antes de salvar; pode ser desativada por empresa.
- **Auditoria:** login, permissões, exclusões, alterações financeiras, exportações, cobrança e modo suporte.
