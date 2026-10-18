import { CircleCheck, CircleDashed } from "lucide-react";
import type { Metadata } from "next";
import { SettingsForm } from "@/components/admin/settings-form";
import { AdminPage, Panel } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { getAdminSettings } from "@/server/admin/catalog";
import { requireAdmin } from "@/server/auth/guards";
import { env, integrations } from "@/server/env";

export const metadata: Metadata = { title: "Configurações" };

interface Integration {
  key: string;
  name: string;
  on: boolean;
  what: string;
  how: string[];
  detail?: string;
}

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getAdminSettings();
  const i = integrations();
  const e = env();

  const list: Integration[] = [
    {
      key: "email",
      name: "E-mail transacional",
      on: i.email,
      what: "Confirmação de conta, recuperação de senha, convites, avisos de moderação e lembretes.",
      how: ["EMAIL_PROVIDER=resend + RESEND_API_KEY", "ou EMAIL_PROVIDER=smtp + SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD", "EMAIL_FROM com um domínio verificado"],
      detail: i.email ? `Provedor: ${e.EMAIL_PROVIDER}` : "Sem provedor: os e-mails ficam no outbox como “não enviados”.",
    },
    {
      key: "stripe",
      name: "Assinaturas (Stripe)",
      on: i.stripeWebhook,
      what: "Checkout dos planos pagos, portal de cobrança e sincronização das assinaturas.",
      how: ["STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET", "Webhook: {APP_URL}/api/billing/webhook", "IDs de preço em /admin/planos (ou STRIPE_PRICE_* + seed)"],
      detail: i.stripe && !i.stripeWebhook ? "Chave configurada, mas falta o segredo do webhook." : undefined,
    },
    {
      key: "s3",
      name: "Imagens em S3/R2",
      on: i.s3,
      what: "Armazenamento das capas e logos. Obrigatório em hospedagem sem disco persistente (Vercel).",
      how: ["STORAGE_DRIVER=s3", "S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_URL", "S3_ENDPOINT e S3_REGION para R2/MinIO"],
      detail: i.s3 ? undefined : "Hoje as imagens ficam no disco local do servidor.",
    },
    {
      key: "push",
      name: "Notificações push",
      on: i.push,
      what: "Avisos no celular e no navegador (lembretes, aprovações, novidades de quem a pessoa segue).",
      how: ["npx web-push generate-vapid-keys", "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT", "NEXT_PUBLIC_VAPID_PUBLIC_KEY (mesma chave pública)"],
    },
    {
      key: "google",
      name: "Entrar com Google",
      on: i.google,
      what: "Login social com Google.",
      how: ["GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET", "URI de redirecionamento: {APP_URL}/api/auth/google/callback"],
    },
    {
      key: "cron",
      name: "Rotinas agendadas",
      on: i.cron,
      what: "Lembretes de eventos, arquivamento e limpeza diária (veja /admin/rotinas).",
      how: ["CRON_SECRET (a Vercel Cron envia Authorization: Bearer $CRON_SECRET)", "Fora da Vercel: chame /api/cron/daily com o cabeçalho, ou npm run jobs:run -- daily"],
    },
    {
      key: "geocoder",
      name: "Geocodificação",
      on: i.geocoder,
      what: "Busca de endereços e cidades no editor de eventos e no mapa.",
      how: ["GEOCODER=nominatim (padrão) + GEOCODER_CONTACT_EMAIL", "Para volume alto, use uma instância própria (NOMINATIM_URL)"],
    },
  ];

  return (
    <AdminPage title="Configurações" description="Regras da plataforma e o estado das integrações externas. Nenhum segredo é exibido aqui.">
      <Panel>
        <SettingsForm initial={settings} />
      </Panel>

      <Panel
        title={<span id="integracoes" className="scroll-mt-28">Integrações</span>}
        description={`${list.filter((x) => x.on).length} de ${list.length} ativas. Configure pelas variáveis de ambiente e reinicie a aplicação.`}
        className="mt-3"
      >
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((x) => (
            <li key={x.key} className="flex flex-col gap-2 rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-2 font-bold">
                  {x.on ? <CircleCheck className="size-5 text-success" aria-hidden /> : <CircleDashed className="size-5 text-muted-foreground" aria-hidden />}
                  {x.name}
                </p>
                {x.on ? <Badge tone="success">Ativa</Badge> : <Badge tone="neutral">Desativada</Badge>}
              </div>
              <p className="text-[13px] leading-snug text-muted-foreground">{x.what}</p>
              {x.detail && <p className="text-[13px] font-medium text-foreground/80">{x.detail}</p>}
              {!x.on && (
                <div className="mt-1 rounded-xl bg-surface-2/70 p-3">
                  <p className="mb-1.5 text-xs font-bold text-subtle-foreground uppercase">Como ativar</p>
                  <ul className="flex flex-col gap-1 text-[13px] leading-snug">
                    {x.how.map((h) => (
                      <li key={h} className="font-mono text-xs break-words">
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-muted-foreground">
          Diagnóstico completo pela linha de comando: <span className="font-mono">npm run check:env</span> · guia em <span className="font-mono">docs/DEPLOY.md</span>.
        </p>
      </Panel>
    </AdminPage>
  );
}
