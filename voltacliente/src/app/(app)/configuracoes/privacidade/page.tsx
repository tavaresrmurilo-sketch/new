import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon, FileJsonIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenantPage } from "@/server/session";
import { DeleteCompanyCard } from "./delete-company";

export const metadata: Metadata = { title: "Privacidade e dados" };

export default async function PrivacyPage() {
  const tenant = await requireTenantPage();
  const canExport = tenant.role !== "MEMBER";
  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-5 text-emerald" /> Seus dados e a LGPD
          </CardTitle>
          <CardDescription>
            Sua empresa é a controladora dos dados dos clientes; o VoltaCliente atua como operador. Os dados de cada empresa ficam isolados
            e só são acessados por usuários da própria empresa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Registre o consentimento do cliente antes de enviar mensagens e respeite pedidos de “não contatar”.</p>
          <p>• Para atender um pedido de exclusão de um cliente, abra o cadastro dele e use “Excluir”: todo o histórico é apagado.</p>
          <p>
            • Leia a{" "}
            <Link href="/privacidade" className="text-primary underline">
              Política de Privacidade
            </Link>{" "}
            e os{" "}
            <Link href="/termos" className="text-primary underline">
              Termos de Uso
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exportar dados</CardTitle>
          <CardDescription>Portabilidade: baixe uma cópia completa dos dados da sua empresa.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {canExport ? (
            <>
              <Button asChild variant="outline">
                <a href="/api/exportar/dados" download>
                  <FileJsonIcon /> Exportar tudo (JSON)
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href="/api/exportar/clientes" download>
                  <DownloadIcon /> Exportar clientes (CSV)
                </a>
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Apenas administradores podem exportar todos os dados.</p>
          )}
        </CardContent>
      </Card>

      {tenant.role === "OWNER" && <DeleteCompanyCard companyName={tenant.company.name} />}
    </div>
  );
}
