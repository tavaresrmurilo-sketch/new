import { ImageResponse } from "next/og";
import { BrandCard } from "@/server/engagement/share-image";
import { APP_TAGLINE } from "@/lib/constants";

export const alt = "Mixtour — descubra o que está rolando perto de você";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Imagem de compartilhamento padrão da marca. */
export default function Image() {
  return new ImageResponse(
    <BrandCard headline={APP_TAGLINE} subline="Shows, festas, feiras, exposições e passeios no mapa da sua cidade — e uma vitrine para quem organiza." />,
    size,
  );
}
