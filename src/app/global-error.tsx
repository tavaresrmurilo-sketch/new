"use client";

/** Último recurso: erro no layout raiz. Nunca exibe detalhes técnicos ao usuário. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0, background: "#f8fafc", color: "#0f172a" }}>
        <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Não foi possível carregar o JR Cortex AI</h1>
          <p style={{ color: "#475569", fontSize: 14, margin: "0 0 20px" }}>Ocorreu uma falha temporária. O erro foi registrado. Tente novamente em instantes.</p>
          <button onClick={reset} style={{ background: "#1e3a5f", color: "white", border: 0, borderRadius: 8, padding: "10px 18px", fontSize: 14, cursor: "pointer" }}>
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
