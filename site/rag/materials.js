const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const taskCache=new Map(),textCache=new Map(),viewStates=new Map();
function cached(map,key,value,limit){map.delete(key);map.set(key,value);if(map.size>limit)map.delete(map.keys().next().value);return value;}
export async function readCompressedJSON(path){
  const response=await fetch(path);if(!response.ok)throw Error(`HTTP ${response.status} · ${path}`);
  const bytes=new Uint8Array(await response.arrayBuffer());let content;
  if(bytes[0]===31&&bytes[1]===139){
    if(typeof DecompressionStream==='undefined')throw Error('当前浏览器不支持本地 gzip 解压，请使用较新的 Chrome / Edge。');
    content=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }else content=new TextDecoder().decode(bytes);
  return JSON.parse(content);
}
async function getTaskMaterials(key){return taskCache.get(key)??cached(taskCache,key,await readCompressedJSON(`data/materials/${key}.json.gz`),12);}
export async function mountRuntime(container,task){
  container.innerHTML='<p class="empty-state">正在读取本题实际分块与运行记录…</p>';
  try{
    const data=await getTaskMaterials(task.meta.key);if(!container.isConnected)return;
    const trace=data.current_retrieval_trace[0],a=task.versions.original,b=task.versions.current;
    const chars=v=>v.input_messages?v.input_messages.reduce((n,m)=>n+Array.from(typeof m.content==='string'?m.content:JSON.stringify(m.content)).length,0):null;
    const roles=v=>v.input_messages?v.input_messages.map(m=>m.role).join(' → '):'未保存完整输入';
    const rows=[['共同候选材料',`${data.documents.length} 份`,`同一组 ${data.documents.length} 份`],['实际 chunk 数',data.chunks.original.length,data.chunks.current.length],['chunk 来自哪里','实际原版索引 index.pkl','冻结 cases.json'],['最终检索块','返回片段见“检索材料”；原版不保存完整候选排名',`${trace.selected_ids.length} 块；向量候选 ${trace.dense_candidates}，BM25 候选 ${trace.lexical_candidates}，融合候选 ${trace.fused_candidates}`],['送出的证据片段/窗口',a.evidence.length,b.evidence.length],['证据正文字符数',a.evidence.reduce((n,e)=>n+Array.from(e.text??'').length,0),b.evidence.reduce((n,e)=>n+Array.from(e.text??'').length,0)],['保存的当前版检索轮数','—',data.current_retrieval_trace.length],['重排序器','无',trace.reranker||'未启用'],['完整输入保存状态',a.input_verified?'已保存且指纹通过':'未保存',b.input_verified?'已保存且指纹通过':'未保存'],['完整输入内容字符数',chars(a)??'未保存',chars(b)??'未保存'],['实际消息角色顺序',roles(a),roles(b)],['服务返回模型标识',a.generation.returned_model??'此条未保存',b.generation.returned_model??'此条未保存']];
    container.innerHTML=`<h2>本题实际运行信息</h2><p class="runtime-note">以下来自保存记录；未保存的值不使用项目默认值填补。字符数不是模型 Token 数。通用算法和批次差异见顶部“方法对照”。</p><div class="table-wrap"><table class="runtime-table"><thead><tr><th>项目</th><th>原版</th><th>当前版</th></tr></thead><tbody>${rows.map(r=>`<tr><th>${escapeHTML(r[0])}</th><td>${escapeHTML(r[1])}</td><td>${escapeHTML(r[2])}</td></tr>`).join('')}</tbody></table></div><details class="reference"><summary>实际保存的生成参数、用量与结束原因</summary><pre>${escapeHTML(JSON.stringify({original:a.generation,current:b.generation},null,2))}</pre></details><p class="provenance-note">原版索引元数据 SHA-256：${data.original_index_pickle_sha256}</p><p class="warning">这些差异共同影响结果。这里不是单独替换切块算法、检索器或提示词的消融实验。</p>`;
  }catch(e){if(container.isConnected)container.innerHTML=`<p class="warning">运行信息读取失败：${escapeHTML(e.message)}</p>`;}
}
async function getText(hash){const prefix=hash.slice(0,2);const shard=textCache.get(prefix)??cached(textCache,prefix,await readCompressedJSON(`data/material-texts/${prefix}.json.gz`),8);if(!(hash in shard))throw Error('归档中缺少材料正文');return shard[hash];}
function cpSlice(text,a,b){return Array.from(text).slice(a,b).join('');}
const label=m=>m==='original'?'原版':'当前版';
function modelButton(mode){return `<button class="io-button" data-material-input="${mode}">${label(mode)}实际模型输入 ↗</button>`;}
export function materialsShell(task){return `<div class="material-panel" id="materialPanel" data-task-key="${task.meta.key}"><p class="empty-state">正在读取本题源材料索引与实际分块…</p></div>`;}

