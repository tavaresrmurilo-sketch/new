// Arte vetorial do jogo: caricaturas satíricas (SVG), bandeiras fictícias e ícones.
// As caricaturas são propositalmente exageradas e ridículas — sátira, não homenagem.
// Nenhum símbolo real de regimes totalitários é usado.

export type PortraitId = 'lula' | 'bolsonaro' | 'hitler' | 'stalin';

const svg = (body: string, vb = '0 0 200 240') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid slice">${body}</svg>`;

const LULA = svg(`
<defs><radialGradient id="bgL" cx="50%" cy="35%" r="80%"><stop offset="0" stop-color="#9b2020"/><stop offset="1" stop-color="#260606"/></radialGradient></defs>
<rect width="200" height="240" fill="url(#bgL)"/>
<g opacity=".12" fill="#fff"><circle cx="30" cy="40" r="22"/><circle cx="175" cy="70" r="30"/></g>
<path d="M14 240 C20 192 58 176 100 173 C142 176 180 192 186 240 Z" fill="#1d2740"/>
<path d="M80 172 L100 210 L120 172 Z" fill="#f1f0ea"/>
<path d="M95 182 L105 182 L110 230 L100 240 L90 230 Z" fill="#cf2a2a"/>
<path d="M100 173 L64 178 L88 222 Z" fill="#273356"/><path d="M100 173 L136 178 L112 222 Z" fill="#273356"/>
<circle cx="136" cy="200" r="6" fill="#e53935" stroke="#fff" stroke-width="2"/>
<rect x="83" y="148" width="34" height="30" fill="#d59a70"/>
<ellipse cx="50" cy="106" rx="10" ry="15" fill="#d99f77"/><ellipse cx="150" cy="106" rx="10" ry="15" fill="#d99f77"/>
<ellipse cx="100" cy="99" rx="51" ry="59" fill="#e3ac84"/>
<path d="M51 96 C47 58 70 37 100 36 C130 37 153 58 149 96 C143 74 131 62 116 60 C108 56 92 56 84 60 C69 62 57 74 51 96Z" fill="#d4cfc6"/>
<ellipse cx="100" cy="56" rx="22" ry="12" fill="#e9b892"/>
<path d="M51 102 C51 152 76 172 100 174 C124 172 149 152 149 102 C142 122 133 131 121 133 C113 122 87 122 79 133 C67 131 58 122 51 102Z" fill="#dcd8d0"/>
<path d="M58 118 C62 140 72 150 80 154" stroke="#bdb8ae" stroke-width="3" fill="none"/>
<path d="M142 118 C138 140 128 150 120 154" stroke="#bdb8ae" stroke-width="3" fill="none"/>
<path d="M70 129 C80 116 95 116 100 122 C105 116 120 116 130 129 C119 126 109 129 100 128 C91 129 81 126 70 129Z" fill="#cbc6bc"/>
<path d="M85 138 Q100 150 115 138" stroke="#6e2f22" stroke-width="5" fill="#8a3b2c" stroke-linecap="round"/>
<ellipse cx="100" cy="108" rx="13" ry="11" fill="#d4926a"/>
<ellipse cx="96" cy="111" rx="3" ry="2" fill="#a8664a"/><ellipse cx="105" cy="111" rx="3" ry="2" fill="#a8664a"/>
<path d="M69 93 Q78 85 87 93" stroke="#2b1d14" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="M113 93 Q122 85 131 93" stroke="#2b1d14" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="M62 81 Q77 69 91 78" stroke="#aaa59c" stroke-width="8" fill="none" stroke-linecap="round"/>
<path d="M109 78 Q123 69 138 81" stroke="#aaa59c" stroke-width="8" fill="none" stroke-linecap="round"/>
<path d="M78 66 Q100 60 122 66" stroke="#c98f68" stroke-width="2" fill="none"/>
<circle cx="70" cy="110" r="8" fill="#ef8f7a" opacity=".35"/><circle cx="130" cy="110" r="8" fill="#ef8f7a" opacity=".35"/>
`);

