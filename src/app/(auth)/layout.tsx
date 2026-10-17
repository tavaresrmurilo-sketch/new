import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { CATEGORY_SEED } from "@/lib/categories";

// Pinos decorativos (posições fixas) — ilustração, não representam eventos.
const DECOR = [
  { x: 18, y: 26, c: 0 },
  { x: 62, y: 18, c: 1 },
  { x: 78, y: 44, c: 2 },
  { x: 36, y: 52, c: 5 },
  { x: 54, y: 70, c: 7 },
  { x: 24, y: 78, c: 9 },
  { x: 84, y: 76, c: 10 },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-[#08080d] text-white lg:block">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at 50% 45%, black 30%, transparent 75%)",
          }}
        />
        <div aria-hidden className="absolute -top-40 -left-40 size-[520px] rounded-full bg-[#7c5cff] opacity-30 blur-[120px]" />
        <div aria-hidden className="absolute -right-32 -bottom-40 size-[520px] rounded-full bg-[#ff4d8d] opacity-25 blur-[120px]" />
        {DECOR.map((p, i) => (
          <span key={i} aria-hidden className="absolute" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <span className="absolute inset-0 animate-pulse-ring rounded-full" style={{ background: CATEGORY_SEED[p.c].color, animationDelay: `${i * 0.35}s` }} />
            <span className="relative block size-4 rounded-full ring-4 ring-white/15" style={{ background: CATEGORY_SEED[p.c].color }} />
          </span>
        ))}
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" aria-label="Mixtour — início">
            <Logo className="text-white" />
          </Link>
          <div className="max-w-md">
            <h2 className="text-5xl leading-[1.05] font-extrabold tracking-[-0.03em]">
              O mapa vivo da <span className="text-brand-gradient">sua cidade</span>.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-white/70">
              Shows, festas, feiras e passeios perto de você — e uma vitrine para quem faz a cena acontecer.
            </p>
          </div>
          <p className="text-sm text-white/40">© {new Date().getFullYear()} Mixtour</p>
        </div>
      </aside>
      <main className="flex min-h-dvh flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-8 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <Link href="/" aria-label="Mixtour — início" className="lg:hidden">
            <Logo />
          </Link>
          <Link href="/" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            Explorar sem conta
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
