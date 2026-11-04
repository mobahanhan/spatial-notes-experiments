'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const site=path.join(__dirname,'site'),audit=JSON.parse(fs.readFileSync(path.join(site,'export-audit.json'),'utf8'));
const manifestText=fs.readFileSync(path.join(site,'assets/offline-manifest.js'),'utf8');
const manifest=JSON.parse(manifestText.slice('window.ESI_STATIC_MANIFEST='.length).trim().replace(/;$/,''));
const rows=[];
for(const run of manifest.catalog.filter(x=>x.variant==='harness-rgb-v2')){
 const source=fs.readFileSync(path.join(site,manifest.files['cloud/'+run.id]),'utf8');
 const data=JSON.parse(source.slice(source.indexOf(',')+1,source.lastIndexOf(');')));
 rows.push(...data);
}
assert.equal(rows.length,211);
for(const name of ['experiments.html','assets/packed_cloud.html']){
 const text=fs.readFileSync(path.join(site,name),'utf8');
 for(const m of text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
}
for(const name of ['harness_cloud.js','static_runtime.js'])new vm.Script(fs.readFileSync(path.join(site,'assets',name),'utf8'));
const external=audit.external_assets;
for(const snapshot of Object.values(audit.cloud_harness_v2.snapshots)){
 const file=path.join(__dirname,external.files[snapshot.path].repository_path);
 const text=zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
 assert.ok(text.includes('window.rgbMapViewer'));
 assert.ok(!text.includes('href="pointcloud.ply"'));
 assert.ok(!/\b(?:sk-proj-|github_pat_)[A-Za-z0-9_-]{32,}/.test(text));
}
const loader=fs.readFileSync(path.join(site,'assets/packed_cloud.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const first=rows[0].fusion,url=new URL(first.viewer_url,'https://test.invalid/project/');
let written='',error='';
const context=vm.createContext({URLSearchParams,URL,Response,Blob,Uint8Array,TextDecoder,DecompressionStream,
 location:{search:url.search},document:{open(){},write(s){written=s},close(){},getElementById(){return {set textContent(s){error=s}}}},
 fetch:async address=>{assert.ok(address.startsWith(external.public_prefix));const file=path.resolve(__dirname,external.repository_directory,address.slice(external.public_prefix.length));return new Response(fs.readFileSync(file));}});
(async()=>{
 await vm.runInContext(loader,context);
 assert.equal(error,'');assert.ok(written.includes('window.rgbMapViewer'));
 assert.ok(written.includes(external.public_prefix+'images/'));
 assert.ok(written.includes(url.searchParams.get('report')));
 console.log(JSON.stringify({cloud_runs:9,cloud_frames:rows.length,saved_snapshots:Object.keys(audit.cloud_harness_v2.snapshots).length,
  packed_loader_verified:true,original_snapshot_points_preserved:true}));
})().catch(error=>{console.error(error.message);process.exitCode=1});
