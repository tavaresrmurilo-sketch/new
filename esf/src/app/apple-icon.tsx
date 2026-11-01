import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#091827" }}>
        <svg width="120" height="120" viewBox="0 0 100 100">
          <path d="M89.13 41.68A40 40 0 1 1 58.32 10.87" fill="none" stroke="#F7F5F0" strokeWidth="8" strokeLinecap="round" />
          <path d="M50 90A16 40 0 0 1 50 10" fill="none" stroke="#F7F5F0" strokeWidth="5.5" strokeLinecap="round" opacity="0.55" />
          <circle cx="79" cy="21" r="9" fill="#F28C45" />
        </svg>
      </div>
    ),
    size,
  );
}
