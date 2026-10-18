# Frente D — Área do explorador (agenda, notificações, perfil, LGPD) e PWA (progresso)

Legenda: [x] feito · [ ] pendente · [~] em andamento

1. [x] Serviço src/server/me (agenda, notificações, perfil/preferências, sessões, exportação, exclusão, push)
2. [x] Server Actions src/server/me/actions.ts
3. [x] /salvos (Minha agenda: Vou · Salvos · Seguindo · Histórico)
4. [x] /notificacoes (lista paginada, marcar lida, marcar todas)
5. [x] /perfil (celular: lista de seções; desktop: navegação lateral)
6. [x] /perfil/conta (nome, foto, cidade, categorias, senha, sessões)
7. [x] /perfil/notificacoes (switches + PushToggle)
8. [x] /perfil/privacidade (explicação LGPD, exportar, excluir conta)
9. [x] API: /api/me/export, /api/push/subscribe, /api/push/unsubscribe
10. [x] PWA: public/sw.js, ServiceWorkerRegister, InstallPrompt, /offline, montagem no (app)/layout
11. [x] Testes integração/unit me-* (32 passando: tests/unit/me-helpers, tests/integration/me-agenda, me-account)
12. [x] QA visual (mobile/desktop, escuro/claro) + fluxos Playwright (abrir notificação, marcar todas, remover da agenda, salvar perfil, upload de foto, exportar, excluir conta, bloqueio por única OWNER, convite iOS, SW offline)

## Observações
- 2026-10-18: início (nenhum arquivo da área existia).
- Código de 1–10 escrito (server/me: helpers, schemas, agenda, service, account, push, actions; páginas; API; PWA).
- Exclusão de conta passou de Server Action para POST /api/me/delete: a Server Action que apaga o cookie re-renderiza a página protegida e redireciona para /entrar antes do aviso; o Route Handler encerra a sessão e o cliente leva à home com toast.
- Corrigido: histórico agrupava tudo em "Hoje" (groupByDay considerava evento sem término como em andamento); abas da agenda transbordavam a 390 px.
- Verificação final: typegen ok; tsc 0 erros; eslint limpo nos arquivos da frente; 33 testes passando (mixtour_test_d).
- Concluído.
