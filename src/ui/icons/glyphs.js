// ÇİZGİ İKONLAR — bildirim, general özelliği, teknoloji dalı, barış şartı.
//
// Veride emoji durur (notifications.js `icon`, command.js TRAITS, technology
// kategorileri, peace.js şartları); ekran onu basmaz, kimliğe göre buradan
// çizgi ikon ister. Emoji her işletim sisteminde başka çizilir ve 14-20 px'te
// "telefondan yapıştırılmış" görünür; bu set üst çubuğun altın çizgi
// ikonlarıyla aynı dildedir (24×24, stroke, currentColor).
//
// Katman notu: yalnız SVG dizgisi üretir.

const P = {
  swords: '<path d="M4 4l9.5 9.5M20 4l-9.5 9.5M3 21l3-3M21 21l-3-3M6 18l-2-2 2-2M18 18l2-2-2-2M8 16l2 2M16 16l-2 2"/>',
  dove: '<path d="M3 13c3 0 5-1 7-4 1.5-2.2 3.5-4 6-4l2 1 3-1-2 3c0 5-4 9-10 9H6l-3 3"/><path d="M10 12l-3 4"/><circle cx="16" cy="7.5" r=".6" fill="currentColor"/>',
  scroll: '<path d="M7 4h11a2 2 0 0 1 0 4h-2v10a3 3 0 0 1-3 3H6a3 3 0 0 1 0-6h2V7a3 3 0 0 0-3-3"/><path d="M11 10h3M11 13h3"/>',
  medal: '<path d="M8 3l4 6 4-6M9 3h6"/><circle cx="12" cy="15" r="5"/><path d="M12 12.5l.8 1.7 1.8.2-1.3 1.2.4 1.8-1.7-.9-1.7.9.4-1.8-1.3-1.2 1.8-.2z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 5c3-2 6 2 9 0s4-1 5 0v8c-1-1-2-2-5 0s-6-2-9 0"/>',
  column: '<path d="M4 9h16L12 4z"/><path d="M6 9v9M10 9v9M14 9v9M18 9v9M3 21h18M4 18h16"/>',
  crane: '<path d="M6 21V5h12M6 5l4-2M18 5v4M16 9h4v3h-4z"/><path d="M6 9l6-4M3 21h8"/>',
  factory: '<path d="M3 21V11l5 3v-3l5 3v-3l5 3V5h3v16z"/><path d="M7 18h2M12 18h2M17 18h2"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 15h9"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 7v11M8 11h8"/>',
  ballot: '<path d="M4 12h16v9H4z"/><path d="M8 12V4h8v8M10 7h4M10 9.5h4M10 16h4"/>',
  warning: '<path d="M12 3l10 18H2z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".7" fill="currentColor"/>',
  bread: '<path d="M4 13c0-4 4-6 8-6s8 2 8 6v5H4z"/><path d="M8 10.5l1 2M12 10l1 2M16 10.5l1 2"/>',
  wheat: '<path d="M12 21V8"/><path d="M12 8c-2-1-3-3-2-5 2 1 3 3 2 5zM12 8c2-1 3-3 2-5-2 1-3 3-2 5z"/><path d="M12 13c-2-1-4-1-5-3 2-1 4 0 5 3zM12 13c2-1 4-1 5-3-2-1-4 0-5 3zM12 17c-2-1-4-1-5-3 2-1 4 0 5 3zM12 17c2-1 4-1 5-3-2-1-4 0-5 3z"/>',
  skull: '<path d="M5 11a7 7 0 0 1 14 0v3l-2 1v3H7v-3l-2-1z"/><circle cx="9.5" cy="11.5" r="1.5"/><circle cx="14.5" cy="11.5" r="1.5"/><path d="M10 18v2M14 18v2M12 14v1"/>',
  crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/><path d="M5 19h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r=".8" fill="currentColor"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  rail: '<path d="M7 3L4 21M17 3l3 18"/><path d="M6 7h12M5.4 11.5h13.2M4.8 16h14.4"/>',
  anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M8 10h8M4 13a8 8 0 0 0 16 0M4 13l-1 2M20 13l1 2"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c2 2 10 2 12 0v-5M22 9v6"/>',
  mask: '<path d="M4 6c5 1.5 11 1.5 16 0v6c0 5-4 8-8 8s-8-3-8-8z"/><path d="M7 11c1-1 2-1 3 0M14 11c1-1 2-1 3 0M9 15.5c2 1.5 4 1.5 6 0"/>',
  crate: '<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9M7.5 6l9 4"/>',
  tools: '<path d="M4 20l8-8M14 4l6 6-3 1-4-4zM13.5 8.5L16 11"/><path d="M20 20l-7-7M4 4l3 1 2 3-2 2-3-2z"/>',
  horse: '<path d="M8 21v-5l-3-2c0-4 2-8 7-10l1-2 1 2c2 1 4 3 4 6l1 3-2 1-2-2h-2l1 4v5"/><circle cx="13.5" cy="7" r=".6" fill="currentColor"/>',
  burst: '<path d="M12 2l2 6 6-3-3 6 6 2-6 2 3 6-6-3-2 6-2-6-6 3 3-6-6-2 6-2-3-6 6 3z"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 8.5c-.6-1-1.5-1.5-2.5-1.5-1.7 0-2.5 1.2-2.5 2.5 0 3 0 4-1 6.5h6.5M8 12.5h5"/>',
  pick: '<path d="M4 9c4-5 12-5 16 0M12 6l-7 15"/><path d="M10.5 9.5l3 1.5"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
};

/** Çizgi ikon. `cls` boyut ve renk sınıfı için (varsayılan 1em). */
export function glyph(name, cls = '') {
  const path = P[name] ?? P.info;
  return `<svg class="glyph${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/** Bildirim türü → ikon. */
export const NOTIFY_GLYPH = {
  WAR: 'swords', PEACE: 'dove', DIPLOMACY: 'scroll', BATTLE: 'swords', FIELD_WIN: 'medal',
  CONQUEST: 'flag', CITY: 'column', BUILDING: 'crane', INDUSTRY: 'factory', RESEARCH: 'flask',
  ARMY: 'shield', COMMANDER: 'medal', POLITICS: 'ballot', CRISIS: 'warning', HUNGER: 'bread',
  RELIEF: 'wheat', NATION: 'skull', HEGEMONY: 'crown', INFO: 'info',
};

/** Barış şartı → ikon. */
export const TERM_GLYPH = {
  REPARATIONS: 'coin', DEMILITARIZE: 'swords', CONCESSION: 'pick', LIBERATE: 'flag', VASSALIZE: 'crown',
};