const BOLSONARO = svg(`
<defs><radialGradient id="bgB" cx="50%" cy="35%" r="80%"><stop offset="0" stop-color="#1c5bb5"/><stop offset="1" stop-color="#061633"/></radialGradient></defs>
<rect width="200" height="240" fill="url(#bgB)"/>
<g opacity=".12" fill="#fff"><circle cx="170" cy="36" r="24"/><circle cx="24" cy="80" r="28"/></g>
<path d="M14 240 C20 194 58 178 100 175 C142 178 180 194 186 240 Z" fill="#20232b"/>
<path d="M82 174 L100 212 L118 174 Z" fill="#f4f4f0"/>
<path d="M95 184 L105 184 L110 232 L100 240 L90 232 Z" fill="#1e6fd9"/>
<path d="M100 175 L64 180 L88 224 Z" fill="#2c303a"/><path d="M100 175 L136 180 L112 224 Z" fill="#2c303a"/>
<circle cx="64" cy="200" r="6" fill="#1fa34a" stroke="#ffd400" stroke-width="2.5"/>
<rect x="85" y="150" width="30" height="30" fill="#dfac88"/>
<ellipse cx="55" cy="104" rx="9" ry="15" fill="#e3b08d"/><ellipse cx="145" cy="104" rx="9" ry="15" fill="#e3b08d"/>
<ellipse cx="100" cy="100" rx="46" ry="62" fill="#ecbe9a"/>
<path d="M54 92 C50 52 72 34 102 34 C132 35 150 54 146 90 C142 70 136 62 128 58 C110 50 88 50 74 58 C64 64 58 76 54 92Z" fill="#3d3f44"/>
<path d="M74 58 C88 46 120 44 140 64 C122 56 96 56 74 64Z" fill="#55585e"/>
<path d="M54 92 C54 80 56 72 60 66" stroke="#8d9096" stroke-width="5" fill="none"/>
<path d="M146 90 C146 80 144 72 140 66" stroke="#8d9096" stroke-width="5" fill="none"/>
<path d="M66 90 L91 96" stroke="#3a3a3e" stroke-width="6" stroke-linecap="round"/>
<path d="M109 96 L134 90" stroke="#3a3a3e" stroke-width="6" stroke-linecap="round"/>
<ellipse cx="80" cy="102" rx="8" ry="3.5" fill="#1a1410"/><ellipse cx="120" cy="102" rx="8" ry="3.5" fill="#1a1410"/>
<path d="M100 102 C95 116 93 124 96 128 C99 131 104 130 106 127" stroke="#c98d68" stroke-width="3" fill="#e3ab84"/>
<ellipse cx="100" cy="146" rx="17" ry="11" fill="#5a1d18"/>
<rect x="88" y="138" width="24" height="5" rx="2" fill="#f7f3ea"/>
<path d="M82 145 Q100 132 118 145" stroke="#b97862" stroke-width="2.5" fill="none"/>
<path d="M74 78 Q80 74 88 76" stroke="#d29c79" stroke-width="2" fill="none"/>
<g fill="#7fd2ff" opacity=".9"><path d="M150 70 q5 9 0 13 q-5 -4 0 -13Z"/></g>
`);

