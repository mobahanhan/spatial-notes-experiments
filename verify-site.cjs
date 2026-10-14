'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, 'site');
const projectURL = new URL('https://pages-check.invalid/spatial-notes-experiments/');
const baseURI = new URL('experiments.html', projectURL).href;
const audit = JSON.parse(fs.readFileSync(path.join(root, 'export-audit.json'), 'utf8'));
const files = [];
function walk(folder) {
  for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
    const file = path.join(folder, entry.name);
    assert.ok(!fs.lstatSync(file).isSymbolicLink(), 'Pages files must not be symbolic links');
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile()) files.push(file);
    else assert.fail('Unsupported Pages file type');
  }
}
walk(root);
const bytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
assert.ok(bytes < 1_000_000_000, 'Published site exceeds the conservative 1 GB limit');
for (const file of files) assert.ok(fs.statSync(file).size < 100_000_000, 'File exceeds the GitHub individual-file limit');
for (const [relative, expected] of Object.entries(audit.file_sha256)) {
  const file = path.resolve(root, relative);
  assert.ok(file.startsWith(root + path.sep), 'Audit path leaves the published directory');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), expected, relative);
}
const secretPatterns = [
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['OpenAI-style key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],
  ['AWS access-key ID', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Bearer credential', /(?:Authorization|authorization)["'\s:]+Bearer\s+[A-Za-z0-9._~+\/-]{16,}/],
  ['Credential in URL', /https?:\/\/[^\s"'<>/:]{1,100}:[^\s"'<>/@]{8,}@/],
  ['Assigned API secret', /["']?(?:api[_-]?key|access[_-]?token|client[_-]?secret)["']?\s*[:=]\s*["'][A-Za-z0-9_+\/-]{24,}["']/i],
];
const secretFindings = [];
for (const file of files) {
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  assert.ok(!/(^|\/)(?:\.env(?:\..*)?|id_rsa|id_ed25519)$/.test(relative), 'Credential file must not be published');
  if (!/\.(?:html|css|js|json|md|txt)$/i.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const [kind, pattern] of secretPatterns) {
    if (pattern.test(text)) secretFindings.push({file: relative, kind});
  }
}
// Never print suspected credential values, only file names and finding categories.
assert.equal(secretFindings.length, 0, JSON.stringify(secretFindings));

function localFile(address) {
  const url = new URL(address, baseURI);
  assert.equal(url.origin, projectURL.origin, 'Dependency leaves the static hosting origin');
  assert.ok(url.pathname.startsWith(projectURL.pathname), 'Dependency loses the project-site prefix');
  const relative = decodeURIComponent(url.pathname.slice(projectURL.pathname.length));
  const file = path.resolve(root, relative);
  assert.ok(file.startsWith(root + path.sep), 'Dependency leaves the published directory');
  assert.ok(fs.statSync(file).size > 0, 'Dependency is empty');
  return file;
}
for (const name of ['index.html', 'experiments.html', 'reasons.html']) {
  const html = fs.readFileSync(path.join(root, name), 'utf8');
  for (const match of html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g)) {
    if (!match[1].startsWith('data:')) localFile(match[1]);
  }
  for (const target of ['index.html', 'experiments.html']) {
    if (html.includes('href="' + target + '"')) localFile(target);
  }
}
let scripts = 0;
const context = vm.createContext({window: {}, URL, URLSearchParams, Response, DOMException});
context.document = {baseURI, createElement: () => ({remove() {}}), head: {append(script) {
  const file = localFile(script.src);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file});
  scripts++;
  script.onload();
}}};
for (const name of ['offline-manifest.js', 'static_runtime.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'assets', name), 'utf8'), context, {filename: name});
}
async function request(route) {
  const response = await context.window.fetch(route);
  assert.ok(response.ok, route);
  return response.json();
}
function image(route) { localFile(context.window.ESIStatic.resourceURL(route)); }
(async () => {
  const catalog = await request('/api/catalog');
  assert.equal(catalog.length, 84);
  assert.equal(catalog.length, audit.runs);
  const variants = {};
  let frames = 0, walks = 0, inputSteps = 0, inputImageReferences = 0, directCorrect = 0, alignedFrames = 0;
  for (const run of catalog) {
    variants[run.variant] = (variants[run.variant] || 0) + 1;
    const data = await request('/api/data?id=' + encodeURIComponent(run.id));
    assert.equal(data.run.id, run.id);
    assert.equal(data.trajectory.length, audit.run_audit.find(item => item.id === run.id).frames);
    if (run.variant === 'computer-use') {
      assert.equal(typeof data.result.correct, 'boolean');
      assert.ok(data.submission?.answer, 'A direct-observation answer must be a saved submission');
      directCorrect += Number(data.result.correct);
    }
    assert.ok(data.room_geometry.polygons.length);
    assert.ok(data.objects.length);
    assert.ok(!data.task_observation || data.task_observation.status !== 'skipped');
    assert.ok(!/^\s*跳过[；;。．.\s]*$/.test(data.task_observation?.text || ''));
    for (let index = 0; index < data.trajectory.length; index++) {
      image('/api/frame?id=' + encodeURIComponent(run.id) + '&index=' + index);
      frames++;
      const pose = data.trajectory[index];
      if (pose.observation_camera) {
        const camera = pose.observation_camera, correction = pose.observation_alignment;
        assert.ok(Number.isInteger(camera.source_frame_index) && camera.source_frame_index >= 0 && camera.source_frame_index < index);
        assert.equal(correction.frame_index, index);
        assert.equal(correction.observation_pose_frame_index, camera.source_frame_index);
        assert.deepEqual(camera.position, data.trajectory[camera.source_frame_index].position);
        assert.deepEqual(camera.quaternion_xyzw, data.trajectory[camera.source_frame_index].quaternion_xyzw);
        const originalHash = audit.image_format === 'lossless-webp' ? audit.image_audit[pose.image].original_sha256 : path.basename(pose.image, '.png');
        assert.equal(originalHash, correction.image_sha256, 'Only the original audited image may use this observation pose');
        assert.equal(data.observation_alignment_audit.original_images_actions_and_recorded_poses_preserved, true);
        alignedFrames++;
      }
      if (run.variant !== 'ordered-survey-v6') continue;
      const inputs = await request('/api/model-input?id=' + encodeURIComponent(run.id) + '&index=' + index);
      for (const call of [...inputs.calls, ...inputs.unmatched_calls]) {
        for (const saved of call.images) {
          if (saved.available) {
            image('/api/model-input-image?id=' + encodeURIComponent(run.id) + '&call=' + call.trace_ordinal + '&part=' + saved.part_index);
            inputImageReferences++;
          }
        }
      }
      inputSteps++;
    }
    for (let replay = 0; replay < (data.walk_replays || []).length; replay++) {
      for (let index = 0; index < data.walk_replays[replay].frames.length; index++) {
        image('/api/walk-frame?id=' + encodeURIComponent(run.id) + '&replay=' + replay + '&index=' + index);
        walks++;
      }
    }
  }
  assert.deepEqual(variants, {unhinted: 20, hinted: 20, 'ordered-survey-v6': 9, 'computer-use': 35});
  assert.equal(frames, 1072, 'Preserve the original 928 frames and all 144 newly recorded frames');
  assert.equal(walks, 128);
  assert.equal(inputSteps, 259);
  assert.equal(frames, audit.counts.trajectory_frames);
  assert.equal(alignedFrames, audit.observation_alignment_revision.annotated_frames);
  assert.equal(walks, audit.counts.robot_replay_frames);
  assert.equal(inputSteps, audit.counts.harness_input_steps);
  const accuracy = await request('/api/accuracy');
  assert.equal(accuracy.labels['computer-use'], 'GPT-6.1 Sol 直接观察');
  assert.equal(accuracy.computer_use.stats.total, 35);
  assert.equal(accuracy.computer_use.stats.scored, 35);
  assert.equal(accuracy.computer_use.stats.correct, 18);
  assert.equal(accuracy.computer_use.stats.correct, directCorrect);
  assert.equal(accuracy.computer_use.stats.complete, true);
  assert.equal(accuracy.harness_cohort.variants['computer-use'].correct, 7, 'The original common cohort must be unchanged');
  if (['lossless-webp','mixed-original-and-lossless-webp'].includes(audit.image_format)) {
    if (audit.image_format === 'lossless-webp') assert.equal(Object.keys(audit.image_audit).length, audit.unique_images);
    else {
      assert.equal(audit.additional_direct_observation_revision.added_runs, 15);
      assert.equal(audit.additional_direct_observation_revision.original_image_files_preserved, true);
      assert.ok(Object.keys(audit.image_audit).length > 0);
    }
    for (const [relative, entry] of Object.entries(audit.image_audit)) {
      assert.ok(relative.endsWith('.webp'));
      assert.equal(entry.pixels_verified_identical, true);
      assert.match(entry.original_sha256, /^[0-9a-f]{64}$/);
      assert.match(entry.pixel_rgba_sha256, /^[0-9a-f]{64}$/);
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex'), entry.sha256);
    }
  }
  assert.equal((await context.window.fetch('/api/not-exported')).status, 404);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(context.window.fetch('/api/data', {signal: abort.signal}), {name: 'AbortError'});
  console.log(JSON.stringify({verified: true, files: files.length, bytes, runs: catalog.length, variants, frames, walks, inputSteps, inputImageReferences, alignedFrames, scripts, knownSecretFindings: 0, projectPathSafe: true, networkRequests: 0}, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
