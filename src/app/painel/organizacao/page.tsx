import { BadgeCheck, ExternalLink, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { OrgForm } from "@/components/painel/org-form";
import { PainelPage } from "@/components/painel/shell";
import { Button } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/misc";
import { requireCurrentOrg } from "@/server/organizations/current";

export const metadata: Metadata = { title: "Organização" };

export default async function OrganizacaoPage() {
  const { org, canManage } = await requireCurrentOrg();
  return (
    <PainelPage className="max-w-5xl">
      <PageHeader
        title="Organização"
        description="O perfil público de quem organiza os eventos."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/organizador/${org.slug}`} target="_blank" rel="noopener">
              <ExternalLink /> Ver como público
            </Link>
          </Button>
        }
      />
      <div className="mt-6 flex flex-col gap-3">
        {!canManage && (
          <Alert tone="neutral" icon={<ShieldCheck />} title="Somente leitura">
            Apenas administradores e o proprietário da organização podem alterar o perfil.
          </Alert>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {org.verified ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 font-semibold text-primary">
              <BadgeCheck className="size-4" /> Organização verificada
            </span>
          ) : (
            <span className="text-muted-foreground">O selo de verificação é concedido pela equipe Mixtour a organizações com histórico de eventos confiáveis.</span>
          )}
        </div>
      </div>
      <div className="mt-8 rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-7">
        <OrgForm
          canEdit={canManage}
          initial={{
            id: org.id,
            slug: org.slug,
            name: org.name,
            bio: org.bio ?? "",
            city: org.city ?? "",
            state: org.state ?? "",
            website: org.website ?? "",
            instagram: org.instagram ? `@${org.instagram}` : "",
            whatsapp: org.whatsapp ?? "",
            contactEmail: org.contactEmail ?? "",
            logoUrl: org.logoUrl,
            coverUrl: org.coverUrl,
          }}
        />
      </div>
    </PainelPage>
  );
}
