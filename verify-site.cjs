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
  const external=audit.external_assets;
  if(external&&url.href.startsWith(external.public_prefix)){
    const relative=decodeURIComponent(url.href.slice(external.public_prefix.length));
    const folder=path.resolve(__dirname,external.repository_directory),file=path.resolve(folder,relative);
    assert.ok(file.startsWith(folder+path.sep));assert.ok(fs.statSync(file).size>0);return file;
  }
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
  assert.equal(catalog.length, 107);
  assert.equal(catalog.length, audit.runs);
  const variants = {};
  let cloudInputSteps = 0, frames = 0, walks = 0, inputSteps = 0, plainInputSteps = 0, plainObservationSteps = 0, plainCorrect = 0, inputImageReferences = 0, directCorrect = 0, alignedFrames = 0, missingObservations = 0, restarts = 0, recoveredMetadata = 0;
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
    if (run.variant === 'plain-gpt61') {
      assert.equal(run.model, 'gpt-6.1-sol');
      assert.equal(run.experiment_condition, 'plain_benchmark');
      assert.equal(run.harness_enabled, false);
      assert.equal(run.pointcloud_enabled, false);
      assert.equal(data.trajectory.length, run.decision_records);
      plainCorrect += Number(data.result.correct);
      plainObservationSteps += run.steps;
    }
    assert.ok(data.room_geometry.polygons.length);
    assert.ok(data.objects.length);
    assert.ok(!data.task_observation || data.task_observation.status !== 'skipped');
    assert.ok(!/^\s*跳过[；;。．.\s]*$/.test(data.task_observation?.text || ''));
    for (let index = 0; index < data.trajectory.length; index++) {
      frames++;
      const pose = data.trajectory[index];
      if (pose.image) image('/api/frame?id=' + encodeURIComponent(run.id) + '&index=' + index);
      else { assert.equal(pose.observation_missing, true); assert.equal(run.variant, 'computer-use'); missingObservations++; }
      if (pose.segment_break_before) { assert.equal(pose.action, 'technical_restart'); restarts++; }
      if (pose.metadata_recovery) { assert.equal(pose.metadata_recovery.original_rgb_changed, false); recoveredMetadata++; }
      if (pose.observation_camera) {
        const camera = pose.observation_camera, correction = pose.observation_alignment;
        assert.ok(Number.isInteger(camera.source_frame_index) && camera.source_frame_index >= 0 && camera.source_frame_index < index);
        assert.equal(correction.frame_index, index);
        assert.equal(correction.observation_pose_frame_index, camera.source_frame_index);
        assert.deepEqual(camera.position, data.trajectory[camera.source_frame_index].position);
        assert.deepEqual(camera.quaternion_xyzw, data.trajectory[camera.source_frame_index].quaternion_xyzw);
        const originalHash = audit.image_audit?.[pose.image]?.original_sha256 || path.basename(pose.image, path.extname(pose.image));
        assert.equal(originalHash, correction.image_sha256, 'Only the original audited image may use this observation pose');
        assert.equal(data.observation_alignment_audit.original_images_actions_and_recorded_poses_preserved, true);
        alignedFrames++;
      }
      if (!['ordered-survey-v6', 'plain-gpt61', 'harness-rgb-v2'].includes(run.variant)) continue;
      const inputs = await request('/api/model-input?id=' + encodeURIComponent(run.id) + '&index=' + index);
      for (const call of [...inputs.calls, ...inputs.unmatched_calls]) {
        for (const saved of call.images) {
          if (saved.available) {
            image('/api/model-input-image?id=' + encodeURIComponent(run.id) + '&call=' + call.trace_ordinal + '&part=' + saved.part_index);
            inputImageReferences++;
          }
        }
      }
      if (run.variant === 'plain-gpt61') {
        assert.equal(inputs.calls.length, 1, 'Every ordinary decision must retain its exact saved request');
        plainInputSteps++;
      } else if(run.variant==='harness-rgb-v2')cloudInputSteps++; else inputSteps++;
    }
    for (let replay = 0; replay < (data.walk_replays || []).length; replay++) {
      for (let index = 0; index < data.walk_replays[replay].frames.length; index++) {
        image('/api/walk-frame?id=' + encodeURIComponent(run.id) + '&replay=' + replay + '&index=' + index);
        walks++;
      }
    }
  }
  assert.deepEqual(variants, {unhinted: 20, hinted: 20, 'ordered-survey-v6': 9, 'computer-use': 44, 'plain-gpt61': 5, 'harness-rgb-v2':9});
  assert.equal(frames,1456,'Preserve 1245 existing records and add 211 cloud Harness decisions');
  assert.equal(audit.plain_gpt61_revision.old_catalog_objects_preserved, true);
  assert.equal(plainCorrect, 2);
  assert.equal(plainObservationSteps, 69);
  assert.equal(plainInputSteps, 71);
  const replacement = audit.single_run_replacement;
  assert.equal(replacement.id, 'computer-use-spatial-segmentation-beechwood-0-int-living-room-1-q-001');
  assert.equal(replacement.old_frames, 8);
  assert.equal(replacement.new_frames, 3);
  assert.equal(replacement.other_92_runs_unchanged, true);
  assert.equal(missingObservations, 1, 'GPU-crash action must remain explicitly without fabricated RGB');
  assert.equal(restarts, 1, 'Do not draw a technical reload as agent movement');
  assert.equal(recoveredMetadata, 1, 'One sidecar was explicitly recovered from redundant native action data');
  assert.equal(walks, 128);
  assert.equal(inputSteps, 259);
  assert.equal(frames, audit.counts.trajectory_frames);
  assert.equal(alignedFrames, audit.observation_alignment_revision.annotated_frames);
  assert.equal(walks, audit.counts.robot_replay_frames);
  assert.equal(cloudInputSteps,211);
  assert.equal(inputSteps+cloudInputSteps, audit.counts.harness_input_steps);
  assert.equal(plainInputSteps, audit.counts.plain_input_steps);
  for(const run of catalog.filter(r=>r.variant==='harness-rgb-v2')){
    const data=await request('/api/data?id='+encodeURIComponent(run.id));
    const cloud=await request('/api/rgb-geometry?id='+encodeURIComponent(run.id));
    assert.equal(cloud.length,data.trajectory.length);
    for(let i=0;i<cloud.length;i++){
      assert.equal(cloud[i].view_id,data.trajectory[i].view_id);
      const original=audit.image_audit[data.trajectory[i].image]?.original_sha256;
      assert.equal(cloud[i].image_sha256,original,'Cloud/RGB must bind to the same actual saved input');
      for(const item of [cloud[i].local,cloud[i].fusion,...cloud[i].fusion.groups]){
        localFile(item.preview_url);localFile(item.report_url);localFile(item.viewer_url);
        const url=new URL(item.viewer_url,baseURI);localFile(url.searchParams.get('snapshot'));localFile(url.searchParams.get('report'));
        assert.ok(item.packed);
      }
    }
  }
  const accuracy = await request('/api/accuracy');
  assert.equal(accuracy.labels['computer-use'], 'GPT-6.1 Sol 直接观察');
  assert.equal(accuracy.computer_use.stats.total, 44);
  assert.equal(accuracy.computer_use.stats.scored, 44);
  assert.equal(accuracy.computer_use.stats.correct, 22);
  assert.equal(accuracy.computer_use.stats.correct, directCorrect);
  assert.equal(accuracy.computer_use.stats.complete, true);
  assert.equal(accuracy.harness_cohort.variants['computer-use'].correct, 7, 'The original common cohort must be unchanged');
  assert.equal(accuracy.overall['harness-rgb-v2'].total,9);
  assert.equal(accuracy.overall['harness-rgb-v2'].correct,5);
  assert.equal(accuracy.overall['plain-gpt61'].correct, 2);
  assert.equal(accuracy.overall['plain-gpt61'].total, 5);
  assert.equal(accuracy.overall['plain-gpt61'].percent, 40);
  assert.equal(accuracy.harness_cohort.variants['plain-gpt61'], undefined, 'A five-task baseline must not change the original nine-task denominator');
  if (['lossless-webp','mixed-original-and-lossless-webp'].includes(audit.image_format)) {
    if (audit.image_format === 'lossless-webp') assert.equal(Object.keys(audit.image_audit).length, audit.unique_images);
    else {
      assert.equal(audit.additional_direct_observation_revision.added_runs, 9);
      assert.equal(audit.additional_direct_observation_revision.original_recording_image_files_preserved, true);
      assert.equal(audit.additional_direct_observation_revision.original_image_pixels_preserved, true);
      assert.ok(Object.keys(audit.image_audit).length > 0);
    }
    for (const [relative, entry] of Object.entries(audit.image_audit)) {
      assert.ok(relative.endsWith('.webp'));
      assert.equal(entry.pixels_verified_identical, true);
      assert.match(entry.original_sha256, /^[0-9a-f]{64}$/);
      assert.match(entry.pixel_rgba_sha256, /^[0-9a-f]{64}$/);
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(fs.existsSync(path.join(root,relative))?path.join(root,relative):path.join(__dirname,audit.external_assets.files[relative].repository_path))).digest('hex'), entry.sha256);
    }
  }
  for(const item of Object.values(audit.external_assets.files)){const file=path.resolve(__dirname,item.repository_path);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),item.sha256);assert.ok(fs.statSync(file).size<100_000_000);}
  assert.equal((await context.window.fetch('/api/not-exported')).status, 404);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(context.window.fetch('/api/data', {signal: abort.signal}), {name: 'AbortError'});
  console.log(JSON.stringify({verified: true, files: files.length, bytes, runs: catalog.length, variants, frames, walks, inputSteps, plainInputSteps, plainObservationSteps, inputImageReferences, alignedFrames, scripts, knownSecretFindings: 0, projectPathSafe: true, networkRequests: 0}, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