function chunkText(chunk,docText){
  if(chunk.start!=null)return Promise.resolve(cpSlice(docText,chunk.start,chunk.end));
  if(chunk.possible_starts?.length)return Promise.resolve(cpSlice(docText,chunk.possible_starts[0],chunk.possible_starts[0]+chunk.characters));
  return getText(chunk.text_sha256);
}
function selectedSet(data,mode){return new Set(data.evidence_links[mode].flatMap(e=>e.chunk_indices));}
function linkedDoc(data,mode,di){return data.evidence_links[mode].filter(e=>e.doc===di).length;}
function rangeFor(chunk){return chunk.start==null?(chunk.possible_starts?.length>1?`${chunk.possible_starts.length} 处匹配 · 未唯一定位`:'未保存可定位区间'):`[${chunk.start}, ${chunk.end})${chunk.position_origin==='saved_offsets'?'':' · 原文匹配派生'}`;}
function lane(data,doc,di,mode){
  const selected=selectedSet(data,mode),chunks=data.chunks[mode].filter(c=>c.doc===di),mapped=chunks.filter(c=>c.start!=null);
  return `<div class="chunk-lane"><span>${label(mode)} · ${chunks.length} 块</span><svg viewBox="0 0 1000 18" preserveAspectRatio="none" role="img" aria-label="${label(mode)}分块区间；${mapped.length} 个可定位，${chunks.length-mapped.length} 个未唯一定位">${mapped.map(c=>`<rect x="${1000*c.start/Math.max(1,doc.characters)}" y="1" width="${Math.max(.5,1000*(c.end-c.start)/Math.max(1,doc.characters))}" height="16" class="${selected.has(c.index)?'retrieved':''}"/>`).join('')}</svg></div>`;
}
function highlightedSource(text,data,di,focus,mode){
  const chars=Array.from(text),ranges=[];
  for(const r of data.documents[di].redactions??[])ranges.push({a:r.start,b:r.end,kind:'redaction'});
  for(const m of ['original','current'])for(const ev of data.evidence_links[m].filter(e=>e.doc===di)){
    if(m==='current')ranges.push({a:ev.start,b:ev.end,kind:'current'});
    else for(const i of ev.chunk_indices){const c=data.chunks.original[i];if(c.start!=null)ranges.push({a:c.start,b:c.end,kind:'original'});}
  }
  if(focus?.start!=null)ranges.push({a:focus.start,b:focus.end,kind:'focus'});
  const points=[...new Set([0,chars.length,...ranges.flatMap(r=>[r.a,r.b])])].sort((a,b)=>a-b);
  return points.slice(0,-1).map((a,i)=>{const b=points[i+1],cover=ranges.filter(r=>r.a<=a&&r.b>=b),str=escapeHTML(chars.slice(a,b).join(''));if(!cover.length)return str;const classes=cover.some(r=>r.kind==='redaction')?'public-redaction':cover.some(r=>r.kind==='focus')?'chunk-focus':cover.some(r=>r.kind==='original')&&cover.some(r=>r.kind==='current')?'evidence-both':cover.some(r=>r.kind==='original')?'evidence-original':'evidence-current';return `<mark class="${classes}">${str}</mark>`;}).join('');
}

