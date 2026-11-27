const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
const source = html.match(/<script id="about-flip-script">([\s\S]*?)<\/script>/)[1];

function setup() {
  const events = () => ({
    listeners: {},
    addEventListener(name, handler) { this.listeners[name] = handler; },
    fire(name) { this.listeners[name]?.(); }
  });
  const nodes = Object.fromEntries(['button', 'pause', 'front', 'back'].map(name => [name, {
    ...events(), attributes: {}, interacting: false,
    getAttribute(key) { return this.attributes[key]; },
    setAttribute(key, value) { this.attributes[key] = value; },
    matches() { return this.interacting; }
  }]));
  nodes.button.attributes['aria-pressed'] = 'false';
  const document = { ...events(), hidden: false, getElementById: id => nodes[id.replace('about-flip-', '')] };
  const motion = { ...events(), matches: false };
  let observe, task;
  const window = {
    matchMedia: () => motion,
    clearTimeout: () => { task = undefined; },
    setTimeout: (run, delay) => { task = { run, delay }; return 1; }
  };
  vm.runInNewContext(source, {
    window, document,
    IntersectionObserver: class {
      constructor(callback) { observe = callback; }
      observe() {}
    }
  });
  return { nodes, document, motion, visible: value => observe([{ isIntersecting: value }]), getTask: () => task };
}

test('flips every 30000ms while visible and re-schedules after each flip', () => {
  const state = setup();
  assert.equal(state.getTask(), undefined);
  state.visible(true);
  assert.equal(state.getTask().delay, 30000);
  state.getTask().run();
  assert.equal(state.nodes.button.getAttribute('aria-pressed'), 'true');
  assert.equal(state.nodes.front.getAttribute('aria-hidden'), 'true');
  assert.equal(state.nodes.back.getAttribute('aria-hidden'), 'false');
  assert.equal(state.getTask().delay, 30000);
  state.getTask().run();
  assert.equal(state.nodes.button.getAttribute('aria-pressed'), 'false');
});

test('manual clicks flip immediately; pause/resume controls automatic changes', () => {
  const state = setup();
  state.visible(true);
  state.nodes.button.fire('click');
  assert.equal(state.nodes.button.getAttribute('aria-pressed'), 'true');
  state.nodes.pause.fire('click');
  assert.equal(state.getTask(), undefined);
  state.nodes.button.fire('click');
  assert.equal(state.nodes.button.getAttribute('aria-pressed'), 'false');
  state.nodes.pause.fire('click');
  assert.equal(state.getTask().delay, 30000);
});

test('stops automatic changes offscreen, in background, on focus, or with reduced motion', () => {
  const state = setup();
  state.visible(true);
  state.visible(false);
  assert.equal(state.getTask(), undefined);
  state.visible(true);
  state.document.hidden = true;
  state.document.fire('visibilitychange');
  assert.equal(state.getTask(), undefined);
  state.document.hidden = false;
  state.nodes.button.interacting = true;
  state.nodes.button.fire('focus');
  assert.equal(state.getTask(), undefined);
  state.nodes.button.interacting = false;
  state.nodes.button.fire('blur');
  assert.equal(state.getTask().delay, 30000);
  state.motion.matches = true;
  state.motion.fire('change');
  assert.equal(state.getTask(), undefined);
  assert.equal(state.nodes.pause.disabled, true);
  state.nodes.button.fire('click');
  assert.equal(state.nodes.button.getAttribute('aria-pressed'), 'true');
});
