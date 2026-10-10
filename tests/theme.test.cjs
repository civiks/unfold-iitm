const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../bookmarklet/bookmarklet-source.js'), 'utf8')
  .replace('__CSS__', JSON.stringify(fs.readFileSync(path.join(__dirname, '../bookmarklet/styles.css'), 'utf8')));
const node = (backgroundColor, color, parentElement = null) => ({ backgroundColor, color, parentElement });
const body = node('rgb(255, 255, 255)', 'rgb(36, 36, 36)');
const view = node('rgba(0, 0, 0, 0)', body.color, body);
const question = node('transparent', body.color, view);
const stem = node('transparent', body.color, view);
const option = node('rgb(248, 248, 250)', body.color, question);
let style, writes = 0;
const context = {
  SEL: { view: 'view', option: 'option' }, liveQ: () => question,
  $: (selector) => ({ view, '.backend-html': stem, option, '#saq-style': style })[selector],
  getComputedStyle: (el) => el,
  document: {
    createElement: () => ({ get textContent() { return this.text || ''; }, set textContent(v) { this.text = v; writes++; } }),
    head: { appendChild: (el) => { style = el; } },
  },
};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  const CSS ='), source.indexOf('  // Settle')), context);
const run = (expression) => vm.runInContext(expression, context);
assert.equal(run('themeCSS()'), '', 'Light mode retains the existing palette');
body.backgroundColor = 'rgb(20, 23, 32)';
question.backgroundColor = 'rgb(28, 32, 43)';
stem.color = 'rgb(245, 245, 245)';
option.backgroundColor = 'rgb(35, 40, 54)';
const dark = run('themeCSS()');
for (const rule of ['--saq-bg: rgb(20, 23, 32)', '--saq-card: rgb(28, 32, 43)', '--saq-ink: rgb(245, 245, 245)', '--saq-control: rgb(35, 40, 54)']) assert.ok(dark.includes(rule), rule);
run('ensureStyle(); ensureStyle()');
assert.equal(writes, 1, 'Unchanged colors do not keep triggering the DOM observer');
body.backgroundColor = 'rgb(255, 255, 255)';
run('ensureStyle()');
assert.equal(writes, 2);
assert.ok(!style.textContent.includes('color-scheme: dark'), 'Switching back removes the dark palette');
assert.ok(run('CSS').includes('#saq-sheet .saq-block * { color: #000 !important; }'), 'Printed answers remain readable');
console.log('Theme checks passed');
