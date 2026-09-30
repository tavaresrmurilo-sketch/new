import { CheckCircle2, XCircle } from "lucide-react";
import { CustomBuilderForm, PasswordForm, ShippingForm, StoreInfoForm } from "@/components/admin/settings-forms";
import { Card, PageHeader } from "@/components/admin/ui";
import { getPixConfigStatus, maskPixKey } from "@/lib/pix/config";
import { getStoreSettings } from "@/lib/settings";

export const metadata = { title: "Configurações" };

const KEY_TYPE = { CPF: "CPF", CNPJ: "CNPJ", EMAIL: "E-mail", PHONE: "Telefone", EVP: "Chave aleatória" };

export default async function SettingsPage() {
  const settings = await getStoreSettings();
  const pix = getPixConfigStatus();
  return (
    <>
      <PageHeader title="Configurações" description="Tudo o que muda sem mexer no código." />
      <div className="space-y-6">
        <Card title="Loja e contato" description="WhatsApp, e-mail e Instagram aparecem no rodapé, no contato e nos botões da loja.">
          <StoreInfoForm
            initial={{
              storeName: settings.storeName,
              whatsappNumber: settings.whatsappNumber ?? "",
              contactEmail: settings.contactEmail ?? "",
              instagram: settings.instagram ?? "",
              announcement: settings.announcement ?? "",
              pickupAddress: settings.pickupAddress ?? "",
            }}
          />
        </Card>

        <Card title="Pix" description="Por segurança, a chave Pix fica só nas variáveis de ambiente (PIX_KEY, PIX_RECEIVER_NAME, PIX_CITY), nunca no banco.">
          {pix.ok ? (
            <dl className="grid gap-4 text-sm sm:grid-cols-4">
              <div className="flex items-center gap-2 font-medium text-success">
                <CheckCircle2 className="h-5 w-5" /> Configurado
              </div>
              <div>
                <dt className="text-muted">Chave ({KEY_TYPE[pix.config.keyType]})</dt>
                <dd className="font-mono">{maskPixKey(pix.config.key, pix.config.keyType)}</dd>
              </div>
              <div>
                <dt className="text-muted">Recebedor</dt>
                <dd className="font-medium">{pix.config.receiverName}</dd>
              </div>
              <div>
                <dt className="text-muted">Cidade</dt>
                <dd className="font-medium">{pix.config.city}</dd>
              </div>
            </dl>
          ) : (
            <p className="flex items-start gap-2 text-sm text-danger">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" /> {pix.error}. Defina as variáveis no .env (local) ou em Vercel → Settings → Environment Variables e faça um novo deploy.
            </p>
          )}
        </Card>

        <Card title="Frete" description="Retirada, entrega local e envio nacional.">
          <ShippingForm initial={settings.shipping} />
        </Card>

        <Card title="Chaveiro personalizado" description="Tabela usada em /personalizar. O servidor recalcula tudo com estes valores.">
          <CustomBuilderForm initial={settings.customBuilder} />
        </Card>

        <Card title="Sua senha">
          <PasswordForm />
        </Card>
      </div>
    </>
  );
}
