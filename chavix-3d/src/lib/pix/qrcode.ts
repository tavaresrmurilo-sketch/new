import QRCode from "qrcode";

/** Gera o QR Code do payload como SVG (renderizado no servidor, sem JavaScript no cliente). */
export async function pixQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#0b0b10", light: "#ffffff" },
  });
}
