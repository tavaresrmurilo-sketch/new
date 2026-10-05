import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="max-w-md text-sm text-muted-foreground">O endereço não existe ou o registro foi removido. Se você chegou aqui por um link, ele pode estar desatualizado.</p>
      <div className="mt-2 flex gap-2">
        <Link href="/app/dashboard" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Ir para o dashboard</Link>
        <Link href="/" className="rounded-md border px-4 py-2 text-sm">Página inicial</Link>
      </div>
    </div>
  );
}
