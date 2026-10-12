'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/site/assets/page_navigation.js', 'utf8');

class Events {
  constructor() { this.events = new Map(); }
  addEventListener(type, callback) {
    if (!this.events.has(type)) this.events.set(type, []);
    this.events.get(type).push(callback);
  }
  dispatchEvent(event) { for (const callback of this.events.get(event.type) || []) callback(event); }
}
class Element extends Events {
  constructor() { super(); this.dataset = {}; this.attrs = new Map(); this.style = {}; this.inert = false; }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  hasAttribute(name) { return this.attrs.has(name); }
  closest() { return this; }
  matches() { return Boolean(this.dataset.sitePage); }
  focus() { this.focused = true; }
}
function fixture(base, start, embedded = false) {
  const location = new URL(start === 'document' ? 'index.html#section-13' : 'experiments.html', base);
  const window = new Events(), document = new Events(), frames = [], messages = [], lifecycle = [];
  const links = ['document', 'experiments'].map(kind => {
    const link = new Element();
    link.href = new URL(kind === 'document' ? 'index.html' : 'experiments.html', base).href;
    link.dataset.sitePage = kind;
    if (kind === start) link.setAttribute('aria-current', 'page');
    return link;
  });
  document.title = start === 'document' ? '当前文档' : 'selected experiment';
  document.documentElement = new Element();
  document.body = {children: [new Element()], append(frame) { this.children.push(frame); }};
  document.querySelectorAll = () => links;
  document.querySelector = () => null;
  document.getElementById = () => null;
  document.createElement = kind => {
    assert.equal(kind, 'iframe');
    const frame = new Element();
    frame.contentWindow = {postMessage(message) { messages.push(message); }};
    frames.push(frame);
    return frame;
  };
  window.parent = embedded ? {postMessage(message) { messages.push(message); }} : window;
  window.name = embedded ? 'spatial-notes-cached-page' : '';
  window.scrollX = 0;
  window.scrollY = 2468;
  window.scrollTo = (x, y) => { window.scrollX = x; window.scrollY = y; };
  window.addEventListener('spatialnotes:activechange', event => lifecycle.push(event.detail.active));
  const history = {state: null, changes: [], replaceState(state, _, url) { this.state = state; this.changes.push(['replace', url]); location.href = url; },
    pushState(state, _, url) { this.state = state; this.changes.push(['push', url]); location.href = url; }};
  const context = vm.createContext({window, document, location, history, URL, requestAnimationFrame: fn => fn(),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    MutationObserver: class { observe() {} }});
  vm.runInContext(source, context);
  function click(kind, extra = {}) {
    const event = {type: 'click', button: 0, target: links.find(link => link.dataset.sitePage === kind),
      defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra};
    document.dispatchEvent(event);
    return event.defaultPrevented;
  }
  function child(type, extra = {}, overrides = {}) {
    window.dispatchEvent({type: 'message', origin: location.origin, source: frames[0]?.contentWindow,
      data: {channel: 'spatial-notes-navigation', page: start === 'document' ? 'experiments' : 'document', type, ...extra}, ...overrides});
  }
  return {window, document, frames, messages, lifecycle, location, history, click, child};
}

let cases = 0;
for (const base of ['https://pages.invalid/spatial-notes-experiments/', 'file:///D:/static-site/']) {
  for (const start of ['document', 'experiments']) {
    const f = fixture(base, start), other = start === 'document' ? 'experiments' : 'document';
    assert.equal(f.click(other, {ctrlKey: true}), false, 'modified links stay native');
    assert.equal(f.frames.length, 0);
    assert.equal(f.click(other), true);
    const cached = f.frames[0], original = f.document.body.children[0];
    assert.equal(cached.style.visibility, 'visible');
    assert.equal(original.inert, true);
    assert.ok(cached.style.cssText.includes('height:100%'));
    assert.ok(!cached.style.cssText.includes('display:none'));
    const initialSource = cached.src;
    cached.viewerMemory = {task: 'harness-living-room', step: 17, yaw: .3, layers: [true, false]};
    f.child('ready', {url: initialSource, title: 'cached selected task'});
    assert.equal(f.document.title, 'cached selected task');
    f.child('navigate', {target: start}, {origin: 'https://untrusted.invalid'});
    assert.equal(cached.style.visibility, 'visible', 'untrusted messages cannot switch');
    f.child('navigate', {target: start});
    assert.equal(cached.style.visibility, 'hidden');
    assert.equal(original.inert, false);
    assert.equal(f.window.scrollY, 2468);
    f.click(other);
    assert.equal(f.frames.length, 1, 'repeated navigation creates no new frame');
    assert.equal(cached.src, initialSource, 'cached document is not reloaded');
    assert.equal(cached.viewerMemory.step, 17);
    assert.equal(cached.viewerMemory.yaw, .3);
    f.location.href = new URL(start === 'document' ? 'index.html#section-13' : 'experiments.html', base).href;
    f.window.dispatchEvent({type: 'popstate', state: {siteNavigation: {page: start}}});
    assert.equal(cached.style.visibility, 'hidden');
    assert.equal(f.window.scrollY, 2468);
    f.location.href = initialSource;
    f.window.dispatchEvent({type: 'popstate', state: {siteNavigation: {page: other}}});
    assert.equal(cached.style.visibility, 'visible');
    assert.equal(f.frames.length, 1);
    assert.equal(f.lifecycle.join(','), 'true,false,true,false,true,false');
    cases++;
  }
  const embedded = fixture(base, 'experiments', true);
  assert.equal(embedded.frames.length, 0, 'child cannot recursively create a shell');
  embedded.click('document');
  assert.equal(embedded.messages.at(-1).type, 'navigate');
  embedded.window.dispatchEvent({type: 'message', origin: embedded.location.origin, source: embedded.window.parent,
    data: {channel: 'spatial-notes-navigation', type: 'activate', active: false}});
  assert.equal(embedded.lifecycle.at(-1), false);
  cases++;
}

// Leaving either cached viewer pauses both kinds of playback, without touching
// task, frame, geometry, camera or layer state.
const viewer = fs.readFileSync(__dirname + '/site/experiments.html', 'utf8');
const pause = viewer.match(/function pausePlayback\(\)\{[^\n]+\}/)[0];
const paused=[];
const replay = vm.createContext({playing: true, walkPlaying: true, step: 17,
  framePlayer:{pause(){replay.playing=false;paused.push('observation')}},walkPlayer:{pause(){replay.walkPlaying=false;paused.push('walk')}}});
vm.runInContext(pause + ';pausePlayback();', replay);
assert.equal(replay.playing, false);
assert.equal(replay.walkPlaying, false);
assert.equal(replay.step, 17);
assert.deepEqual(paused, ['observation', 'walk']);
console.log(`Navigation lifecycle tests passed: ${cases} HTTPS/file and embedded scenarios; cached DOM, scroll, history, messages and playback.`);
