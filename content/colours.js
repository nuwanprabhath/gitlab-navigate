// Runner-badge colours, shared by the GitLab page script and the popup's settings. A
// classic script (content scripts cannot use static ES module imports) that touches no
// chrome.* or document, so bun can import it for tests.
(() => {
  const DARK_TEXT = '#1f1e24';
  const LIGHT_TEXT = '#ffffff';

  // Solid fills with their own text colour, so a badge reads the same in GitLab's light
  // and dark themes. Every pairing has a contrast ratio of at least 4.5:1.
  const PALETTE = {
    red: { background: '#c91c00', color: LIGHT_TEXT },
    orange: { background: '#ee8220', color: DARK_TEXT },
    green: { background: '#217645', color: LIGHT_TEXT },
    blue: { background: '#1f6fc2', color: LIGHT_TEXT },
    purple: { background: '#7b58cf', color: LIGHT_TEXT },
    teal: { background: '#0a7c80', color: LIGHT_TEXT },
    pink: { background: '#b8336a', color: LIGHT_TEXT },
    slate: { background: '#5c6770', color: LIGHT_TEXT },
  };

  const DEFAULT_RUNNER_COLOURS = [
    ['perentie-runner', 'red'],
    ['huy-runner', 'orange'],
    ['nuwan-runner', 'green'],
  ];

  // Tags without an explicit colour pick one of these: the palette minus the defaults.
  const AUTOMATIC = ['blue', 'purple', 'teal', 'pink', 'slate'];

  const FORMAT_HINT = 'Use tag=colour, e.g. perentie-runner=red';

  const isName = (text) => Object.hasOwn(PALETTE, text);

  // '#abc' / '#AABBCC' -> '#aabbcc'; null for anything else.
  function normalizeHex(text) {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
    if (!match) return null;
    const digits = match[1].toLowerCase();
    const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
    return `#${full}`;
  }

  function luminance(hex) {
    const channel = (start) => {
      const value = parseInt(hex.slice(start, start + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  }

  function contrastRatio(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  function textColourFor(background) {
    return contrastRatio(background, LIGHT_TEXT) >= contrastRatio(background, DARK_TEXT)
      ? LIGHT_TEXT
      : DARK_TEXT;
  }

  // A palette name or hex -> { background, color }; null for anything else.
  function colourFor(colour) {
    const name = String(colour).toLowerCase();
    if (isName(name)) return PALETTE[name];
    const hex = normalizeHex(String(colour));
    return hex ? { background: hex, color: textColourFor(hex) } : null;
  }

  // FNV-1a, 32-bit: the same tag gets the same number in every browser, forever.
  function hash(text) {
    let value = 0x811c9dc5;
    for (const char of text) {
      value ^= char.charCodeAt(0);
      value = Math.imul(value, 0x01000193) >>> 0;
    }
    return value >>> 0;
  }

  function resolveRunnerColour(tag, pairs) {
    const key = tag.toLowerCase();
    const pair = (pairs ?? []).find(([name]) => name.toLowerCase() === key);
    const explicit = pair ? colourFor(pair[1]) : null;
    return explicit ?? PALETTE[AUTOMATIC[hash(key) % AUTOMATIC.length]];
  }

  // Settings text -> { pairs } or { error }. Entries are `tag=colour`, separated by commas,
  // whitespace or new lines; empty input is valid and means "no explicit colours".
  function parseRunnerColours(text) {
    const entries = String(text ?? '')
      .replace(/\s*=\s*/g, '=')
      .split(/[\s,]+/)
      .filter(Boolean);
    const pairs = [];
    const seen = new Set();
    for (const entry of entries) {
      const at = entry.indexOf('=');
      if (at < 1 || at === entry.length - 1) return { error: FORMAT_HINT };
      const tag = entry.slice(0, at);
      const given = entry.slice(at + 1);
      const colour = isName(given.toLowerCase()) ? given.toLowerCase() : normalizeHex(given);
      if (!colour) return { error: `Unknown colour "${given}" for ${tag}` };
      if (seen.has(tag.toLowerCase())) return { error: `${tag} is listed twice` };
      seen.add(tag.toLowerCase());
      pairs.push([tag, colour]);
    }
    return { pairs };
  }

  // Storage values are only trusted if they are an array of [string, string] pairs.
  function sanitizeRunnerColours(value) {
    const valid =
      Array.isArray(value) &&
      value.every(
        (pair) =>
          Array.isArray(pair) &&
          pair.length === 2 &&
          typeof pair[0] === 'string' &&
          typeof pair[1] === 'string',
      );
    return valid ? value : null;
  }

  function formatRunnerColours(pairs) {
    return pairs.map(([tag, colour]) => `${tag}=${colour}`).join(', ');
  }

  globalThis.gitlabNavigateColours = {
    PALETTE,
    DEFAULT_RUNNER_COLOURS,
    parseRunnerColours,
    resolveRunnerColour,
    sanitizeRunnerColours,
    formatRunnerColours,
    textColourFor,
    contrastRatio,
  };
})();