const HITLER = svg(`
<defs><radialGradient id="bgH" cx="50%" cy="35%" r="80%"><stop offset="0" stop-color="#34404f"/><stop offset="1" stop-color="#0a0d12"/></radialGradient></defs>
<rect width="200" height="240" fill="url(#bgH)"/>
<path d="M12 240 C18 192 58 176 100 172 C142 176 182 192 188 240 Z" fill="#5b584a"/>
<path d="M74 172 L100 196 L126 172 L120 166 L100 182 L80 166 Z" fill="#4a473b"/>
<g fill="#2b2a24"><circle cx="100" cy="204" r="4"/><circle cx="100" cy="222" r="4"/></g>
<path d="M40 214 L160 190" stroke="#3b2f22" stroke-width="7"/>
<rect x="86" y="146" width="28" height="30" fill="#e8bf9d"/>
<ellipse cx="57" cy="104" rx="9" ry="14" fill="#ecc3a2"/><ellipse cx="143" cy="104" rx="9" ry="14" fill="#ecc3a2"/>
<ellipse cx="100" cy="100" rx="44" ry="56" fill="#f3cdad"/>
<path d="M56 96 C52 58 72 40 100 40 C128 40 148 58 144 94 C140 76 132 66 124 62 Z" fill="#2a1d15"/>
<path d="M124 46 C110 52 86 64 62 96 C66 72 80 54 100 46 Z" fill="#2a1d15"/>
<path d="M124 46 C112 60 96 74 72 92 L70 84 C88 70 104 58 118 48Z" fill="#3b2a1f"/>
<circle cx="80" cy="98" r="11" fill="#fff"/><circle cx="120" cy="98" r="11" fill="#fff"/>
<circle cx="82" cy="99" r="3.5" fill="#141414"/><circle cx="117" cy="99" r="3.5" fill="#141414"/>
<path d="M66 84 L92 80" stroke="#2a1d15" stroke-width="5" stroke-linecap="round"/>
<path d="M108 80 L134 84" stroke="#2a1d15" stroke-width="5" stroke-linecap="round"/>
<path d="M100 100 C96 112 95 118 98 121 C101 123 104 122 105 119" stroke="#cf9f80" stroke-width="3" fill="#ebb995"/>
<rect x="91" y="124" width="18" height="9" rx="1.5" fill="#141110"/>
<ellipse cx="100" cy="145" rx="14" ry="10" fill="#4a1414"/>
<path d="M90 141 Q100 138 110 141" stroke="#f6f0e6" stroke-width="3" fill="none"/>
<g stroke="#e53935" stroke-width="3" fill="none" stroke-linecap="round"><path d="M148 52 l8 -8 M152 60 l10 -2 M140 46 l2 -10"/></g>
<g fill="#7fd2ff"><path d="M150 82 q6 10 0 15 q-6 -5 0 -15Z"/><path d="M46 70 q5 8 0 12 q-5 -4 0 -12Z"/></g>
`);

const STALIN = svg(`
<defs><radialGradient id="bgS" cx="50%" cy="35%" r="80%"><stop offset="0" stop-color="#5b2a1e"/><stop offset="1" stop-color="#160806"/></radialGradient></defs>
<rect width="200" height="240" fill="url(#bgS)"/>
<g fill="#cfc7bb" opacity=".55"><circle cx="160" cy="118" r="7"/><circle cx="170" cy="100" r="9"/><circle cx="178" cy="78" r="11"/></g>
<path d="M12 240 C18 192 58 176 100 172 C142 176 182 192 188 240 Z" fill="#a29673"/>
<path d="M78 170 L100 186 L122 170 L122 160 L78 160 Z" fill="#8f845f"/>
<g fill="#6c6347"><circle cx="100" cy="200" r="4"/><circle cx="100" cy="218" r="4"/></g>
<path d="M60 196 h24 v14 h-24z M116 196 h24 v14 h-24z" fill="#8f845f"/>
<rect x="84" y="144" width="32" height="24" fill="#dcab83"/>
<ellipse cx="49" cy="104" rx="10" ry="15" fill="#dfae86"/><ellipse cx="151" cy="104" rx="10" ry="15" fill="#dfae86"/>
<ellipse cx="100" cy="100" rx="51" ry="56" fill="#e5b58e"/>
<path d="M50 92 C44 50 72 28 102 28 C134 28 158 52 150 92 C148 70 140 58 126 54 C110 48 90 48 74 54 C60 60 52 72 50 92Z" fill="#2c2b2a"/>
<path d="M74 40 C92 30 120 30 136 44" stroke="#77736d" stroke-width="4" fill="none"/>
<path d="M66 50 C84 38 118 36 140 54" stroke="#55524d" stroke-width="3" fill="none"/>
<path d="M62 84 Q78 74 92 82" stroke="#1d1c1b" stroke-width="8" fill="none" stroke-linecap="round"/>
<path d="M108 82 Q122 74 138 84" stroke="#1d1c1b" stroke-width="8" fill="none" stroke-linecap="round"/>
<path d="M68 96 Q78 92 88 96" stroke="#1a1410" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="M112 96 Q122 92 132 96" stroke="#1a1410" stroke-width="4" fill="none" stroke-linecap="round"/>
<ellipse cx="100" cy="112" rx="14" ry="13" fill="#d69a72"/>
<path d="M36 136 C50 116 80 112 100 124 C120 112 150 116 164 136 C150 132 138 140 122 136 C112 134 104 136 100 136 C96 136 88 134 78 136 C62 140 50 132 36 136Z" fill="#1b1a19"/>
<path d="M44 134 C60 124 82 122 98 130" stroke="#3b3936" stroke-width="2.5" fill="none"/>
<path d="M156 134 C140 124 118 122 102 130" stroke="#3b3936" stroke-width="2.5" fill="none"/>
<path d="M122 142 L150 144 L150 132 L160 132 L160 150 L124 150 Z" fill="#5b3a1e" stroke="#2e1c0e" stroke-width="2"/>
<g fill="#b57f5c" opacity=".7"><circle cx="72" cy="114" r="1.8"/><circle cx="130" cy="108" r="1.8"/><circle cx="124" cy="120" r="1.5"/><circle cx="78" cy="122" r="1.5"/></g>
`);

