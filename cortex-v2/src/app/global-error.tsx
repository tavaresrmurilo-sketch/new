"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0, background: "#fafafa" }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <p style={{ color: "#4f46e5", fontWeight: 600, fontSize: 14 }}>500</p>
          <h1 style={{ fontSize: 22, margin: "8px 0" }}>Algo deu errado</h1>
          <p style={{ color: "#71717a", fontSize: 14 }}>Ocorreu um erro inesperado. Nossa equipe foi notificada pelos logs do sistema.{error.digest ? ` Código: ${error.digest}` : ""}</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 6, border: "1px solid #e4e4e7", background: "#fff", cursor: "pointer" }}>Tentar novamente</button>
        </div>
      </body>
    </html>
  );
}
