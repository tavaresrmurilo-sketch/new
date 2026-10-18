import { ImageResponse } from "next/og";
import { BrandCard, BrandFooter, imageDataUri, OG_BG, truncateText } from "@/server/engagement/share-image";
import { getOrganizerBySlug } from "@/server/events/detail";
import { APP_TAGLINE } from "@/lib/constants";
import { initials } from "@/lib/utils";

export const alt = "Perfil do organizador no Mixtour";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await getOrganizerBySlug(slug);
  if (!org) return new ImageResponse(<BrandCard headline={APP_TAGLINE} subline="Shows, festas, feiras e passeios no mapa da sua cidade." />, size);

  const [logo, cover] = await Promise.all([imageDataUri(org.logoUrl, 220, 220), imageDataUri(org.coverUrl, size.width, size.height)]);
  const name = truncateText(org.name, 60);
  const place = [org.city, org.state].filter(Boolean).join(" - ");
  const bio = org.bio ? truncateText(org.bio, 120) : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: OG_BG, color: "#fff" }}>
        {cover ? (
          <img src={cover} width={size.width} height={size.height} alt="" style={{ position: "absolute", inset: 0, objectFit: "cover", opacity: 0.35 }} />
        ) : (
          <div style={{ position: "absolute", top: -280, right: -200, width: 820, height: 820, borderRadius: 9999, background: "#7c5cff", opacity: 0.35, filter: "blur(130px)" }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(8,8,13,0.96) 0%, rgba(8,8,13,0.7) 60%, rgba(8,8,13,0.45) 100%)" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", padding: "64px 72px 52px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
            {logo ? (
              <img src={logo} width={200} height={200} alt="" style={{ borderRadius: 48, border: "4px solid rgba(255,255,255,0.18)" }} />
            ) : (
              <div
                style={{
                  width: 200,
                  height: 200,
                  borderRadius: 48,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 80,
                  background: "linear-gradient(120deg, #7c5cff 0%, #b04dff 40%, #ff4d8d 72%, #ff8a3d 100%)",
                }}
              >
                {initials(org.name)}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
              <div style={{ display: "flex", fontSize: 24, letterSpacing: 2, color: "#ff4d8d" }}>{org.verified ? "ORGANIZADOR VERIFICADO" : "ORGANIZADOR"}</div>
              <div style={{ display: "block", marginTop: 10, fontSize: name.length > 30 ? 58 : 70, lineHeight: 1.05, letterSpacing: -2, lineClamp: 2 }}>{name}</div>
              {place && <div style={{ display: "flex", marginTop: 16, fontSize: 30, color: "rgba(255,255,255,0.75)" }}>{place}</div>}
            </div>
          </div>
          {bio && <div style={{ display: "block", fontSize: 28, lineHeight: 1.4, color: "rgba(255,255,255,0.7)", maxWidth: 960, lineClamp: 2 }}>{bio}</div>}
          <BrandFooter />
        </div>
      </div>
    ),
    size,
  );
}
