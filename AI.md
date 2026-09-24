# Inteligência Artificial — JR Cortex AI

## Regra central

> **A IA não pode inventar números.** Todo número é calculado ou recuperado da base. Sem dados suficientes, a resposta é: *"Não existem dados suficientes para responder essa pergunta."*

## Fluxo seguro

```
Usuário pergunta
  ↓ sanitização, rate limit, permissão chat:use
Identificação de intenção        (LLM com tool calling OU planejador determinístico por regras)
  ↓
Seleção das ferramentas internas (máx. 4; somente as permitidas ao papel do usuário)
  ↓
Execução de consultas internas   (camada analítica; SQL parametrizado, tenantId obrigatório)
  ↓
Resultados estruturados + cálculos + metadados (período, fontes, atualização, filtros, memória de cálculo)
  ↓
Narrativa determinística (sempre gerada)
  ↓ (opcional, com consentimento do tenant)
LLM redige a partir de FATOS mínimos (nunca a base bruta)
  ↓
Verificação anti-alucinação: todo número do texto deve existir nos fatos (tolerância de arredondamento)
  ↓ reprovado → usa narrativa determinística e registra o motivo no trace
Resposta + blocos (KPIs, tabelas, gráficos, DRE) + "Ver cálculo" + feedback
```

A IA **nunca** gera SQL. Não existe ferramenta de consulta livre.

## Ferramentas internas (`src/server/ai/tools.ts`)

| Ferramenta | Permissão | Descrição |
|---|---|---|
| `getCompanyOverview` | dashboard:view | "Como está minha empresa?" — resultado, comercial, caixa, margens, atenção, oportunidades |
| `getSales` | sales:view | Faturamento, receita, vendas, ticket, margem, clientes ativos/novos/recorrentes |
| `getRevenue` | dre:view | Receita bruta/líquida e composição |
| `getExpenses` / `getExpensesByCategory` | dre:view | Por categoria ou tendência (3 meses vs. 3 anteriores) |
| `getCashFlow` | cashflow:view | Saldo atual, contas, entradas × saídas |
| `forecastCashFlow` | cashflow:view | Caixa dia a dia (PREVISTO), maior entrada/saída, menor saldo, dias de atenção, risco |
| `getAccountsReceivable` | receivables:view | A receber, vencidos, inadimplentes, semana/mês |
| `getAccountsPayable` | payables:view | A pagar, vencimentos nos próximos N dias |
| `getCustomers` / `getSalesByCustomer` | customers:view | top, bottom, aumentaram, reduziram, inativos, concentração, margem, atenção |
| `getProducts` / `getSalesByProduct` | products:view | ranking, margem, margem baixa, crescimento, queda |
| `getSalesBySeller` | sellers:view | desempenho de vendedores |
| `getDRE` | dre:view | DRE completo com % da receita e comparação |
| `comparePeriods` | dre:view | período anterior, mesmo período do ano anterior ou personalizado |
| `getMargins` | dre:view | margens e evolução mensal |
| `getFinancialIndicators` | dre:view | indicadores consolidados |
| `forecastRevenue` | forecasts:view | receita/despesas/resultado até um mês alvo (PROJETADO) |
| `analyzeVariance` | dre:view | análise crítica: aumentos, reduções, despesas fora do padrão, margens, hipóteses, tendências |
| `getInventory` | products:view | posição de estoque por movimentações |
| `getInsights` | insights:view | pontos de atenção e oportunidades |
| `getKnowledge` | chat:use | Cortex Knowledge (definições, políticas, metas) |

Cada ferramenta tem schema Zod (validação da entrada vinda do LLM) e JSON Schema equivalente enviado ao provedor.

## Hipóteses e causalidade

A análise (`analytics/dre-analysis.ts`) só gera hipóteses a partir de regras com evidência numérica e sempre no formato *"Uma possível explicação é..."*. Exemplos: queda de clientes ativos, queda de ticket, custos crescendo acima da receita, aumento de descontos, crescimento de despesas operacionais, redução de compras de um grande cliente.

## Insights

`analytics/insights.ts` — regras objetivas com limiares de materialidade (receita ±5%/10%/25%, margem ±1/2/5 p.p., despesas +15% com materialidade mínima, clientes −30% com relevância ≥2% da receita, concentração top 5 ≥40%/60%, caixa abaixo do mínimo/negativo, inadimplência ≥10%/25%, produto com margem <20% e participação ≥3%, meta proporcional). Cada insight guarda a evidência e tem `fingerprint` único (sem duplicação).

## Provedores (`src/server/ai/providers`)

Interface `AIProvider` com dois métodos: `planTools` (escolher ferramentas) e `narrate` (redigir a partir de fatos).

| `AI_PROVIDER` | Implementação | Variáveis |
|---|---|---|
| `rules` (padrão) | Motor determinístico interno — sem envio de dados a terceiros | — |
| `claude` | `ClaudeProvider` (SDK oficial `@anthropic-ai/sdk`, modelo padrão `claude-opus-5`, tool use com `tool_choice: auto`, fallback de recusa no servidor) | `ANTHROPIC_API_KEY`, `AI_MODEL` opcional |
| `openai` | `OpenAICompatibleProvider` (Chat Completions + tools) | `OPENAI_API_KEY`, `AI_MODEL` |
| `gemini` | `GeminiProvider` (generateContent + functionDeclarations) | `GOOGLE_AI_API_KEY`, `AI_MODEL` |
| `local` | `OpenAICompatibleProvider` apontando para Ollama/vLLM/LM Studio | `LOCAL_LLM_URL`, `AI_MODEL` |

Se o provedor falhar, não selecionar ferramentas ou produzir número não rastreável, o sistema volta ao motor determinístico e registra o motivo no trace.

### Consentimento (LGPD)
Mesmo com chave configurada, o provedor externo só é usado quando o administrador do cliente habilita **Configurações → Privacidade → Autorizo o envio de fatos agregados mínimos**. Dados nunca são usados para treinamento externo (`allowExternalAiTraining` permanece `false`). O uso é registrado em `AIUsage` (tokens por recurso) e aparece no JR Admin.

## Memória organizacional (Cortex Knowledge)
Itens estruturados, versionados e auditados (definições de indicadores, regras contábeis, plano de contas, metas, políticas, sistemas, contexto). A IA consulta por busca de palavras-chave; **não há aprendizado automático** a partir dos dados privados.

## Feedback
👍 Útil, 👎 Não útil e "Corrigir resposta" ficam em `MessageFeedback`. São usados para revisar regras, prompts e UX — **nunca** alteram dados financeiros.

## Rastreabilidade
Toda resposta salva o `trace` (planejador, ferramentas e entradas, narrador, rejeições, períodos, comparações, fontes, última atualização, filtros, memória de cálculo). O botão **Ver cálculo** exibe essas informações ao usuário.

## Testar via CLI
```bash
npx tsx --env-file=.env scripts/ask.ts "Como está minha empresa?" "Qual será meu caixa na próxima semana?"
ROLE=COMERCIAL npx tsx --env-file=.env scripts/ask.ts "Monte o DRE"   # deve negar
```
