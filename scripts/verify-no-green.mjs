/**
 * Palette gate: the retired green/teal family must not come back.
 *
 * Scans both `src/styles/**.css` **and** `src/**.js`. Scanning only the
 * stylesheets left a blind spot: `src/data/study-content.js` defined
 * `subjectPalette.math = "#13785f"` — hue 165.1°, saturation 0.727, which this
 * gate's own rule flags — and it reached production through `src/app.js`
 * without ever being looked at.
 *
 * Run `npm run test:palette`.
 */
import fs from "node:fs/promises";
import path from "node:path";

const scanRoot = path.resolve("src");
const SOURCE_EXTENSIONS = [".css", ".js"];
// Below this max-min channel spread a colour is a near-grey; hue is meaningless.
const MIN_CHROMA = 12;
const findings = [];

async function sourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension)) ? [target] : [];
  }));
  return nested.flat();
}

function greenHue(red, green, blue) {
  const [r, g, b] = [red, green, blue].map((value) => Math.max(0, Math.min(255, value)) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (!delta) return false;
  // HSL saturation blows up near pure white and pure black: #fbfcfa (a 2/255
  // delta at lightness 0.98) computes to saturation 0.25 and would be reported
  // as "green". Require a perceptible chroma before judging hue at all.
  if (delta * 255 < MIN_CHROMA) return false;
  let hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  const lightness = (max + min) / 2;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  return hue >= 75 && hue <= 190 && saturation >= 0.18;
}

function rgbFromHex(token) {
  let value = token.slice(1);
  if (value.length === 3 || value.length === 4) value = value.split("").map((character) => character + character).join("");
  if (value.length < 6) return null;
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
}

for (const file of await sourceFiles(scanRoot)) {
  const source = await fs.readFile(file, "utf8");
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    // `(?<!&)` keeps HTML numeric entities out of the scan: `escapeAttr` writes
    // a backtick as `&#096;`, which otherwise reads as the hex colour `#096`.
    for (const match of line.matchAll(/(?<!&)#[0-9a-f]{3,8}\b/gi)) {
      const channels = rgbFromHex(match[0]);
      if (channels && greenHue(...channels)) findings.push({ file, line: index + 1, token: match[0] });
    }
    for (const match of line.matchAll(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/gi)) {
      const channels = match.slice(1, 4).map(Number);
      if (greenHue(...channels)) findings.push({ file, line: index + 1, token: match[0] });
    }
  });
}

if (findings.length) {
  console.error(JSON.stringify({ ok: false, findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checked: "src/**/*.{css,js}", rule: "no saturated green or teal colors" }));