export const PORTRAITS: Record<PortraitId, string> = { lula: LULA, bolsonaro: BOLSONARO, hitler: HITLER, stalin: STALIN };

export function portraitURI(id: PortraitId): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(PORTRAITS[id]);
}

/** Bandeiras fictícias das facções (não reproduzem símbolos reais). */
export const FLAGS = {
  lula: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect width="300" height="200" fill="#c62828"/><rect y="150" width="300" height="50" fill="#8e1414"/><circle cx="150" cy="92" r="52" fill="none" stroke="#ffd54a" stroke-width="12" stroke-dasharray="14 9"/><circle cx="150" cy="92" r="38" fill="#ffd54a"/><path d="M134 66 h14 v40 h24 v14 h-38z" fill="#8e1414"/></svg>`,
  bolso: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect width="300" height="200" fill="#1e5fbf"/><path d="M0 0 L150 100 L0 200 Z" fill="#0b2f66"/><path d="M0 0 L22 0 L172 100 L22 200 L0 200 L150 100Z" fill="#f2f2f2"/><path d="M196 52 h46 a28 28 0 0 1 0 48 a28 28 0 0 1 0 48 h-46z" fill="#ffd54a"/><path d="M212 66 h26 a12 12 0 0 1 0 24 h-26z M212 106 h28 a12 12 0 0 1 0 24 h-28z" fill="#1e5fbf"/></svg>`,
};

export function flagURI(f: 'lula' | 'bolso'): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(FLAGS[f]);
}

// ---------------------------------------------------------------- ícones (24x24, traço)
const I = (d: string) =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICON = {
  money: I('<circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.6-1-1.8-1.5-3-1.5-1.7 0-3 .9-3 2.3 0 3.2 6 1.7 6 4.9 0 1.4-1.3 2.3-3 2.3-1.3 0-2.5-.5-3.1-1.5M12 5.5v13"/>'),
  fuel: I('<path d="M5 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15"/><path d="M4 21h12M7 9h6"/><path d="M15 11h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-3-3"/>'),
  steel: I('<path d="M4 5h16M4 19h16M12 5v14M8 5v2M16 5v2M8 17v2M16 17v2"/>'),
  supplies: I('<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
  industry: I('<path d="M2 21V10l6 4V10l6 4V6h4l2 15z"/><path d="M6 17h2M11 17h2M16 17h2"/>'),
  troops: I('<path d="M4 15a8 8 0 0 1 16 0z"/><path d="M2 15h20M9 15v3h6v-3"/>'),
  map: I('<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>'),
  clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  pause: I('<path d="M8 5v14M16 5v14"/>'),
  play: I('<path d="M7 5l12 7-12 7z"/>'),
  menu: I('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  save: I('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8M8 21v-7h8v7"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  swords: I('<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M9.5 6.5L13 3h3v3l-3.5 3.5"/>'),
  shield: I('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  star: I('<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>'),
  stop: I('<rect x="6" y="6" width="12" height="12" rx="1"/>'),
  hold: I('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12h6"/>'),
  attack: I('<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  home: I('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
  plane: I('<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>'),
  close: I('<path d="M6 6l12 12M18 6L6 18"/>'),
  select: I('<path d="M3 3h6M3 3v6M21 3h-6M21 3v6M3 21h6M3 21v-6M21 21h-6M21 21v-6"/>'),
  flag: I('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  trade: I('<path d="M7 7h13l-4-4M17 17H4l4 4"/>'),
  report: I('<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h3"/>'),
  info: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  sound: I('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  target: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>'),
  fast: I('<path d="M4 5l8 7-8 7zM12 5l8 7-8 7z"/>'),
  focus: I('<circle cx="12" cy="12" r="3"/><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/>'),
};
