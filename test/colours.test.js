import { describe, expect, test } from 'bun:test';
import '../content/colours.js';

const {
  PALETTE,
  DEFAULT_RUNNER_COLOURS,
  parseRunnerColours,
  resolveRunnerColour,
  sanitizeRunnerColours,
  formatRunnerColours,
  textColourFor,
  contrastRatio,
} = globalThis.gitlabNavigateColours;

const DARK = '#1f1e24';
const AUTOMATIC = ['blue', 'purple', 'teal', 'pink', 'slate'].map((n) => PALETTE[n].background);
const FORMAT_HINT = 'Use tag=colour, e.g. perentie-runner=red';

describe('parseRunnerColours', () => {
  test('reads tag=colour pairs with palette names', () => {
    expect(parseRunnerColours('perentie-runner=red, huy-runner=orange')).toEqual({
      pairs: [['perentie-runner', 'red'], ['huy-runner', 'orange']],
    });
  });

  test('normalizes hex colours to #rrggbb, lower case, expanding #rgb', () => {
    expect(parseRunnerColours('a=#C2185B, b=#ABC')).toEqual({
      pairs: [['a', '#c2185b'], ['b', '#aabbcc']],
    });
  });

  test('separates entries by commas, spaces and new lines', () => {
    expect(parseRunnerColours('a=red\nb=blue  c=teal,d=pink').pairs).toEqual([
      ['a', 'red'], ['b', 'blue'], ['c', 'teal'], ['d', 'pink'],
    ]);
  });

  test('tolerates spaces around the equals sign', () => {
    expect(parseRunnerColours('perentie-runner = red, huy-runner =orange').pairs).toEqual([
      ['perentie-runner', 'red'], ['huy-runner', 'orange'],
    ]);
  });

  test('lower-cases the colour name but keeps the tag as typed', () => {
    expect(parseRunnerColours('Huy-Runner=ORANGE').pairs).toEqual([['Huy-Runner', 'orange']]);
  });

  test('empty, blank and undefined input are valid and give no pairs', () => {
    expect(parseRunnerColours('')).toEqual({ pairs: [] });
    expect(parseRunnerColours('  \n ')).toEqual({ pairs: [] });
    expect(parseRunnerColours(undefined)).toEqual({ pairs: [] });
  });

  test('ignores trailing separators', () => {
    expect(parseRunnerColours('a=red,, ').pairs).toEqual([['a', 'red']]);
  });

  test('rejects an entry without a tag, an equals sign or a colour', () => {
    for (const text of ['perentie-runner', '=red', 'perentie-runner=']) {
      expect(parseRunnerColours(text)).toEqual({ error: FORMAT_HINT });
    }
  });

  test('names the tag and colour of an unknown colour', () => {
    expect(parseRunnerColours('huy-runner=orang')).toEqual({
      error: 'Unknown colour "orang" for huy-runner',
    });
    expect(parseRunnerColours('a=#12')).toEqual({ error: 'Unknown colour "#12" for a' });
  });

  test('does not treat inherited object keys as palette names', () => {
    expect(parseRunnerColours('a=constructor')).toEqual({
      error: 'Unknown colour "constructor" for a',
    });
  });

  test('rejects a tag listed twice, ignoring case', () => {
    expect(parseRunnerColours('a=red, A=blue')).toEqual({ error: 'A is listed twice' });
  });

  test('reports the first problem in order', () => {
    expect(parseRunnerColours('a=nope, b')).toEqual({ error: 'Unknown colour "nope" for a' });
  });
});

describe('resolveRunnerColour', () => {
  test('uses the explicit pair for a tag', () => {
    expect(resolveRunnerColour('perentie-runner', DEFAULT_RUNNER_COLOURS)).toEqual(PALETTE.red);
    expect(resolveRunnerColour('huy-runner', DEFAULT_RUNNER_COLOURS)).toEqual(PALETTE.orange);
    expect(resolveRunnerColour('nuwan-runner', DEFAULT_RUNNER_COLOURS)).toEqual(PALETTE.green);
  });

  test('matches tags case-insensitively in both directions', () => {
    expect(resolveRunnerColour('PERENTIE-runner', DEFAULT_RUNNER_COLOURS)).toEqual(PALETTE.red);
    expect(resolveRunnerColour('perentie-runner', [['Perentie-Runner', 'blue']])).toEqual(PALETTE.blue);
  });

  test('gives unlisted tags a stable automatic colour', () => {
    expect(resolveRunnerColour('gpu-runner', [])).toEqual(PALETTE.teal);
    expect(resolveRunnerColour('cypress', [])).toEqual(PALETTE.blue);
    expect(resolveRunnerColour('docker', [])).toEqual(PALETTE.purple);
    expect(resolveRunnerColour('arm64', [])).toEqual(PALETTE.slate);
    expect(resolveRunnerColour('gpu-runner', [])).toEqual(resolveRunnerColour('GPU-runner', []));
  });

  test('automatic colours only come from the five non-default colours and use all five', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) {
      const { background } = resolveRunnerColour(`runner-${i}`, []);
      expect(AUTOMATIC).toContain(background);
      seen.add(background);
    }
    expect(seen.size).toBe(5);
  });

  test('uses a hex pair with whichever text colour contrasts more', () => {
    expect(resolveRunnerColour('x', [['x', '#ffffff']])).toEqual({ background: '#ffffff', color: DARK });
    expect(resolveRunnerColour('x', [['x', '#000000']])).toEqual({ background: '#000000', color: '#ffffff' });
  });

  test('falls back to the automatic colour for an unparsable stored colour or missing pairs', () => {
    expect(resolveRunnerColour('gpu-runner', [['gpu-runner', 'nope']])).toEqual(PALETTE.teal);
    expect(resolveRunnerColour('gpu-runner', undefined)).toEqual(PALETTE.teal);
  });
});

describe('text colour and contrast', () => {
  test('every palette pairing has at least 4.5:1 contrast', () => {
    for (const { background, color } of Object.values(PALETTE)) {
      expect(contrastRatio(background, color)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('textColourFor picks dark text on light fills and white on dark fills', () => {
    expect(textColourFor('#ffffff')).toBe(DARK);
    expect(textColourFor('#000000')).toBe('#ffffff');
  });
});

describe('sanitizeRunnerColours and formatRunnerColours', () => {
  test('accepts an array of [string, string] pairs, including an empty one', () => {
    expect(sanitizeRunnerColours([['a', 'red']])).toEqual([['a', 'red']]);
    expect(sanitizeRunnerColours([])).toEqual([]);
  });

  test('rejects anything else', () => {
    for (const value of [undefined, null, 'nonsense', { a: 'red' }, [['a']], [['a', 1]], [['a', 'red', 'x']], ['a=red']]) {
      expect(sanitizeRunnerColours(value)).toBeNull();
    }
  });

  test('formats pairs as tag=colour joined by ", "', () => {
    expect(formatRunnerColours(DEFAULT_RUNNER_COLOURS)).toBe(
      'perentie-runner=red, huy-runner=orange, nuwan-runner=green',
    );
    expect(formatRunnerColours([])).toBe('');
  });
});