export async function mountMaterials(container,task,openDialog){
  const key=task.meta.key;
  const state=viewStates.get(key)??cached(viewStates,key,{doc:0,mode:'source',page:0,onlyHits:false,focus:null,filter:''},80);
  let data,serial=0;
  async function render(){
    const token=++serial;if(!container.isConnected)return;
    const di=Math.max(0,Math.min(state.doc,data.documents.length-1)),doc=data.documents[di];
    const mode=state.mode==='original'?'original':'current';
    const hits=selectedSet(data,mode),all=data.chunks[mode].filter(c=>c.doc===di),shown=all.filter(c=>!state.onlyHits||hits.has(c.index));
    state.page=Math.max(0,Math.min(state.page,Math.ceil(shown.length/25)-1));
    const focus=state.focus!=null?data.chunks[mode][state.focus]:null;
    const rows=shown.slice(state.page*25,(state.page+1)*25);
    const query=state.filter.toLowerCase(),options=data.documents.map((d,i)=>({d,i})).filter(({d,i})=>i===di||`${d.source} ${d.native_id??''} ${d.preview}`.toLowerCase().includes(query));
    const o=data.chunks.original.length,n=data.chunks.current.length;
    container.innerHTML=`<div class="material-flow"><span>${data.documents.length} 份候选材料</span><b>→</b><span>原版 ${o} / 当前 ${n} 个 chunk</span><b>→</b><span>返回 ${data.evidence_links.original.length} / ${data.evidence_links.current.length} 个片段或窗口</span><b>→</b><span>模型输入</span></div><p class="explanation">本题候选范围：${escapeHTML(data.scope)}。这是本次检索的候选原文，不等于模型全都看过，也不等于 Benchmark 全库或原网站完整 HTML。</p><div class="material-modes" role="group" aria-label="材料与分块视图">${[['source','候选原文'],['original',`原版分块 · ${o}`],['current',`当前版分块 · ${n}`]].map(([m,t])=>`<button data-material-mode="${m}" class="${state.mode===m?'active':''}" aria-pressed="${state.mode===m}">${t}</button>`).join('')}</div><div class="material-select"><label>筛选文档<input id="materialDocFilter" type="search" value="${escapeHTML(state.filter)}" placeholder="来源 ID / 标题 / 路径"></label><label>候选文档 · ${data.documents.length} 份<select id="materialDocSelect">${options.map(({d,i})=>`<option value="${i}" ${i===di?'selected':''}>${i+1}. ${escapeHTML(d.source)} · ${escapeHTML(d.native_id??d.preview)}${linkedDoc(data,'original',i)?' · 原版命中':''}${linkedDoc(data,'current',i)?' · 当前命中':''}</option>`).join('')}</select></label></div><div class="material-doc-meta"><strong>${escapeHTML(doc.source)} · page ${doc.page}</strong><span>${doc.characters.toLocaleString()} 字符（Unicode 码点）</span>${doc.native_id?`<p>原始文档 ID：<code>${escapeHTML(doc.native_id)}</code></p>`:''}<p>原文 SHA-256：<code>${doc.text_sha256}</code></p></div><div class="chunk-map">${lane(data,doc,di,'original')}${lane(data,doc,di,'current')}<p>0 <span>${doc.characters.toLocaleString()} 字符</span></p></div><p class="explanation">原版位置：原始索引没有字符偏移；图中只画唯一原文匹配的派生区间，未唯一定位的块仍保留在列表。当前版位置来自原始保存字段。</p><div class="material-reading ${state.mode==='source'?'source-only':''}">${state.mode==='source'?'':`<section class="material-chunks"><div class="material-chunks-heading"><h3>${label(mode)} · 本文 ${all.length} 块</h3><label><input id="materialOnlyHits" type="checkbox" ${state.onlyHits?'checked':''}>只看最终命中</label></div><p class="explanation">${mode==='original'?'实际保存的原版索引片段，没有重新切块。':'冻结的 page-boundary-v1 chunks；最大 1,000 字符，重叠目标 200 字符。'}</p><div class="chunk-list">${rows.map(c=>{const tr=data.current_retrieval_trace[0],dense=mode==='current'?tr.dense_ids.indexOf(c.id):-1,lex=mode==='current'?tr.lexical_ids.indexOf(c.id):-1;return `<button data-material-chunk="${c.index}" class="chunk-item ${focus?.index===c.index?'active':''}"><strong>#${c.index+1} · ${c.characters} 字符 ${hits.has(c.index)?'<em>最终命中</em>':''}</strong><code>${escapeHTML(c.id)}</code><small>${escapeHTML(rangeFor(c))}</small>${dense>=0||lex>=0?`<small>${dense>=0?`向量 #${dense+1}`:''} ${lex>=0?`BM25 #${lex+1}`:''}</small>`:''}</button>`;}).join('')||'<p class="explanation">此文档没有符合条件的块；可关闭“只看最终命中”。</p>'}</div><div class="pagination"><button data-material-page="-1" ${state.page===0?'disabled':''}>←</button><span>${shown.length?state.page+1:0} / ${Math.ceil(shown.length/25)} 页</span><button data-material-page="1" ${(state.page+1)*25>=shown.length?'disabled':''}>→</button></div></section>`}<section class="material-source"><div class="material-source-heading"><h3>候选原文 · 完整正文</h3><button class="io-button" data-material-raw>原文窗口 / 复制 ↗</button></div><p class="source-legend"><span class="original-mark">原版返回证据</span><span class="current-mark">当前返回证据</span><span class="both-mark">两版重叠</span><span class="focus-mark">当前选中 chunk</span></p><pre class="source-text" id="materialSourceText">正在读取原文…</pre>${focus&&state.mode!=='source'?`<h3 class="component-heading">选中 chunk #${focus.index+1} · 完整正文</h3><p class="explanation">${escapeHTML(rangeFor(focus))}</p><pre class="selected-chunk-text" id="selectedChunkText">正在读取片段…</pre>`:''}</section></div><div class="io-buttons">${modelButton('original')}${modelButton('current')}<button class="io-button" data-material-trace>本题分块 / 检索元数据 JSON ↗</button></div><p class="explanation">全部候选来源可切换查看；只有命中块的部分内容进入模型。最早 40 份未保留的当前版完整输入不会在这里补造。</p>`;
    if(doc.redactions?.length)container.querySelector('.material-doc-meta').insertAdjacentHTML('beforeend',`<p class="warning">公开副本有 ${doc.redactions.length} 处疑似凭据格式（可能含技术文档示例/占位符），已用等长星号遮盖。字符位置不变；本地原材料、已有输入输出与评分未修改。上方是原始材料哈希，下面才是公开正文哈希。</p><p>公开正文 SHA-256：<code>${doc.public_text_sha256}</code></p>`);
    try{
      const text=await getText(doc.text_sha256);if(!container.isConnected||token!==serial)return;
      container.querySelector('#materialSourceText').innerHTML=highlightedSource(text,data,di,focus,state.mode);
      if(focus&&container.querySelector('#selectedChunkText')){const str=await chunkText(focus,text);if(container.isConnected&&token===serial)container.querySelector('#selectedChunkText').textContent=str;}
    }catch(e){if(container.isConnected&&token===serial)container.querySelector('#materialSourceText').textContent=`读取失败：${e.message}`;}
  }
  container.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b||!data)return;
    if(b.dataset.materialMode){state.mode=b.dataset.materialMode;state.focus=null;state.page=0;render();}
    if(b.dataset.materialChunk){state.focus=Number(b.dataset.materialChunk);render();}
    if(b.dataset.materialPage){state.page+=Number(b.dataset.materialPage);render();}
    if(b.hasAttribute('data-material-trace'))openDialog({title:'本题源材料、分块与检索元数据',value:data,note:'原版片段来自实际存档；派生位置与原始位置分开标记。正文按哈希去重存档。'});
    if(b.dataset.materialInput){const v=task.versions[b.dataset.materialInput];openDialog({title:`${label(b.dataset.materialInput)} · 实际模型输入`,value:v.input_messages??'完整输入未保存，不补造。',note:v.input_verified?'保存输入已通过原始指纹校验。':'早期复用调用没有完整输入存档。'});}
    if(b.hasAttribute('data-material-raw')){const doc=data.documents[state.doc],text=await getText(doc.text_sha256);if(container.isConnected)openDialog({title:`${doc.source} · ${doc.redactions?.length?'候选原文公开副本':'完整候选原文'}`,value:text,note:`${doc.characters} 字符 · ${doc.redactions?.length?`${doc.redactions.length} 处疑似凭据格式已等长遮盖；公开正文 SHA-256 ${doc.public_text_sha256}；原始正文 SHA-256 ${doc.text_sha256}`:`SHA-256 ${doc.text_sha256}`}`});}
  });
  container.addEventListener('change',e=>{if(e.target.id==='materialDocSelect'){state.doc=Number(e.target.value);state.focus=null;state.page=0;render();}if(e.target.id==='materialOnlyHits'){state.onlyHits=e.target.checked;state.page=0;render();}});
  let timer;container.addEventListener('input',e=>{if(e.target.id==='materialDocFilter'){clearTimeout(timer);const value=e.target.value;timer=setTimeout(()=>{state.filter=value;render();const f=container.querySelector('#materialDocFilter');f?.focus();f?.setSelectionRange?.(value.length,value.length);},220);}});
  try{data=await getTaskMaterials(key);if(container.isConnected)render();}
  catch(e){if(container.isConnected)container.innerHTML=`<p class="warning">材料读取失败：${escapeHTML(e.message)}。请重新切换此栏目重试。</p>`;}
}
