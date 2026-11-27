const { readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
const cssPath = join(__dirname, 'portfolio.generated.css');
const css = readFileSync(cssPath, 'utf8');

test('loads prebuilt local CSS without the Tailwind browser compiler', () => {
  assert.match(html, /href="portfolio\.generated\.css(?:\?[^"]*)?"/);
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com|tailwind\.config/);
  assert.ok(statSync(cssPath).size < 80000, 'Generated CSS must stay below 80 KB');
});

test('prebuilt CSS retains utilities used by dynamic tabs, filtering, and modal states', () => {
  for (const name of ['hidden', 'opacity-0', 'opacity-100', 'scale-95', 'scale-100', 'pointer-events-none', 'pointer-events-auto']) {
    assert.ok(css.includes(`.${name} {`), `Missing dynamic utility ${name}`);
  }
  assert.match(css, /@media \(min-width: 640px\)/);
  assert.match(css, /@media \(min-width: 1280px\)/);
});
