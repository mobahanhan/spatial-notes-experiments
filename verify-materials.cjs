'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'site/rag');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const unzip=name=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,name))).toString('utf8'));
const spec=read('data/materials-index.json'),index=read('data/index.json');
const texts=new Map(),findings=[];
const patterns=[['GitHub token',/\bgh[pousr]_[A-Za-z0-9]{30,}\b/],['Fine-grained token',/\bgithub_pat_[A-Za-z0-9_]{40,}\b/],['OpenAI-style key',/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],['AWS access-key ID',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],['Private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['Assigned secret',/["']?(?:api[_-]?key|access[_-]?token|client[_-]?secret)["']?\s*[:=]\s*["'][A-Za-z0-9_+\/-]{24,}["']/i]];
for(const file of fs.readdirSync(path.join(root,'data/material-texts'))){
  const shard=unzip('data/material-texts/'+file);
  for(const [hash,text]of Object.entries(shard)){
    const mask=spec.public_redactions[hash];assert.equal(sha(text),mask?.public_text_sha256??hash);assert.equal(hash.slice(0,2)+'.json.gz',file);texts.set(hash,text);
    if(mask){const cp=Array.from(text);assert.equal(cp.length,mask.characters);for(const s of mask.spans){assert.ok(s.start>=0&&s.end<=cp.length&&s.start<s.end);assert.match(cp.slice(s.start,s.end).join(''),/^[*\s]+$/);}}
    for(const[kind,pattern]of patterns)if(pattern.test(text))findings.push({text_sha256:hash,kind});
  }
}
assert.equal(findings.length,0,JSON.stringify(findings));
assert.equal(texts.size,spec.unique_texts);
const counts={tasks:0,document_instances:0,original_chunks:0,current_chunks:0};
const positions={unique_exact_match:0,ambiguous_exact_match:0};let evidence=0;
for(const row of index){
  const data=unzip(`data/materials/${row.key}.json.gz`),detail=read(row.path),actual=spec.tasks[row.key];
  for(const[kind,pattern]of patterns)assert.ok(!pattern.test(JSON.stringify(data)),`Metadata secret scan: ${row.key} ${kind}`);
  assert.equal(data.task_key,row.key);assert.equal(data.case_id,row.id);assert.equal(data.original_index_pickle_sha256,spec.original_index_hashes[row.key]);
  assert.equal(data.documents.length,actual.documents);assert.equal(data.chunks.original.length,actual.original_chunks);assert.equal(data.chunks.current.length,actual.current_chunks);
  const chars=data.documents.map(d=>{
    assert.ok(texts.has(d.text_sha256));const str=texts.get(d.text_sha256);const cp=Array.from(str);assert.equal(cp.length,d.characters);
    const mask=spec.public_redactions[d.text_sha256];if(mask){assert.equal(d.public_text_sha256,mask.public_text_sha256);assert.deepEqual(d.redactions,mask.spans);}else assert.ok(!d.public_text_sha256&&!d.redactions);return cp;
  });
  for(const mode of ['original','current'])for(const [i,c]of data.chunks[mode].entries()){
    assert.equal(c.index,i);assert.ok(c.id);const cp=chars[c.doc];assert.ok(cp);
    if(mode==='current'){
      assert.equal(c.position_origin,'saved_offsets');assert.equal(c.end-c.start,c.characters);assert.ok(c.start>=0&&c.end<=cp.length);
    }else{
      positions[c.position_origin]=(positions[c.position_origin]||0)+1;
      assert.ok(c.possible_starts.length>0,'No guessed source position');
      assert.equal(c.position_origin,c.possible_starts.length===1?'unique_exact_match':'ambiguous_exact_match');
      if(c.possible_starts.length===1){assert.equal(c.start,c.possible_starts[0]);assert.equal(c.end-c.start,c.characters);}
      else assert.equal(c.start,null);
      for(const start of c.possible_starts){
        const publicHash=c.public_text_sha256_by_position?.[start];assert.equal(sha(cp.slice(start,start+c.characters).join('')),publicHash??c.text_sha256);
        if(publicHash&&publicHash!==c.text_sha256)assert.ok(data.documents[c.doc].redactions.some(r=>r.start<start+c.characters&&r.end>start));
      }
    }
  }
  for(const mode of ['original','current']){
    const saved=detail.versions[mode].evidence,links=data.evidence_links[mode];assert.equal(saved.length,links.length);
    for(const [i,link]of links.entries()){
      evidence++;const doc=data.documents[link.doc],e=saved[i];assert.equal(doc.source,e.source);assert.equal(doc.page,e.page);assert.equal(link.rank,e.rank);assert.ok(link.chunk_indices.length);
      for(const ci of link.chunk_indices){const c=data.chunks[mode][ci];assert.equal(c.doc,link.doc);
        if(mode==='original')assert.equal(c.text_sha256,sha(e.text));
        else{assert.equal(c.id,e.id);assert.ok(c.start<=e.start&&e.end<=c.end);assert.equal(chars[link.doc].slice(e.start,e.end).join(''),e.text);}
      }
    }
  }
  assert.equal(data.current_retrieval_trace.length,1);assert.equal(data.current_retrieval_trace[0].reranker,'');
  for(const id of data.current_retrieval_trace[0].selected_ids)assert.ok(data.chunks.current.some(c=>c.id===id));
  counts.tasks++;counts.document_instances+=data.documents.length;counts.original_chunks+=data.chunks.original.length;counts.current_chunks+=data.chunks.current.length;
}
assert.deepEqual(counts,spec.counts);assert.deepEqual(positions,spec.original_positions);assert.equal(spec.new_model_calls,0);
assert.equal(Object.keys(spec.public_redactions).length,spec.redacted_unique_documents);assert.equal(Object.values(spec.public_redactions).reduce((n,r)=>n+r.spans.length,0),spec.redacted_spans);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),app=fs.readFileSync(path.join(root,'app.js'),'utf8'),ui=fs.readFileSync(path.join(root,'materials.js'),'utf8');
assert.match(html,/data-view="methods"/);assert.match(app,/源材料与分块/);assert.match(app,/本题运行差异/);assert.match(ui,/DecompressionStream/);assert.match(ui,/Array\.from\(text\)/);assert.match(ui,/token!==serial/);
assert.match(ui,/possible_starts/);assert.match(html,/代码支持，但本次未启用/);assert.match(html,/单因素消融/);
console.log(JSON.stringify({verified:true,...counts,uniqueTexts:texts.size,positions,evidenceLinksVerified:evidence,knownSecretFindings:0,publiclyMaskedDocuments:spec.redacted_unique_documents,publiclyMaskedSpans:spec.redacted_spans,unicodeCodePointOffsets:true,newModelCalls:0},null,2));
