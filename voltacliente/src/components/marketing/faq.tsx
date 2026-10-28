import { ChevronDownIcon } from "lucide-react";

export const FAQ_ITEMS = [
  {
    q: "Preciso cadastrar cartão de crédito para começar?",
    a: "Não. A conta é criada só com nome, e-mail e senha. Durante o período de lançamento não há cobrança.",
  },
  {
    q: "O VoltaCliente envia mensagens automaticamente?",
    a: "Não. O envio é assistido: o sistema monta a mensagem personalizada e abre o seu WhatsApp com o texto pronto. Você revisa e envia. Depois, registra o contato com um clique. Assim você mantém o controle e o tom da conversa.",
  },
  {
    q: "Funciona com WhatsApp comum ou só com o Business?",
    a: "Funciona com os dois, no celular ou no computador (WhatsApp Web), porque o envio é feito pelo seu próprio aplicativo.",
  },
  {
    q: "Como o sistema sabe quando o cliente deve voltar?",
    a: "Cada serviço tem um intervalo de retorno (ex.: limpeza de ar-condicionado a cada 180 dias). Ao registrar um atendimento, a próxima data é calculada automaticamente — e você pode ajustá-la quando quiser.",
  },
  {
    q: "Posso importar minha lista de clientes?",
    a: "Sim. Importe uma planilha CSV (exportada do Excel ou Google Planilhas) com nome e telefone. Validamos cada linha e evitamos duplicados antes de importar.",
  },
  {
    q: "Meus dados e os dos meus clientes estão seguros?",
    a: "Cada empresa tem um ambiente isolado, as senhas são armazenadas com hash seguro e você pode exportar ou excluir todos os dados a qualquer momento. O sistema registra consentimento e pedidos de “não contatar”, como pede a LGPD.",
  },
  {
    q: "Funciona no celular?",
    a: "Sim. O VoltaCliente funciona no navegador do celular, tablet e computador, com modo claro e escuro.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. Não há fidelidade. Você também pode exportar seus dados antes de sair.",
  },
];

export function Faq() {
  return (
    <div className="divide-y rounded-2xl border bg-card">
      {FAQ_ITEMS.map((item) => (
        <details key={item.q} className="group px-5 py-1 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium">
            {item.q}
            <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
