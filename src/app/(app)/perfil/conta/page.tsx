import type { Metadata } from "next";
import { AvatarUploader, ProfileForm } from "@/components/me/profile-form";
import { UnverifiedEmailNotice } from "@/components/me/resend-verification";
import { PasswordSection, SessionsList } from "@/components/me/security";
import { ProfileSubpageHeader, SettingsSection } from "@/components/me/subpage-header";
import { requireUser } from "@/server/auth/guards";
import { activeCategories, getProfile, listSessions } from "@/server/me/service";

export const metadata: Metadata = { title: "Conta e segurança", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const session = await requireUser("/perfil/conta");
  const [profile, categories, sessions] = await Promise.all([getProfile(session.id), activeCategories(), listSessions(session.id, session.sessionId)]);
  const homeCity =
    profile.homeCity && profile.homeLat != null && profile.homeLng != null ? { city: profile.homeCity, lat: profile.homeLat, lng: profile.homeLng } : null;

  return (
    <main className="px-4 sm:px-6 lg:px-0">
      <ProfileSubpageHeader title="Conta e segurança" description="Seus dados de perfil, preferências de descoberta, senha e aparelhos conectados." />
      <div className="mt-5 space-y-5 lg:mt-0">
        <SettingsSection id="perfil" title="Perfil" description="Foto, nome e o que te interessa.">
          <div className="space-y-6">
            <AvatarUploader name={profile.name} avatarUrl={profile.avatarUrl} />
            <div className="rounded-2xl border border-border bg-surface-2/50 px-4 py-3">
              <p className="text-[13px] font-semibold text-muted-foreground">E-mail da conta</p>
              <p className="mt-0.5 text-[15px] font-semibold break-all">{profile.email}</p>
              {!profile.emailVerifiedAt && (
                <div className="mt-2">
                  <UnverifiedEmailNotice email={profile.email} compact />
                </div>
              )}
            </div>
            <ProfileForm
              name={profile.name}
              homeCity={homeCity}
              favorites={profile.favoriteCategories}
              categories={categories.map(({ slug, name, icon, color }) => ({ slug, name, icon, color }))}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          id="senha"
          title="Senha"
          description={profile.hasPassword ? "Ao alterar a senha, as outras sessões abertas são encerradas." : profile.hasGoogle ? "Sua conta está ligada ao Google." : undefined}
        >
          <PasswordSection hasPassword={profile.hasPassword} email={profile.email} />
        </SettingsSection>

        <SettingsSection id="sessoes" title="Sessões ativas" description="Aparelhos em que sua conta está aberta. Encerre os que você não reconhece.">
          <SessionsList
            sessions={sessions.map((s) => ({
              id: s.id,
              device: { label: s.device.label, kind: s.device.kind },
              ip: s.ip,
              createdAt: s.createdAt,
              lastActivityAt: s.lastActivityAt,
              current: s.current,
            }))}
          />
        </SettingsSection>
      </div>
    </main>
  );
}
