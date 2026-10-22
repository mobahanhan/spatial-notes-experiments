'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, 'site/rag');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const manifest = read('archive-manifest.json');
for (const [name, expected] of Object.entries(manifest.files_sha256)) {
  const absolute = path.resolve(root, name);
  assert.ok(absolute.startsWith(root + path.sep));
  assert.equal(sha(fs.readFileSync(absolute)), expected, name);
}
const index = read('data/index.json'), summary = read('data/summary.json');
assert.equal(index.length, 1200);
assert.equal(new Set(index.map(r => r.id)).size, 1200);
assert.equal(summary.answers, 2400);
assert.deepEqual(summary.counts, {RGB: 360, HotpotQA: 120, CRAG: 120, 'MTRAG-UN': 360, FreshStack: 240});
assert.deepEqual(summary.cohorts.map(c => c.count), [100, 100, 500, 500]);
let answers = 0, inputs = 0, judges = 0;
const formatErrors = {original: 0, current: 0};
const cragCorrect = {original: 0, current: 0};
const physical = new Set();
const baseURL = new URL('https://pages-check.invalid/spatial-notes-experiments/rag/');
function resource(relative) {
  const url = new URL(relative, baseURL);
  assert.equal(url.origin, baseURL.origin);
  assert.ok(url.pathname.startsWith(baseURL.pathname));
  const name = decodeURIComponent(url.pathname.slice(baseURL.pathname.length));
  assert.ok(fs.statSync(path.join(root, name)).size > 0);
}
for (const r of index) {
  resource(r.path);
  const task = read(r.path);
  assert.equal(task.meta.id, r.id);
  assert.deepEqual(Object.keys(task.versions).sort(), ['current', 'original']);
  for (const mode of ['original', 'current']) {
    const v = task.versions[mode];
    answers++;
    assert.equal(sha(v.raw_answer), v.score.raw_answer_sha256);
    assert.deepEqual(v.status, r.statuses[mode]);
    if (!v.score.json_contract_valid) formatErrors[mode]++;
    if (v.input_messages) {inputs++;assert.equal(v.input_verified, true);}
    if (r.benchmark === 'FreshStack') {
      assert.equal(v.status.kind, 'uncollected');
      assert.equal(v.status.value, null);
    }
    if (['HotpotQA', 'MTRAG-UN'].includes(r.benchmark)) assert.equal(v.status.kind, 'continuous');
    if (r.benchmark === 'CRAG' && v.score.crag_final_decision === 'correct') cragCorrect[mode]++;
    for (const ref of v.judges) {
      judges++;
      resource(ref.path);
      if (!physical.has(ref.sha256)) {
        const record = read(ref.path);
        assert.equal(record.request_sha256, ref.sha256);
        assert.equal(record.http_status, 200);
        assert.ok(record.body.messages.length > 0);
        assert.ok(!('headers' in record) && !('api_key' in record));
        physical.add(ref.sha256);
      }
    }
  }
}
assert.equal(answers, 2400);
assert.equal(inputs, 2360);
assert.equal(judges, 2259);
assert.equal(physical.size, 2230);
assert.deepEqual(formatErrors, {original: 0, current: 45});
assert.deepEqual(cragCorrect, {original: 23, current: 20});
for (const name of ['app.js', 'app.css', 'data/index.json', 'data/summary.json']) resource(name);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(html, /href="\.\.\/index\.html"/);
assert.ok(!fs.existsSync(path.join(root, '.openai')));
assert.ok(!fs.existsSync(path.join(root, '.git')));
for (const name of ['index.html','experiments.html']) {
  const page = fs.readFileSync(path.join(__dirname, 'site', name), 'utf8');
  assert.match(page, /href="rag\/" target="_blank" rel="noopener"/);
  assert.equal((page.match(/data-site-page=/g) || []).length, 2, 'Keep the original cached two-page navigation unchanged');
}
console.log(JSON.stringify({verified:true,tasks:index.length,answers,inputs,missingInputs:2400-inputs,judgeReferences:judges,physicalJudgeRecords:physical.size,formatErrors,cragCorrect,projectPathSafe:true},null,2));
