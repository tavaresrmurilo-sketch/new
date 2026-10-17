import "server-only";
import { appUrl } from "@/server/env";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

interface LayoutInput {
  preheader: string;
  heading: string;
  paragraphs: string[]; // texto puro (será escapado)
  cta?: { label: string; url: string };
  footnote?: string;
}

/** HTML de e-mail compatível com os principais clientes (tabelas + estilos inline). */
export function renderEmail(input: LayoutInput): { html: string; text: string } {
  const p = input.paragraphs
    .map((t) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#2b2b38">${escapeHtml(t)}</p>`)
    .join("");
  const cta = input.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px"><tr><td style="border-radius:999px;background:#6B46FF;background-image:linear-gradient(120deg,#7C5CFF,#FF4D8D)">
        <a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${escapeHtml(input.cta.label)}</a>
      </td></tr></table>
      <p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#6b6b80">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${escapeHtml(input.cta.url)}" style="color:#6B46FF;word-break:break-all">${escapeHtml(input.cta.url)}</a></p>`
    : "";
  const foot = input.footnote ? `<p style="margin:16px 0 0;font-size:13px;line-height:20px;color:#6b6b80">${escapeHtml(input.footnote)}</p>` : "";

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f8;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="padding:28px 32px 0"><a href="${escapeHtml(appUrl())}" style="text-decoration:none;font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#111118">mix<span style="color:#FF4D8D">tour</span></a></td></tr>
<tr><td style="padding:20px 32px 32px">
<h1 style="margin:0 0 16px;font-size:24px;line-height:32px;color:#111118">${escapeHtml(input.heading)}</h1>
${p}${cta}${foot}
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#8a8a9c">Mixtour · <a href="${escapeHtml(appUrl("/perfil/notificacoes"))}" style="color:#8a8a9c">Preferências de e-mail</a></p>
</td></tr></table></body></html>`;

  const text = [input.heading, "", ...input.paragraphs, ...(input.cta ? ["", `${input.cta.label}: ${input.cta.url}`] : []), ...(input.footnote ? ["", input.footnote] : [])].join("\n");
  return { html, text };
}
