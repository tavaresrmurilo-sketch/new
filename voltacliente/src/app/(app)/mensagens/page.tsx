import type { Metadata } from "next";
import { InfoIcon, MessageSquareTextIcon } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { listServices } from "@/modules/catalog/service";
import { getCompany } from "@/modules/company/service";
import { listTemplates } from "@/modules/messaging/service";
import { requireTenantPage } from "@/server/session";
import { TemplateCard, TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "Mensagens" };

export default async function MessagesPage() {
  const tenant = await requireTenantPage();
  const [templates, services, company] = await Promise.all([listTemplates(tenant), listServices(tenant), getCompany(tenant)]);
  const serviceOptions = services.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Modelos de mensagem"
        description="Textos usados no envio assistido pelo WhatsApp. As variáveis são preenchidas com os dados de cada cliente."
        actions={<TemplateEditor services={serviceOptions} companyName={company.name} />}
      />
      <Alert variant="info" className="mb-6">
        <InfoIcon />
        <AlertTitle>Como funciona o envio</AlertTitle>
        <AlertDescription>
          <p>
            Na central de retornos, o VoltaCliente monta a mensagem e abre o WhatsApp com o texto preenchido. Você revisa e envia pelo seu
            próprio WhatsApp — nada é disparado automaticamente. Só clientes com consentimento registrado podem receber mensagens.
          </p>
        </AlertDescription>
      </Alert>
      {templates.length === 0 ? (
        <EmptyState
          icon={MessageSquareTextIcon}
          title="Nenhum modelo"
          description="Crie um modelo para enviar lembretes personalizados."
          action={<TemplateEditor services={serviceOptions} companyName={company.name} />}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={{
                id: t.id,
                name: t.name,
                body: t.body,
                isDefault: t.isDefault,
                serviceId: t.serviceId,
                serviceName: t.service?.name ?? null,
              }}
              services={serviceOptions}
              companyName={company.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}
