#!/usr/bin/env bash
# Re-render the README screenshots from the real popup markup.
# Run this after ANY change to popup.html / popup.css, then commit docs/*.png.
#
#   ./tools/screenshot.sh
#
# Notes on why this is more than one Chrome invocation:
#   * The popup's JavaScript needs the chrome.* APIs, so it is stripped for the render
#     and the Recent list is injected as static markup mirroring renderHistory().
#   * Headless Chrome ignores --blink-settings=preferredColorScheme and inherits the
#     host appearance, so neither theme can be selected that way. Instead the two
#     palettes are read out of popup.css and the wanted one is re-applied as a plain
#     :root block, which overrides the media query. The values still come from the real
#     stylesheet, so the screenshots cannot drift from it.
set -euo pipefail

cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "Chrome not found at: $CHROME (override with \$CHROME)" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp popup.css "$WORK/"

python3 - "$WORK" <<'PY'
import re, sys, pathlib

work = pathlib.Path(sys.argv[1])
html = pathlib.Path('popup.html').read_text()
css = pathlib.Path('popup.css').read_text()

html = html.replace('<script type="module" src="popup.js"></script>', '')

rows = [
    ('Create', '2846-regression-fix'),
    ('Ticket', '2846'),
    ('History', 'dev/1.0.11'),
    ('Pipeline', '2753700544'),
]
items = '\n'.join(
    f'<li class="recent-item">'
    f'<button type="button" class="recent-nav">'
    f'<span class="badge">{badge}</span><span class="value">{value}</span>'
    f'</button>'
    f'<button type="button" class="recent-delete" aria-label="Remove from recent">&#128465;</button>'
    f'</li>'
    for badge, value in rows)
html = (html
        .replace('<section id="recent" class="recent" hidden>', '<section id="recent" class="recent">')
        .replace('<ul id="recent-list"></ul>', f'<ul id="recent-list">{items}</ul>'))

# The To box is pre-filled from settings at runtime; showing it as an empty
# placeholder would misrepresent the resting state of the popup.
html = html.replace('<input id="mr-to" type="text" spellcheck="false" placeholder="dev/1.0.11" />',
                    '<input id="mr-to" type="text" spellcheck="false" placeholder="dev/1.0.11" value="dev/1.0.11" />')

# Pinned pipelines are fetched from the GitLab API at runtime, so they get the same
# static treatment as Recent. Glyphs and statuses match STATUS_GLYPHS in popup.js.
pins = [
    ('running', '&#x25CF;', '2816150418', 'dev/1.0.11', '4m 12s'),
    ('success', '&#x2713;', '2816150001', 'fix-plot-layout-pro-expansion-issue', '7m 3s'),
    ('failed', '&#x2715;', '2815998877', '2846-regression-fix', '2m 41s'),
]
pin_items = '\n'.join(
    f'<li class="pin-item">'
    f'<button type="button" class="pin-nav">'
    f'<span class="pin-status" data-status="{status}">{glyph}</span>'
    f'<span class="pin-main"><span class="pin-id">#{pid}</span>'
    f'<span class="pin-ref">{ref}</span></span>'
    f'<span class="pin-duration">{duration}</span>'
    f'</button>'
    f'<button type="button" class="pin-remove" aria-label="Unpin this pipeline">&#x2715;</button>'
    f'</li>'
    for status, glyph, pid, ref, duration in pins)
html = (html
        .replace('<section id="pinned" class="recent" hidden>', '<section id="pinned" class="recent">')
        .replace('<ul id="pinned-list"></ul>', f'<ul id="pinned-list">{pin_items}</ul>'))

light = re.search(r'^:root\s*\{([^}]*)\}', css, re.M)
dark = re.search(r'@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}', css)
if not (light and dark):
    sys.exit('could not find both :root palettes in popup.css')

for name, block in (('light', light.group(1)), ('dark', dark.group(1))):
    forced = f'<style>:root {{{block}}}</style>'
    (work / f'popup-{name}.html').write_text(html.replace('</head>', f'{forced}\n</head>'))
PY

for theme in light dark; do
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --screenshot="$PWD/docs/popup-$theme.png" --window-size=330,1100 \
    "file://$WORK/popup-$theme.html" >/dev/null 2>&1
done

# Trim the dead space below the popup so the images sit tight in the README.
python3 - <<'PY'
import zlib, struct, pathlib

def read(path):
    d = path.read_bytes(); i = 8; idat = b''
    while i < len(d):
        ln = struct.unpack('>I', d[i:i+4])[0]; typ = d[i+4:i+8]; body = d[i+8:i+8+ln]
        if typ == b'IHDR': w, h, _, ct = struct.unpack('>IIBB', body[:10])
        elif typ == b'IDAT': idat += body
        i += 12 + ln
    ch = {0: 1, 2: 3, 4: 2, 6: 4}[ct]; stride = w * ch
    raw = zlib.decompress(idat); rows = []; prev = bytearray(stride); pos = 0
    for _ in range(h):
        f = raw[pos]; pos += 1
        line = bytearray(raw[pos:pos+stride]); pos += stride
        if f:
            for x in range(stride):
                a = line[x-ch] if x >= ch else 0
                b = prev[x]
                c = prev[x-ch] if x >= ch else 0
                if f == 1: line[x] = (line[x] + a) & 255
                elif f == 2: line[x] = (line[x] + b) & 255
                elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
                else:
                    p = a + b - c; pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                    line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(bytes(line)); prev = line
    return w, ch, rows

def write(path, w, ch, rows):
    ct = {1: 0, 2: 4, 3: 2, 4: 6}[ch]
    raw = b''.join(b'\x00' + r for r in rows)
    def chunk(t, b):
        return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'
                     + chunk(b'IHDR', struct.pack('>IIBBBBB', w, len(rows), 8, ct, 0, 0, 0))
                     + chunk(b'IDAT', zlib.compress(raw, 9))
                     + chunk(b'IEND', b''))

for name in ('popup-light.png', 'popup-dark.png'):
    p = pathlib.Path('docs') / name
    w, ch, rows = read(p)
    bg = rows[-1][:3]
    last = max((y for y, r in enumerate(rows)
                if any(r[x*ch:x*ch+3] != bg for x in range(0, w, 3))), default=len(rows)-1)
    write(p, w, ch, rows[:last + 10])
    print(f'{name}: {w}x{last + 10}  bg={tuple(bg)}')
PY
