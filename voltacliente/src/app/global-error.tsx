"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>Algo deu errado</h1>
          <p style={{ color: "#64748b" }}>Ocorreu um erro inesperado. Tente novamente em instantes.</p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "10px 18px",
              borderRadius: 8,
              border: 0,
              background: "#1e3a8a",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
