"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#08080d", color: "#f3f3f8", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 28 }}>O Mixtour está fora do ar por um instante</h1>
          <p style={{ color: "#a3a3b8" }}>Tente novamente em alguns segundos.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "12px 24px", borderRadius: 999, border: 0, background: "#7c5cff", color: "#fff", fontWeight: 700 }}>
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
