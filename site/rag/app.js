import {materialsShell,mountMaterials,mountRuntime} from './materials.js?v=20261022-materials';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dump = (v) => typeof v === 'string' ? v : JSON.stringify(v, null, 2);
const fmt = (n, digits=2) => Number(n).toFixed(digits);
const modeLabel = (m) => m === 'original' ? '原版' : '当前版';
const BENCHES = ['RGB','HotpotQA','CRAG','MTRAG-UN','FreshStack'];
const CATEGORY = {noise:'抗噪声', integration:'信息整合', counterfactual:'反事实', rejection:'拒答', bridge:'Bridge', comparison:'Comparison', ANSWERABLE:'可答', PARTIAL:'部分可答', PARTIALLY_ANSWERABLE:'部分可答', UNANSWERABLE:'不可答', UNDERSPECIFIED:'欠明确', technical_qa:'技术问答'};
const METRICS = {
  answer_groups_accuracy:['答案组准确率','rate'], Rej_star:['拒答 Rej*','rate'], ED_star:['错误检测 ED*','rate'], CR_star:['检出后纠正 CR*','rate'],
  Answer_em:['Answer EM','rate'], Answer_f1:['Answer F1','score'], accuracy:['Accuracy','rate'], missing:['Missing','rate'],
  hallucination:['错误率 / Hallucination ↓','rate'], score:['CRAG Score','signed'],
  RB_llm_conditioned:['RB_llm（条件处理）','score'], RB_alg_conditioned:['RB_alg（条件处理）','score'], RL_F_conditioned:['Faithfulness（条件处理）','score'],
};
const metricOrder = Object.keys(METRICS);
const defaultState = {view:'overview', taskPanel:'answers', bench:'ALL', overviewBench:'ALL', category:'ALL', cohort:'ALL', language:'ALL', change:'ALL', search:'', page:0, selected:null, compare:'both', tabs:{original:'answer',current:'answer'}};
let state = {...defaultState, tabs:{...defaultState.tabs}};
try {const s=JSON.parse(localStorage.getItem('rag-archive-state-v1')); if(s) state={...state,...s,tabs:{...state.tabs,...s.tabs}};} catch {}
const hash=new URLSearchParams(location.hash.slice(1));
if(hash.has('task')) {state.selected=hash.get('task');state.view='experiments';}
else if(['overview','experiments','methods','protocol'].includes(location.hash.slice(1))) state.view=location.hash.slice(1);
let summary, index, filtered=[], activeDetail=null, loadVersion=0, dialogValue='', hoverTimer, toastTimer;
const taskCache=new Map(), judgeCache=new Map();
function remember(){try{localStorage.setItem('rag-archive-state-v1',JSON.stringify(state));}catch{}}
function putCache(cache,k,v,max){cache.delete(k);cache.set(k,v);if(cache.size>max)cache.delete(cache.keys().next().value);return v;}
async function loadJSON(path){const r=await fetch(path);if(!r.ok)throw new Error(`HTTP ${r.status} · ${path}`);return r.json();}
function toast(s){$('toast').textContent=s;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',2200);}
async function copy(s){try{await navigator.clipboard.writeText(s);toast('已复制');}catch{toast('无法自动复制，请在内容窗口手动复制');}}
function navigate(view){if(!['overview','experiments','methods','protocol'].includes(view))return;state.view=view;document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==view);document.querySelectorAll('.header [data-view]').forEach(b=>{if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});history.replaceState(null,'',view==='experiments'&&state.selected?`#task=${state.selected}`:`#${view}`);remember();if(view==='experiments'&&!activeDetail)selectTask(state.selected??filtered[0]?.key,false);}
function benchButtons(container, selected){$(container).innerHTML=['ALL',...BENCHES].map(b=>`<button data-bench="${b}" class="${selected===b?'active':''}" aria-pressed="${selected===b}">${b==='ALL'?'全部':b}<small>${b==='ALL'?summary.tasks:summary.counts[b]}</small></button>`).join('');}
function metricPairs(){const groups=new Map();for(const r of summary.metrics){const k=`${r.benchmark}|${r.subtask}|${r.metric}`;if(!groups.has(k))groups.set(k,{benchmark:r.benchmark,subtask:r.subtask,metric:r.metric});groups.get(k)[r.mode]=r;}return [...groups.values()].sort((a,b)=>BENCHES.indexOf(a.benchmark)-BENCHES.indexOf(b.benchmark)||metricOrder.indexOf(a.metric)-metricOrder.indexOf(b.metric)||a.subtask.localeCompare(b.subtask));}
function nativeValue(v,type){return type==='signed'?fmt(v,4):`${fmt(v*100)}${type==='rate'?'%':''}`;}
function renderOverview(){
  $('totals').innerHTML=[['独立任务','1,200','四批 · 最早 40 题已纳入'],['保存回答','2,400','原版 / 当前版完整配对'],['Benchmarks','5','分别使用原生指标定义'],['评分状态','已完成','缺失的全库检索指标不补造']].map(([a,b,c])=>`<div class="stat"><p class="stat-label">${a}</p><p class="stat-value">${b}</p><p class="stat-note">${c}</p></div>`).join('');
  benchButtons('overviewBench',state.overviewBench);
  const rows=metricPairs().filter(x=>state.overviewBench==='ALL'||state.overviewBench===x.benchmark).map(r=>{
    const [name,type]=METRICS[r.metric],a=r.original,b=r.current,d=b.value-a.value;
    const beneficial=r.metric==='hallucination'?-d:d;
    const color=r.metric==='missing'?'':Math.abs(d)<1e-10?'':beneficial>0?'improvement':'regression';
    const delta=Math.abs(d)<1e-10?'不变':`${d>0?'+':''}${fmt(d*(type==='signed'?1:100),type==='signed'?4:2)}${type==='rate'?' pp':type==='score'?' 分':''}`;
    const chart=type==='signed'?'<span class="muted">−1 ～ 1</span>':`<div class="mini-bars" aria-label="原版 ${esc(nativeValue(a.value,type))}；当前版 ${esc(nativeValue(b.value,type))}"><div><i class="original" style="width:${Math.min(100,Math.max(0,a.value*100))}%"></i></div><div><i class="current" style="width:${Math.min(100,Math.max(0,b.value*100))}%"></i></div></div>`;
    return `<tr><td>${esc(r.benchmark)}${r.subtask==='ALL'?'':`<div class="sub">${esc(CATEGORY[r.subtask]??r.subtask)}</div>`}</td><td>${name}</td><td>${a.n}${r.metric==='CR_star'?'<sup>¹</sup>':''}</td><td>${nativeValue(a.value,type)}</td><td>${nativeValue(b.value,type)}</td><td class="${color}">${delta}</td><td>${chart}</td></tr>`;
  });
  if(state.overviewBench==='ALL'||state.overviewBench==='FreshStack')rows.push('<tr><td>FreshStack · 旧问答</td><td>α-nDCG@10 / Coverage@20 / Recall@50</td><td>240</td><td>旧问答未采集</td><td>旧问答未采集</td><td>—</td><td><a href="retrieval.html">全库检索补测 ↗</a></td></tr>');
  $('metricRows').innerHTML=rows.join('');
  const notes=[
    '¹ RGB CR* 仅以已检出错误为分母：原版 4/16，当前版 5/11。纠正率上升，但错误检测率下降，不能只看 CR*。',
    'CRAG 分层：前缀 128 行范围中的 70 题，准确率 18.57% → 20.00%；完整公开文件范围中的另 50 题，20.00% → 12.00%。',
    'MTRAG 主表是样本加权均值。四领域等权宏均值：RB_llm 49.05 → 56.16；RB_alg 33.15 → 38.37；Faithfulness 56.29 → 66.44。',
    'HotpotQA 评分保留完整答案，不事后抽短答案；EM 为 2/120 → 1/120。SP/Joint 未采集。pp = 百分点，F1/RB 的分数变化不是正确率百分点。',
  ];
  $('metricNotes').innerHTML=notes.filter((_,i)=>state.overviewBench==='ALL'||['RGB','CRAG','MTRAG-UN','HotpotQA'][i]===state.overviewBench).map(t=>`<p>${t}</p>`).join('');
  const quality=[['批次构成',summary.cohorts.map(c=>`${c.label}：${c.count}`).join('；')],['JSON 输出格式',`原版 1,200/1,200 合规；当前版 1,155/1,200 合规，45 份不合规仍保留在分母。`],['实际输入存档',`${summary.inputs_verified.toLocaleString()} 份保存输入通过指纹校验；${summary.inputs_unavailable} 份早期复用输入未保存，逐题明确标注。`],['裁判请求',`${summary.judge_usage.physical_dispatches.toLocaleString()} 次物理请求；${summary.judge_usage.successful_physical_requests.toLocaleString()} 次成功。7 次历史失败/结果不明尝试均已获准恢复，不是 7 份待评分回答。`],['裁判用量',`${summary.judge_usage.reported_total_tokens.toLocaleString()} 个服务返回 tokens，不含原始生成；7 次历史尝试用量不明，不能据此推算账单。`],['不可补造的成绩','HotpotQA SP/Joint、MTRAG 官方全库检索、FreshStack 官方检索指标均未采集。'],['补充诊断','旧助手通过率、词面分数、候选池覆盖不代替原生主指标；未另做统一独立盲评。']];
  for(const row of quality)if(row[0]==='不可补造的成绩')row[1]='HotpotQA SP/Joint、MTRAG 官方全库检索及旧 FreshStack 问答的全库排名未采集。新增 FreshStack 全库检索补测另页记录，不追填进旧问答过程。';
  $('qualityTable').innerHTML=`<table><tbody>${quality.map(([a,b])=>`<tr><th>${a}</th><td>${esc(b)}</td></tr>`).join('')}</tbody></table>`;
  $('provenance').innerHTML=`<p class="provenance-note">结果更新时间：${esc(summary.updated_at)}<br>评分标准 SHA-256：${esc(summary.protocol_sha256)}<br>所有原始输入与回答文件的哈希、评分器来源及完整核验信息保存在下载文件中。</p>`;
}
function fillOptions(){
  const categories=[...new Set(index.filter(r=>state.bench==='ALL'||r.benchmark===state.bench).map(r=>r.category))].sort();
  if(!categories.includes(state.category))state.category='ALL';
  $('category').innerHTML='<option value="ALL">全部类型</option>'+categories.map(c=>`<option value="${esc(c)}">${esc(CATEGORY[c]??c)}</option>`).join('');
  $('cohort').innerHTML='<option value="ALL">全部批次</option>'+summary.cohorts.map(c=>`<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('');
  for(const k of ['category','cohort','language','change'])$(k).value=state[k];
  $('search').value=state.search;benchButtons('taskBench',state.bench);
}
function applyFilters(keepPage=false){
  const q=state.search.trim().toLowerCase();
  filtered=index.filter(r=>(state.bench==='ALL'||r.benchmark===state.bench)&&(state.category==='ALL'||r.category===state.category)&&(state.cohort==='ALL'||r.cohort===state.cohort)&&(state.language==='ALL'||r.language===state.language)&&(state.change==='ALL'||r.change===state.change)&&(!q||`${r.question} ${r.id} ${r.domain??''}`.toLowerCase().includes(q)));
  if(!keepPage)state.page=0;
  state.page=Math.max(0,Math.min(state.page,Math.ceil(filtered.length/30)-1));renderList();remember();
}
function statusClass(s){return s.kind==='binary'?(s.value===1?'success':s.value===0?'failure':'unavailable'):s.kind==='continuous'?'continuous':'unavailable';}
function renderList(){
  const page=filtered.slice(state.page*30,(state.page+1)*30);
  $('taskList').innerHTML=page.length?page.map(r=>`<button class="task-item ${r.key===state.selected?'active':''}" data-task="${r.key}" ${r.key===state.selected?'aria-current="true"':''}><div><p class="task-id">${esc(r.id)}</p><p class="task-question">${esc(r.question)}</p></div><span class="task-statuses">${['original','current'].map(m=>`<span class="dot ${statusClass(r.statuses[m])}" title="${modeLabel(m)}：${esc(r.statuses[m].label)}" role="img" aria-label="${modeLabel(m)}：${esc(r.statuses[m].label)}"></span>`).join('')}</span></button>`).join(''):'<p class="empty-state">没有匹配题目</p>';
  $('listCount').textContent=`${filtered.length.toLocaleString()} / 1,200 题`;
  $('pageLabel').textContent=`${filtered.length?state.page+1:0} / ${Math.ceil(filtered.length/30)} 页`;
  $('pagePrev').disabled=state.page===0;$('pageNext').disabled=(state.page+1)*30>=filtered.length;
  renderPosition();
}
function renderPosition(){const p=filtered.findIndex(r=>r.key===state.selected);$('taskPosition').textContent=p<0?'当前题目不在筛选结果中':`${p+1} / ${filtered.length} · 当前筛选`;$('taskPrev').disabled=p<=0;$('taskNext').disabled=p<0||p>=filtered.length-1;}
async function selectTask(key,scroll=true){
  if(!key){$('detail').innerHTML='<p class="empty-state">请选择一个任务</p>';return;}
  const row=index.find(x=>x.key===key);if(!row)return;
  state.selected=key;remember();renderList();
  if(state.view==='experiments')history.replaceState(null,'',`#task=${key}`);
  const ticket=++loadVersion;$('detail').innerHTML='<p class="empty-state">正在读取该题的保存记录…</p>';
  $('hoverCard').hidden=true;
  try{
    const d=taskCache.get(key)??putCache(taskCache,key,await loadJSON(row.path),24);
    if(ticket!==loadVersion)return;activeDetail=d;renderDetail();if(scroll)$('detailScroll').scrollTop=0;
  }catch(e){if(ticket===loadVersion)$('detail').innerHTML=`<div class="error-box">读取失败：${esc(e.message)}<br><button data-retry="true">重新读取</button></div>`;}
}
function pill(s){return `<span class="status-pill ${s.kind==='binary'?(s.value===1?'correct':s.value===0?'incorrect':''):s.kind==='continuous'?'score':''}">${esc(s.label)}</span>`;}
function renderDetail(){
  const d=activeDetail;if(!d)return;
  const r=d.meta;
  const taskTabs=`<div class="task-panels" role="group" aria-label="本题记录栏目">${[['answers','回答对照'],['materials','源材料与分块'],['runtime','本题运行差异']].map(([key,title])=>`<button data-task-panel="${key}" class="${state.taskPanel===key?'active':''}" aria-pressed="${state.taskPanel===key}">${title}</button>`).join('')}</div>`;
  const answers=`<div class="compare-toolbar"><div class="segmented" role="group" aria-label="显示版本">${[['both','并列对照'],['original','只看原版'],['current','只看当前版']].map(([k,l])=>`<button class="${state.compare===k?'active':''}" data-compare="${k}" aria-pressed="${state.compare===k}">${l}</button>`).join('')}</div><span>${esc(summary.scopes[r.benchmark])}</span></div><div class="comparison ${state.compare==='both'?'':'single'}">${['original','current'].filter(m=>state.compare==='both'||state.compare===m).map(m=>versionHTML(m,d.versions[m])).join('')}</div>`;
  const body=state.taskPanel==='materials'?materialsShell(d):state.taskPanel==='runtime'?'<div id="runtimePanel"></div>':answers;
  $('detail').innerHTML=`<div class="task-meta"><span class="badge bench">${esc(r.benchmark)}</span><span>${esc(CATEGORY[r.category]??r.category)}</span>${r.domain?`<span>· ${esc(r.domain)}</span>`:''}<span>· ${esc(r.cohort_label)}</span><span class="badge">${esc(r.language)}</span></div><h1 class="question-title">${esc(d.question)}</h1>${d.question.length>900?'<button class="quiet question-toggle" data-expand-question>展开完整题目 ↕</button>':''}<details class="reference"><summary>参考答案与原始标签（不属于模型输入）</summary><pre>${esc(dump(d.reference))}</pre>${d.history.length?`<details><summary>题目保存的历史上下文 · ${d.history.length} 条</summary><pre>${esc(dump(d.history))}</pre></details>`:''}</details>${taskTabs}${body}<div class="detail-footer">${esc(r.id)}<br>${esc(r.cohort)}<br>原始回答 SHA-256 · original ${d.versions.original.score.raw_answer_sha256}<br>current ${d.versions.current.score.raw_answer_sha256}</div>`;
  if(state.taskPanel==='materials')mountMaterials($('materialPanel'),d,openDialog);
  if(state.taskPanel==='runtime')mountRuntime($('runtimePanel'),d);
}
function versionHTML(mode,v){const tab=state.tabs[mode]??'answer';return `<section class="version ${mode==='current'?'current-version':''}"><div class="version-heading"><h2>${modeLabel(mode)}</h2>${pill(v.status)}</div><div class="version-tabs" role="tablist" aria-label="${modeLabel(mode)}记录">${[['answer','回答'],['evidence','检索材料'],['input','模型输入'],['raw','原始输出'],['score','评分记录']].map(([k,l])=>`<button role="tab" id="tab-${mode}-${k}" aria-controls="panel-${mode}" aria-selected="${k===tab}" class="${k===tab?'active':''}" data-mode="${mode}" data-tab="${k}">${l}</button>`).join('')}</div><div class="version-content" id="panel-${mode}" role="tabpanel" aria-labelledby="tab-${mode}-${tab}">${panelHTML(mode,v,tab)}</div></section>`;}
function panelHTML(mode,v,tab){
  if(tab==='answer')return `<div class="answer-text ${v.scored_text?'':'empty'}">${esc(v.scored_text||'（评分正文为空；请查看原始输出与 abstain 字段。）')}</div><div class="answer-info"><span class="badge ${v.score.json_contract_valid?'':'invalid'}">${v.score.json_contract_valid?'JSON 合规':'JSON 格式不合规 · 保留全文'}</span><span class="badge">abstain: ${esc(v.score.structured_abstain??'未解析')}</span><span class="badge">${esc(v.generation.returned_model??'模型标识未保存在此记录')}</span></div><div class="io-buttons"><button class="io-button" data-io="input" data-mode="${mode}">模型输入 JSON ↗</button><button class="io-button" data-io="raw" data-mode="${mode}">原始输出 ↗</button></div><p class="explanation" style="margin-top:10px">按钮支持悬停预览；点击可打开完整内容。原文为保存的模型输出，不补写未保存的内部思考。</p>`;
  if(tab==='evidence')return `<p class="explanation">保存的返回片段，共 ${v.evidence.length} 条；不等于完整候选池或全库排名。实际发送内容以“模型输入”为准。</p>${v.evidence.map((e,i)=>`<details class="evidence" ${i===0?'open':''}><summary><strong>${e.rank}.</strong> ${esc(e.source??e.id??'未命名来源')}${e.page!=null?` · p.${esc(e.page)}`:''}</summary><p>${esc(e.text??'')}</p><div class="evidence-meta">${esc(dump(Object.fromEntries(Object.entries(e).filter(([k])=>k!=='text'))))}</div></details>`).join('')}`;
  if(tab==='input')return v.input_messages?`<p class="explanation">${v.input_source==='actual_call_ledger'?'来自实际调用账本':'来自保存的准备输入'}，已通过请求 SHA-256 校验。参考标签不自动包含在输入中。</p><button class="io-button" data-io="input" data-mode="${mode}">展开完整输入 JSON ↗</button>${v.input_messages.map(m=>`<div class="input-message"><strong>${esc(m.role)}</strong><pre>${esc(typeof m.content==='string'?m.content:dump(m.content))}</pre></div>`).join('')}`:'<p class="warning">这份早期复用回答未保留完整实际调用输入。页面不重建或补造输入；原始回答与评分仍完整保留。</p>';
  if(tab==='raw')return `<div class="io-buttons" style="margin-top:0;margin-bottom:12px"><button class="io-button" data-io="raw" data-mode="${mode}">完整窗口 / 复制 ↗</button></div><pre class="raw-json">${esc(v.raw_answer)}</pre>`;
  return scoreHTML(mode,v);
}
function scoreHTML(mode,v){
  const s=v.score, metrics=[];
  if(s.rgb){metrics.push(['答案组命中',s.rgb.answer_groups_correct],['原生字面拒答标记',s.rgb.literal_refusal],['原生字面错误检测标记',s.rgb.ed]);}
  if(s.hotpot_answer)for(const[k,n]of[['em','Answer EM'],['f1','Answer F1'],['precision','Token Precision'],['recall','Token Recall']])metrics.push([n,fmt(s.hotpot_answer[k]*100)]);
  if(s.crag_final_decision)metrics.push(['原生最终判定',s.crag_final_decision],['CRAG 得分',{correct:1,missing:0,incorrect:-1}[s.crag_final_decision]]);
  if(s.mtrag_conditioned)for(const[k,val]of Object.entries(s.mtrag_conditioned))metrics.push([`${k}（条件处理）`,val===null?'未定义':fmt(val*100)]);
  let extra=s.benchmark==='FreshStack'?`<p class="warning">这份旧问答没有保存全库检索成绩，不以自定义答案通过率替代。<a href="retrieval.html#task=${activeDetail.meta.key}">查看同题独立全库检索补测 ↗</a></p>`:'';
  if(s.benchmark==='HotpotQA')extra='<p class="explanation">SP/Joint 未采集。F1 是连续词面分数，不按自定义阈值转成正确率。</p>';
  return `<div class="score-grid">${metrics.map(([k,v])=>`<div class="score-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>${extra}<h3 class="component-heading">保存的裁判记录 · ${v.judges.length}</h3><p class="explanation">按各 Bench 原生流程及条件门控执行；门控后不适用的组件不会重复评分。点击阶段可查看实际输入、输出与判定。</p>${v.judges.map((j,i)=>`<details class="judge" data-judge="${esc(j.path)}" data-mode="${mode}" data-judge-index="${i}"><summary>${esc(j.stage)}${j.suffix?` · ${esc(j.suffix)}`:''}</summary><div class="judge-content"><p class="explanation">展开后按需读取</p></div></details>`).join('')}<div class="io-buttons"><button class="io-button" data-io="score" data-mode="${mode}">完整评分 JSON ↗</button></div>`;
}
function ioData(kind,mode){const v=activeDetail?.versions[mode];if(!v)return null;if(kind==='raw')return {title:`${modeLabel(mode)} · 原始输出`,value:v.raw_answer,note:'完整保存原文；不会修复 JSON 或抽取有利短答案。'};if(kind==='input')return {title:`${modeLabel(mode)} · 完整模型输入`,value:v.input_messages??'未保存完整输入，不补造。',note:v.input_verified?'保存输入已通过请求指纹校验。':'早期复用记录没有保留完整实际输入。'};return {title:`${modeLabel(mode)} · 完整评分 JSON`,value:v.score,note:'原生组件与适配元数据。'};}
function openDialog(data){if(!data)return;dialogValue=dump(data.value);$('dialogTitle').textContent=data.title;$('dialogNote').textContent=data.note??'';$('dialogText').textContent=dialogValue;$('hoverCard').hidden=true;$('jsonDialog').showModal();}
async function loadJudge(details){
  if(!details.open||details.dataset.loaded)return;const path=details.dataset.judge,content=details.querySelector('.judge-content');content.innerHTML='<p class="explanation">正在读取裁判原始记录…</p>';
  try{const r=judgeCache.get(path)??putCache(judgeCache,path,await loadJSON(path),16);if(!details.isConnected)return;details.dataset.loaded='true';content.innerHTML=`<p class="explanation">返回模型：${esc(r.returned_model)} · ${r.usage?.total_tokens?.toLocaleString()??'用量未保存'} tokens</p><h3 class="component-heading">裁判输出</h3><pre class="raw-json">${esc(r.response_text)}</pre><h3 class="component-heading">解析判定</h3><pre class="raw-json">${esc(dump(r.judgment))}</pre><button class="io-button" data-judge-dialog="${esc(path)}">完整裁判输入与输出 JSON ↗</button><p class="evidence-meta">SHA-256 ${esc(r.request_sha256)}</p>`;}catch(e){content.innerHTML=`<p class="warning">${esc(e.message)}；收起后重新展开可重试。</p>`;}
}
function stepTask(delta){const pos=filtered.findIndex(r=>r.key===state.selected),r=filtered[pos+delta];if(!r||pos<0)return;state.page=Math.floor((pos+delta)/30);selectTask(r.key);}
function wire(){
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.view){navigate(b.dataset.view);return;}
    if(b.dataset.bench){if(b.closest('#overviewBench')){state.overviewBench=b.dataset.bench;renderOverview();remember();}else{state.bench=b.dataset.bench;fillOptions();applyFilters();if(filtered[0])selectTask(filtered[0].key);}return;}
    if(b.dataset.task){selectTask(b.dataset.task);return;}
    if(b.dataset.taskPanel){state.taskPanel=b.dataset.taskPanel;remember();renderDetail();return;}
    if(b.dataset.tab){state.tabs[b.dataset.mode]=b.dataset.tab;remember();renderDetail();return;}
    if(b.dataset.compare){state.compare=b.dataset.compare;remember();renderDetail();return;}
    if(b.dataset.io){openDialog(ioData(b.dataset.io,b.dataset.mode));return;}
    if(b.dataset.judgeDialog){const r=judgeCache.get(b.dataset.judgeDialog);if(r)openDialog({title:`${r.stage} · 裁判完整 JSON`,value:r,note:'只含保存的请求体与响应；不含认证头或账户配置。'});return;}
    if(b.hasAttribute('data-expand-question')){const q=document.querySelector('.question-title');q.style.maxHeight=q.style.maxHeight==='none'?'300px':'none';return;}
    if(b.dataset.retry)selectTask(state.selected);
  });
  document.addEventListener('toggle',e=>{if(e.target.matches?.('details[data-judge]'))loadJudge(e.target);},true);
  let searchTimer;$('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.search=$('search').value;applyFilters();},160);});
  for(const k of ['category','cohort','language','change'])$(k).addEventListener('change',()=>{state[k]=$(k).value;applyFilters();});
  $('resetFilters').onclick=()=>{for(const k of ['bench','category','cohort','language','change'])state[k]='ALL';state.search='';fillOptions();applyFilters();};
  $('pagePrev').onclick=()=>{state.page--;renderList();$('taskList').scrollTop=0;remember();};$('pageNext').onclick=()=>{state.page++;renderList();$('taskList').scrollTop=0;remember();};
  $('taskPrev').onclick=()=>stepTask(-1);$('taskNext').onclick=()=>stepTask(1);
  $('copyLink').onclick=()=>copy(`${location.origin}${location.pathname}#task=${state.selected}`);
  $('closeDialog').onclick=()=>$('jsonDialog').close();$('copyJson').onclick=()=>copy(dialogValue);
  document.addEventListener('keydown',e=>{if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)&&state.view==='experiments'&&!$('jsonDialog').open){e.preventDefault();stepTask(e.key==='ArrowLeft'?-1:1);}});
  document.addEventListener('pointerover',e=>{const b=e.target.closest('[data-io]');if(!b||!matchMedia('(hover:hover)').matches)return;clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>{const d=ioData(b.dataset.io,b.dataset.mode);if(!d)return;$('hoverTitle').textContent=`${d.title} · 点击查看全文`;$('hoverText').textContent=dump(d.value).slice(0,5000);$('hoverCard').hidden=false;},350);});
  document.addEventListener('pointerout',e=>{if(e.target.closest('[data-io]')){clearTimeout(hoverTimer);$('hoverCard').hidden=true;}});
  addEventListener('hashchange',()=>{const hash=location.hash.slice(1),p=new URLSearchParams(hash);if(p.has('task')){navigate('experiments');selectTask(p.get('task'));}else navigate(hash);});
}
async function init(){try{[summary,index]=await Promise.all([loadJSON('data/summary.json'),loadJSON('data/index.json')]);if(!index.some(x=>x.key===state.selected))state.selected=index[0]?.key;renderOverview();fillOptions();applyFilters(true);wire();$('boot').hidden=true;$('workspace').hidden=false;navigate(state.view);}catch(e){$('boot').innerHTML=`<div class="error-box">页面数据读取失败：${esc(e.message)}<br>请通过本地 HTTP 服务或部署地址打开，而不是双击 HTML。<br><button id="reload">重新加载</button></div>`;$('reload').onclick=()=>location.reload();}}
init();
