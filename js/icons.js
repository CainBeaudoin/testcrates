// Small inline-SVG icon set (stroke-based, currentColor) used in place of
// emoji throughout the UI. Each export is a ready-to-inject SVG string.

const svg = (inner, { fill = "none" } = {}) => `
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="${fill}" stroke="currentColor"
       stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    ${inner}
  </svg>`;

export const ICONS = {
  card: svg(`<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>`),
  cash: svg(
    `<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>`
  ),
  bell: svg(`<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>`),
  flame: svg(
    `<path d="M12 22c4.5 0 7-3 7-7 0-3.5-2-5.5-3.5-8C14.5 9 13 10 13 10s1-4-2-8c0 4-4 6-4 11a5 5 0 0 0 5 5z"/>`,
    { fill: "currentColor" }
  ),
  volume: svg(
    `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>`
  ),
  volumeMuted: svg(
    `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`
  ),
};
