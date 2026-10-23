'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'site/rag'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8')),unzip=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,p))).toString('utf8'));
const summary=read('data/full-retrieval/summary.json'),protocol=read('data/full-retrieval/protocol.json'),index=read('data/index.json');
assert.equal(summary.paid_api_calls,0);assert.equal(protocol.paid_api_calls,0);assert.equal(summary.protocol_sha256,protocol.protocol_sha256);assert.equal(protocol.model.max_seq_length,128);assert.equal(protocol.ir_adapter.output_depth,50);assert.equal(summary.corpus_documents,271816);assert.equal(summary.corpus_raw_rows,271842);
assert.equal(summary.questions.length,240);assert.equal(new Set(summary.questions.map(q=>q.key)).size,240);
const expected={godot:25477,yolo:27207,laravel:52341,langchain:49505,angular:117286};for(const row of summary.topic_counts)assert.equal(row.corpus_documents,expected[row.topic]);
const patterns=[/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bgithub_pat_[A-Za-z0-9_]{40,}\b/,/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/,/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
patterns.push(/["']?(?:api[_-]?key|access[_-]?token|client[_-]?secret)["']?\s*[:=]\s*["'][A-Za-z0-9_+\/-]{24,}["']/i);
const scan=(value,label)=>{if(typeof value==='string'){for(const pattern of patterns)assert.ok(!pattern.test(value),`Possible credential format in ${label}`);}else if(value&&typeof value==='object'){for(const item of Object.values(value))scan(item,label);}};
scan(summary,'summary');scan(protocol,'public protocol');
let rankings=0,documents=0,sourceReferences=0;const bodyCache=new Map();
for(const q of summary.questions){
  const old=index.find(r=>r.key===q.key);assert.ok(old);assert.equal(old.id,q.case_id);assert.equal(old.benchmark,'FreshStack');assert.equal(old.question,q.question);
  if(summary.status!=='complete')continue;
  const data=unzip(`data/full-retrieval/tasks/${q.key}.json.gz`);scan(data,q.key);assert.equal(data.key,q.key);assert.equal(data.case_id,q.case_id);assert.equal(data.question,q.question);assert.equal(data.protocol_sha256,summary.protocol_sha256);assert.equal(data.corpus_documents,expected[q.topic]);
  for(const mode of ['original','current']){
    const run=data[mode];rankings++;assert.equal(run.ranking.length,50);assert.equal(new Set(run.ranking.map(h=>h.doc_id)).size,50);
    for(const m of ['alpha-nDCG@10','Coverage@20','Recall@50'])assert.ok(Number.isFinite(run.metrics[m])&&run.metrics[m]>=0&&run.metrics[m]<=1);
    for(const[i,h]of run.ranking.entries()){
      documents++;assert.equal(h.rank,i+1);assert.ok(Number.isFinite(h.score));if(i)assert.ok(h.score<=run.ranking[i-1].score+1e-12);assert.ok(h.child_id);assert.match(h.child_text_sha256,/^[a-f0-9]{64}$/);assert.equal(typeof h.judged,'boolean');assert.ok(Number.isInteger(h.nuggets_supported)&&h.nuggets_supported>=0);
      if(h.source){
        sourceReferences++;const s=h.source;assert.match(s.path,/^data\/(?:material-texts|full-retrieval\/texts)\/[a-f0-9]{2}\.json\.gz$/);assert.match(s.text_sha256,/^[a-f0-9]{64}$/);
        const shard=bodyCache.get(s.path)??unzip(s.path);bodyCache.set(s.path,shard);scan(shard,s.path);const text=shard[s.text_sha256];assert.equal(typeof text,'string');assert.equal(sha(text),s.public_text_sha256??s.text_sha256);
        for(const r of s.redactions??[])assert.match(Array.from(text).slice(r.start,r.end).join(''),/^[*\s]+$/);
      }
    }
  }
}
if(summary.status==='complete'){
  assert.equal(rankings,480);assert.equal(documents,24000);assert.equal(summary.completed_rankings,480);assert.equal(summary.rows.length,6);assert.ok(sourceReferences>0);
  const all=summary.rows.find(r=>r.topic==='ALL');assert.equal(all.n,240);
  for(const mode of ['original','current'])for(const m of ['alpha-nDCG@10','Coverage@20','Recall@50'])assert.ok(Math.abs(all[mode][m]-summary.rows.filter(r=>r.topic!=='ALL').reduce((n,r)=>n+r[mode][m],0)/5)<1e-12);
}else{assert.equal(summary.status,'running');assert.equal(summary.completed_rankings,0);assert.deepEqual(summary.rows,[]);}
const html=fs.readFileSync(path.join(root,'retrieval.html'),'utf8'),js=fs.readFileSync(path.join(root,'retrieval.js'),'utf8');
assert.match(html,/128-token/);assert.match(html,/2048-token/);assert.match(js,/ticket!==serial/);assert.match(js,/summary.status!=='complete'/);assert.match(js,/textContent=text/);
console.log(JSON.stringify({verified:true,status:summary.status,questions:240,rankings,documents,sourceReferences,corpusDocuments:summary.corpus_documents,paidAPICalls:0}));
