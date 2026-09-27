/** Minimal line icon set drawn for Jarvis (1.5px strokes on a 24px grid). */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export const IconMic = (p: P) => (
  <Svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Svg>
);
export const IconMicOff = (p: P) => (
  <Svg {...p}><path d="M15 9.5V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18" /></Svg>
);
export const IconSend = (p: P) => (
  <Svg {...p}><path d="M5 12h13M13 6l6 6-6 6" /></Svg>
);
export const IconClose = (p: P) => (
  <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
);
export const IconMinus = (p: P) => (
  <Svg {...p}><path d="M6 12h12" /></Svg>
);
export const IconSquare = (p: P) => (
  <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="1" /></Svg>
);
export const IconBell = (p: P) => (
  <Svg {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0" /></Svg>
);
export const IconStop = (p: P) => (
  <Svg {...p}><rect x="7" y="7" width="10" height="10" rx="1.5" /></Svg>
);
export const IconScreen = (p: P) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M9 20h6M12 16v4" /></Svg>
);
export const IconCloud = (p: P) => (
  <Svg {...p}><path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 11 3.5 3.5 0 0 0 7 18z" /></Svg>
);
export const IconBolt = (p: P) => (
  <Svg {...p}><path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" /></Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></Svg>
);
export const IconPlus = (p: P) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconTrash = (p: P) => (
  <Svg {...p}><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></Svg>
);
export const IconEdit = (p: P) => (
  <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4" /></Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7" /></Svg>
);
export const IconShield = (p: P) => (
  <Svg {...p}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /></Svg>
);
export const IconRefresh = (p: P) => (
  <Svg {...p}><path d="M20 11a8 8 0 0 0-14.3-4.3L4 9M4 4v5h5M4 13a8 8 0 0 0 14.3 4.3L20 15M20 20v-5h-5" /></Svg>
);
export const IconDownload = (p: P) => (
  <Svg {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Svg>
);
export const IconFocus = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /></Svg>
);
