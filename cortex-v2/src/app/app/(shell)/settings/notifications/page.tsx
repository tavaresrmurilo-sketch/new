import { isEmailConfigured } from "@/services/email";
import { requireCtx } from "@/server/auth/context";

export const metadata = { title: "Notificações" };

const EVENTS = [
  ["Atribuição de tarefa", "Quando alguém atribui uma tarefa a você"],
  ["Menções", "Quando você é mencionado (@nome) em comentários"],
  ["Aprovações", "Propostas aguardando sua aprovação e o resultado das suas solicitações"],
  ["Contratos", "Alertas de vencimento em 90, 60, 30 e 7 dias (configurável em Empresa)"],
  ["Follow-ups", "Propostas sem retorno após o prazo configurado"],
  ["Projetos em risco", "Projetos atrasados ou com risco crítico registrado"],
  ["Tarefas atrasadas", "Resumo diário das suas tarefas vencidas"],
  ["Automações", "Notificações criadas pelas automações da empresa"],
];

export default async function NotificationsSettingsPage() {
  await requireCtx();
  const email = isEmailConfigured();
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold">Notificações no aplicativo</h2>
        <p className="mb-3 text-[13px] text-muted-foreground">Sempre ativas. Aparecem no sino e no Inbox, onde podem ser lidas, arquivadas ou abertas.</p>
        <ul className="divide-y rounded-md border text-[13px]">
          {EVENTS.map(([t, d]) => <li key={t} className="px-3 py-2"><span className="font-medium">{t}</span> <span className="text-muted-foreground">— {d}</span></li>)}
        </ul>
      </div>
      <div className="rounded-lg border bg-card p-5 text-[13px]">
        <h2 className="text-sm font-semibold">E-mail</h2>
        <p className="text-muted-foreground">
          {email
            ? "O envio de e-mails está configurado e é usado para mensagens transacionais (convites e redefinição de senha)."
            : "O envio de e-mails não está configurado neste ambiente (RESEND_API_KEY). Convites geram um link para copiar e compartilhar manualmente."}{" "}
          Resumos e alertas por e-mail: integração futura. O Córtex nunca envia mensagens a clientes automaticamente.
        </p>
      </div>
    </div>
  );
}
