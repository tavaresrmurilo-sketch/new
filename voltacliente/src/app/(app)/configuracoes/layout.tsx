import { PageHeader } from "@/components/app/page-header";
import { SettingsNav } from "./settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade-up">
      <PageHeader title="Configurações" description="Dados da empresa, plano, conta e privacidade." />
      <SettingsNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}
