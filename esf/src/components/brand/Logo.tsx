import Image from "next/image";
import seal from "@/assets/brand/esf-selo.png";
import lockup from "@/assets/brand/esf-logo.png";

/**
 * Marca oficial da ESF (paleta roxa/quente — variação "premium", ver esf/brand/).
 *
 * - `LogoMark`: o símbolo (globo + pessoas) sobre o disco preto da marca — o "selo". Funciona sobre
 *   fundos escuros e claros, mantendo o fundo preto original da logo.
 * - `Wordmark`: versão horizontal para o cabeçalho — selo + "Empreendendo / Sem Fronteiras" em texto vivo
 *   (nítido em qualquer tamanho e com contraste ajustado ao fundo).
 * - `LogoLockup`: a logo completa (símbolo + texto), fundo transparente — para fundos escuros.
 */
export function LogoMark({
  className,
  title,
  sizes = "64px",
  eager = false,
}: {
  className?: string;
  /** texto alternativo; omita quando a marca for apenas decorativa */
  title?: string;
  sizes?: string;
  eager?: boolean;
}) {
  return (
    <Image
      src={seal}
      alt={title ?? ""}
      className={className}
      sizes={sizes}
      quality={80}
      loading={eager ? "eager" : "lazy"}
      draggable={false}
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`brand-wordmark ${className ?? ""}`}>
      <LogoMark className="brand-wordmark-seal" title="ESF" sizes="44px" eager />
      <span className="brand-wordmark-text">
        <span className="brand-wordmark-top">Empreendendo</span>{" "}
        <span className="brand-wordmark-bottom">Sem Fronteiras</span>
      </span>
    </span>
  );
}

export function LogoLockup({ className, sizes = "240px" }: { className?: string; sizes?: string }) {
  return (
    <Image
      src={lockup}
      alt="ESF — Empreendendo Sem Fronteiras"
      className={className}
      sizes={sizes}
      quality={80}
      draggable={false}
    />
  );
}
