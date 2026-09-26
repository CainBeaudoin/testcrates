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
  send: svg(`<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>`),
  dice: svg(
    `<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="16" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1.1" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1.1" fill="currentColor" stroke="none"/>`
  ),
};

// Partner marks, filled in currentColor so they sit in either theme.
// ODTO: its stacked OD/TO block wordmark, as printed on the crate (redrawn
// from the box art). Robinhood: its feather, from Simple Icons (CC0).
const ODTO_MARK = `
  <svg class="brand-mark brand-mark-odto" viewBox="0 0 94 94" fill="currentColor" fill-rule="evenodd" role="img" aria-label="ODTO">
    <path d="M9 0h26a9 9 0 0 1 9 9v26a9 9 0 0 1-9 9H9a9 9 0 0 1-9-9V9a9 9 0 0 1 9-9zm8 12a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V14a2 2 0 0 0-2-2z"/>
    <path d="M52 0h28a14 14 0 0 1 14 14v16a14 14 0 0 1-14 14H52a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm15 12a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V14a2 2 0 0 0-2-2z"/>
    <path d="M3 50h38a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H30v27a3 3 0 0 1-3 3h-10a3 3 0 0 1-3-3V64H3a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3z"/>
    <path d="M59 50h26a9 9 0 0 1 9 9v26a9 9 0 0 1-9 9H59a9 9 0 0 1-9-9V59a9 9 0 0 1 9-9zm8 12a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V64a2 2 0 0 0-2-2z"/>
  </svg>`;
const ROBINHOOD_MARK = `
  <svg class="brand-mark brand-mark-robinhood" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M2.84 24h.53c.096 0 .192-.048.224-.128C7.591 13.696 11.94 8.656 14.67 5.638c.112-.128.064-.225-.096-.225h-4.88a.55.55 0 0 0-.45.225L5.746 9.972c-.514.642-.642 1.236-.642 2.086v4.43c-1.14 3.194-1.862 5.361-2.392 7.32-.032.125.016.192.129.192M20.447.646c-.754-.802-4.157-.834-5.73-.224a3 3 0 0 0-.786.465 41 41 0 0 0-3.323 3.178c-.112.113-.064.225.097.225h5.409c.497 0 .786.289.786.786v6.1c0 .16.128.208.225.064l3.258-4.254c.53-.69.69-.898.835-1.861.192-1.413.08-3.58-.77-4.479m-6.982 16.18 2.231-3.676a.7.7 0 0 0 .064-.29V6.73c0-.16-.112-.225-.224-.097-3.355 3.74-5.971 7.672-8.395 12.407-.06.12.016.225.16.177l5.009-1.54c.565-.174.882-.402 1.155-.852"/>
  </svg>`;

/** A crate partner as its logo: ODTO's mark alone (it is the name), the
 *  Robinhood feather beside the chain's name. Anything else, as text. */
export function brandMarkHTML(name) {
  if (name === "ODTO") return ODTO_MARK;
  if (name === "Robinhood Chain") return `${ROBINHOOD_MARK}<span>Robinhood Chain</span>`;
  return `<span>${name}</span>`;
}
