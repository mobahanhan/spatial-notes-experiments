import {readCompressedJSON} from './materials.js?v=20261022-materials';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={original:'原版',current:'当前版'},metrics=['alpha-nDCG@10','Coverage@20','Recall@50'];
const percent=x=>Number.isFinite(x)?(100*x).toFixed(2)+'%':'—';
let summary,serial=0,dialogText='';const cache=new Map(),shards=new Map();
function table(rows){return `<div class="table-wrap ir-metrics"><table><thead><tr><th>主题</th><th>每版题数</th><th>原版 α-nDCG@10</th><th>当前 α-nDCG@10</th><th>原版 Coverage@20</th><th>当前 Coverage@20</th><th>原版 Recall@50</th><th>当前 Recall@50</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.topic==='ALL'?'五主题平均':r.topic)}</td><td>${r.n}</td>${metrics.map(m=>`<td>${percent(r.original[m])}</td><td>${percent(r.current[m])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function rankTable(mode,run){return `<section><h3>${labels[mode]} · 前50个不同官方文档</h3><div class="ir-ranking-wrap"><table><thead><tr><th>排名</th><th>文档与标注</th><th>原始排序分数</th></tr></thead><tbody>${run.ranking.map(h=>`<tr><td>${h.rank}</td><td><code>${esc(h.doc_id)}</code><span class="ir-judgment ${h.nuggets_supported?'relevant':''}">${h.nuggets_supported?`支持 ${h.nuggets_supported} 个标注 nugget`:h.judged?'已标注不相关':'未标注（不等于明确不相关）'}</span>${h.source?`<button class="ir-source-button" data-ir-source="${mode}:${h.rank-1}">查看候选原文 ↗</button>`:'<small class="muted">正文未重复打包；可按ID查官方语料</small>'}</td><td class="ir-native-score">${Number(h.score).toPrecision(6)}</td></tr>`).join('')}</tbody></table></div></section>`;}
async function mountTask(key){
  const ticket=++serial;$('irTask').innerHTML='<p class="empty-state">正在读取本题完整排名…</p>';
  try{
    if(!/^[a-f0-9]{20}$/.test(key))throw Error('无效题目标识');
    const data=cache.get(key)??await readCompressedJSON(`data/full-retrieval/tasks/${key}.json.gz`);
    cache.set(key,data);if(cache.size>8)cache.delete(cache.keys().next().value);if(ticket!==serial)return;
    $('irTask').innerHTML=`<p class="ir-topic">${esc(data.topic)} · ${esc(data.case_id)}</p><h2 class="ir-question">${esc(data.question)}</h2><p class="ir-mini-note">每个版本搜索 ${data.corpus_documents.toLocaleString()} 个官方语料单元；问题与旧实验相同，但这是一轮独立的全库检索补测。</p><div class="ir-scorecards">${['original','current'].map(mode=>`<section class="ir-scorecard ${mode==='current'?'current-card':''}"><h3>${labels[mode]}</h3><dl>${metrics.map(m=>`<dt>${m}</dt><dd>${percent(data[mode].metrics[m])}</dd>`).join('')}</dl><p class="ir-mini-note">索引内部块 ${data[mode].indexed_chunks.toLocaleString()} · 评分单位为官方文档ID</p></section>`).join('')}</div><p class="ir-mini-note">原版分数为负的L2平方距离，当前版为RRF融合分数；不能跨版本直接比较这些原始分数。绿色表示有相关性标注，不表示答案正确。</p><div class="ir-rankings">${rankTable('original',data.original)}${rankTable('current',data.current)}</div><p class="ir-mini-note">${esc(summary.body_policy)}</p><div class="ir-download"><a href="index.html#task=${key}">查看同题旧问答记录 ↗</a><a href="data/full-retrieval/tasks/${key}.json.gz" download>本题完整排名与评分 JSON.gz ↗</a></div>`;
    if(data.nuggets?.length)$('irTask').insertAdjacentHTML('beforeend',`<details class="reference ir-nuggets"><summary>评分侧 nugget 要点 · ${data.nuggets.length} 条（未作为查询或检索提示）</summary><ol>${data.nuggets.map(n=>`<li><code>${esc(n.id)}</code><br>${esc(n.text)}${n.public_redactions?.length?'<br>公开副本中的疑似凭据格式已遮盖。':''}</li>`).join('')}</ol></details>`);
    $('irTask').onclick=async e=>{
      const button=e.target.closest('[data-ir-source]');if(!button)return;
      const [mode,position]=button.dataset.irSource.split(':'),hit=data[mode].ranking[Number(position)],source=hit.source;
      button.disabled=true;
      try{
        const shard=shards.get(source.path)??await readCompressedJSON(source.path);shards.set(source.path,shard);if(shards.size>5)shards.delete(shards.keys().next().value);
        if(ticket!==serial)return;const text=shard[source.text_sha256];if(typeof text!=='string')throw Error('缺少正文');
        dialogText=text;$('irCopy').textContent='复制正文';$('irDialogTitle').textContent=hit.doc_id;$('irDialogNote').textContent=source.redactions?.length?`公开副本有 ${source.redactions.length} 处疑似凭据格式已等长遮盖。原始SHA-256 ${source.text_sha256}；公开正文SHA-256 ${source.public_text_sha256}`:`原始候选正文 · SHA-256 ${source.text_sha256}`;$('irDialogText').textContent=text;$('irDialog').showModal();
      }catch(error){if(ticket===serial){$('irDialogTitle').textContent='材料读取失败';$('irDialogNote').textContent='';dialogText=error.message;$('irDialogText').textContent=dialogText;$('irDialog').showModal();}}
      finally{if(button.isConnected)button.disabled=false;}
    };
    history.replaceState(null,'',`#task=${key}`);
  }catch(error){if(ticket===serial)$('irTask').innerHTML=`<p class="warning">读取失败：${esc(error.message)}</p>`;}
}
async function boot(){
  try{
    const response=await fetch('data/full-retrieval/summary.json');if(!response.ok)throw Error(`HTTP ${response.status}`);summary=await response.json();
    $('irProvenance').textContent=`协议SHA-256：${summary.protocol_sha256} · 本轮付费API调用：${summary.paid_api_calls} · 官方评分代码：${summary.official_revision}`;
    $('irSummary').innerHTML=`<div class="totals"><div class="stat"><p class="stat-label">固定问题</p><p class="stat-value">240</p><p class="stat-note">五主题各48题</p></div><div class="stat"><p class="stat-label">完整语料单元</p><p class="stat-value">${summary.corpus_documents.toLocaleString()}</p><p class="stat-note">官方ID去重后</p></div><div class="stat"><p class="stat-label">已完成排名</p><p class="stat-value">${summary.completed_rankings} / 480</p><p class="stat-note">不计作新增回答</p></div><div class="stat"><p class="stat-label">付费API调用</p><p class="stat-value">0</p><p class="stat-note">本地检索＋官方评分</p></div></div>`;
    if(summary.status!=='complete'){$('irStatus').innerHTML='<div class="ir-pending">补测仍在运行，尚未发布完整成绩。这里没有把准备完成或单个主题的进度当作全部完成，也不会用零分填补未完成项。</div>';return;}
    $('irStatus').innerHTML='<p class="ir-mini-note">240题 × 2版的全库排名与官方指标已核验完成；旧的配对问答记录保留不变。</p>';
    $('irSummary').insertAdjacentHTML('beforeend',table(summary.rows)+`<p class="ir-mini-note">五个主题各48题，因此五主题等权平均与240题等权平均的权重相同。上表是检索指标，不是问答正确率。</p><div class="ir-download"><a href="data/full-retrieval/summary.json" download>汇总与来源 JSON ↗</a><a href="data/full-retrieval/protocol.json" download>完整公开评测协议 ↗</a></div>`);
    $('irResults').hidden=false;$('irTaskSelect').innerHTML=summary.questions.map(q=>`<option value="${q.key}">${esc(q.topic)} · ${esc(q.question.slice(0,110))}</option>`).join('');
    const requested=new URLSearchParams(location.hash.slice(1)).get('task'),key=summary.questions.some(q=>q.key===requested)?requested:summary.questions[0].key;
    $('irTaskSelect').value=key;$('irTaskSelect').onchange=e=>mountTask(e.target.value);await mountTask(key);
  }catch(error){$('irStatus').innerHTML=`<p class="warning">补测记录尚不可用：${esc(error.message)}。原问答页面不受影响。</p>`;}
}
$('irDialogClose').onclick=()=>$('irDialog').close();$('irCopy').onclick=async()=>{try{await navigator.clipboard.writeText(dialogText);$('irCopy').textContent='已复制';}catch{$('irCopy').textContent='请手动复制正文';}};
boot();
