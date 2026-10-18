import { ImageResponse } from "next/og";
import { BrandCard, BrandFooter, categoryIconUri, glyphUri, imageDataUri, OG_BG, truncateText } from "@/server/engagement/share-image";
import { getEventBySlug, isPublicEventPage } from "@/server/events/detail";
import { formatShortDate, formatTime, priceLabel } from "@/lib/format";
import { APP_TAGLINE } from "@/lib/constants";

export const alt = "Convite para o evento no Mixtour";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const IMAGE_W = 500;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = await getEventBySlug(slug);
  // Eventos sem página pública não expõem nada: imagem genérica da marca.
  if (!e || !isPublicEventPage(e)) {
    return new ImageResponse(<BrandCard headline={APP_TAGLINE} subline="Shows, festas, feiras e passeios no mapa da sua cidade." />, size);
  }

  const color = e.category.color;
  const cover = await imageDataUri(e.coverThumbUrl ?? e.coverUrl, IMAGE_W, size.height);
  const title = truncateText(e.title, 90);
  const titleSize = title.length <= 38 ? 66 : title.length <= 64 ? 56 : 46;
  const when = `${formatShortDate(e.startsAt, e.timezone)} · ${formatTime(e.startsAt, e.timezone)}`.toUpperCase();
  const place = truncateText([e.venueName, e.city].filter(Boolean).join(" · "), 40);
  const price = priceLabel(e.isFree, e.priceMinCents, e.priceMaxCents);
  const canceled = e.status === "CANCELED";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: OG_BG, color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -260, left: -220, width: 760, height: 760, borderRadius: 9999, background: color, opacity: 0.3, filter: "blur(120px)" }} />
        <div style={{ position: "absolute", bottom: -320, left: 260, width: 620, height: 620, borderRadius: 9999, background: "#ff4d8d", opacity: 0.12, filter: "blur(120px)" }} />

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 1200 - IMAGE_W + 40, padding: "56px 56px 48px 64px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 20px 10px 14px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  border: `2px solid ${color}`,
                  fontSize: 24,
                }}
              >
                <img src={categoryIconUri(e.category.icon, color, 26, 2.4)} width={26} height={26} alt="" />
                <span>{e.category.name}</span>
              </div>
              {canceled && (
                <div style={{ display: "flex", padding: "10px 18px", borderRadius: 999, background: "#ff6369", color: "#1a0507", fontSize: 22, letterSpacing: 1.5 }}>
                  CANCELADO
                </div>
              )}
            </div>
            <div style={{ display: "block", marginTop: 30, fontSize: titleSize, lineHeight: 1.08, letterSpacing: -1.6, lineClamp: 3 }}>{title}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, color: "#ff4d8d" }}>
              <img src={glyphUri("calendar", "#ff4d8d", 32)} width={32} height={32} alt="" />
              <span>{when}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, color: "rgba(255,255,255,0.82)" }}>
              <img src={glyphUri("pin", "rgba(255,255,255,0.82)", 32)} width={32} height={32} alt="" />
              <span>{place}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, color: e.isFree ? "#3ccf7a" : "rgba(255,255,255,0.82)" }}>
              <img src={glyphUri("ticket", e.isFree ? "#3ccf7a" : "rgba(255,255,255,0.82)", 32)} width={32} height={32} alt="" />
              <span>{price}</span>
            </div>
          </div>

          <BrandFooter />
        </div>

        <div style={{ position: "absolute", top: 0, right: 0, width: IMAGE_W, height: size.height, display: "flex" }}>
          {cover ? (
            <img src={cover} width={IMAGE_W} height={size.height} alt="" style={{ objectFit: "cover" }} />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `linear-gradient(150deg, ${color} 0%, ${OG_BG} 115%)`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 200,
                  height: 200,
                  borderRadius: 56,
                  background: "rgba(255,255,255,0.16)",
                  border: "2px solid rgba(255,255,255,0.3)",
                }}
              >
                <img src={categoryIconUri(e.category.icon, "#ffffff", 96, 1.8)} width={96} height={96} alt="" />
              </div>
            </div>
          )}
          <div style={{ position: "absolute", top: 0, left: 0, width: 220, height: "100%", background: `linear-gradient(90deg, ${OG_BG} 0%, rgba(8,8,13,0) 100%)` }} />
        </div>
      </div>
    ),
    size,
  );
}
