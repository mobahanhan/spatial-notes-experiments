(() => {
  'use strict';
  const section = document.createElement('section');
  section.id = 'rgbGeometrySection'; section.hidden=true; section.className = 'section';
  section.innerHTML = `<h2>RGB 估计点云</h2><div class="rgb-tabs" role="group" aria-label="点云类型"><button id="rgbLocal" type="button" aria-pressed="false">原始单帧估计</button><button id="rgbFusion" type="button" aria-pressed="true">配准分组</button></div><label id="rgbGroupRow" class="rgb-group-row">查看已保留分组（人工查看） <select id="rgbGroup"><option value="">当前模型输入</option></select></label><p class="rgb-status" id="rgbStatus" role="status">等待当前帧…</p><img id="rgbPreview" class="rgb-preview" alt="当前步骤模型输入中的点云预览" hidden><div class="rgb-actions"><button id="rgbOpen" class="rgb-open" type="button" disabled>交互查看 3D 点云</button><a id="rgbPly" hidden download>下载 PLY</a><a id="rgbReport" hidden target="_blank" rel="noopener">配准记录</a></div><details id="rgbModelPanels"><summary>本步实际输入的总览与候选图</summary><div id="rgbModelPanelList"></div></details><p class="rgb-note">由 RGB 估计的可见表面；各独立组的位置关系未知。左侧房间陈设来自场景元数据，仅供人工对照，未送入模型。相机运行记录与估计点云使用不同坐标来源。</p>`;
  document.querySelector('#decisionSection').before(section);
  const modal = document.createElement('div');
  modal.className = 'rgb-modal'; modal.hidden = true;
  modal.innerHTML = `<div class="rgb-dialog" role="dialog" aria-modal="true" aria-labelledby="rgbDialogTitle"><div class="rgb-dialog-head"><strong id="rgbDialogTitle">点云</strong><button id="rgbClose" type="button" aria-label="关闭交互点云">关闭 ×</button></div><div id="rgbModalBody" class="rgb-modal-body"></div><div class="rgb-dialog-foot"><button id="rgbPrev" type="button">上一帧</button><span id="rgbModalStatus"></span><button id="rgbNext" type="button">下一帧</button></div></div>`;
  document.body.append(modal);
  const $ = id => document.getElementById(id);
  const cache = new Map(), warmed = new Set();
  let current = null, kind = 'fusion', serial = 0, selected = null, savedFocus = null, groupChoice='';
  function records(id) {
    if (!cache.has(id)) cache.set(id, fetch(`/api/rgb-geometry?id=${encodeURIComponent(id)}`).then(r => {
      if (!r.ok) throw new Error(`点云记录 HTTP ${r.status}`); return r.json();
    }).catch(error => {cache.delete(id); throw error;}));
    return cache.get(id);
  }
  function setBlank(message) {
    $('rgbPreview').hidden = true; $('rgbPreview').removeAttribute('src');
    $('rgbStatus').textContent = message; $('rgbOpen').disabled = true;
    $('rgbModelPanelList').replaceChildren(); $('rgbModelPanels').hidden=true;
    $('rgbPly').hidden = true; $('rgbReport').hidden = true; selected = null;
    if (!modal.hidden) $('rgbModalBody').replaceChildren();
  }
  function summary(row, index) {
    const s = selected.summary;
    if(selected.human_group_browser) return `帧 ${index+1} · 人工查看保留的组 ${s.component_id} · ${s.component_frame_count} 张 RGB\n与其他组的位置关系未知。这里查看保存的独立 3D 快照；本步实际发送的分组总览、原图与候选裁剪见“完整输入”。`;
    const inputLabel=row[kind].attached_to_model?'已送入模型':'未送入模型';
    const phase = row.phase_before ? ` · ${row.phase_before}` : '';
    if (kind === 'local') return `帧 ${index+1} · ${row.view_id}${phase}\n${Number(s.point_count).toLocaleString()} 点 · 原始单帧估计 · ${inputLabel}`;
    const aligned = s.component_frame_count < 2 ? '单帧估计，尚未融合' : s.current_registration === 'aligned' ? '局部多视角配准' : '复用组内记录';
    return `帧 ${index+1} · ${row.view_id}${phase}\n当前组 ID ${s.component_id} · 共 ${s.component_count} 组（组间位置未知） · ${s.component_frame_count} 张 RGB · ${Number(s.point_count).toLocaleString()} 点 · ${aligned} · ${inputLabel}`;
  }
  function loadModal(token) {
    if (modal.hidden || !selected || token !== serial) return;
    const box = $('rgbModalBody'), loading = document.createElement('div');
    loading.className = 'rgb-modal-loading'; loading.textContent = '加载当前步骤的交互点云…';
    const iframe = document.createElement('iframe'); iframe.title = '当前步骤的 RGB 估计三维点云';
    iframe.style.opacity = '0';
    iframe.addEventListener('load', () => {if (token===serial && iframe.isConnected) {loading.remove(); iframe.style.opacity='1';}}, {once:true});
    iframe.src = selected.viewer_url || selected.base + 'index.html?display=repair-20261031'; box.replaceChildren(loading, iframe);
    $('rgbDialogTitle').textContent = `${selected.human_group_browser?'保留分组（人工查看）':kind==='fusion'?'当前配准组':'单帧估计'} · 帧 ${current.index+1}`;
    $('rgbModalStatus').textContent = $('rgbStatus').textContent;
    $('rgbPrev').disabled = current.index===0;
    $('rgbNext').disabled = current.index>=current.total-1;
  }
  async function update(detail) {
    if(current?.id!==detail.id) groupChoice='';
    if(!detail.cloud){section.hidden=true;setBlank('当前栏目没有点云记录');if(!modal.hidden)close();document.getElementById('rgbStopStatus')?.remove();return;}
    section.hidden=false;current = {...detail}; const token = ++serial;
    $('rgbGeometrySection').dataset.runId = detail.id;
    $('rgbGeometrySection').dataset.displayedFrame = String(detail.index);
    setBlank(`载入帧 ${detail.index+1} 的点云…`);
    try {
      const rows = await records(detail.id); if (token!==serial) return;
      current.total = rows.length;
      const row = rows[detail.index];
      const outcome=row?.run_outcome;
      if(outcome){
        let badge=$('rgbStopStatus');
        if(!badge){badge=document.createElement('div');badge.id='rgbStopStatus';$('result').append(badge);}
        const accepted=outcome.answer_status==='evidence_gate_accepted';
        badge.className='rgb-stop-status'+(accepted?'':' rgb-stop-unverified');
        badge.textContent=accepted?'终止状态：通过协议证据门控':`终止状态：耗尽 ${outcome.steps} 步预算；提交数字为未通过证据门控的估计`;
      }
      const panels=row?.model_panels||[];
      $('rgbModelPanels').hidden=!panels.length;
      $('rgbModelPanels').querySelector('summary').textContent=`本步实际输入的总览与候选图（${panels.length} 张）`;
      for(const panel of panels){
        const figure=document.createElement('figure'),im=document.createElement('img'),caption=document.createElement('figcaption'),link=document.createElement('a');
        im.loading='lazy';im.src=panel.url;im.alt=panel.label;link.href=panel.url;link.target='_blank';link.rel='noopener';link.append(im);caption.textContent=panel.label;figure.append(link,caption);$('rgbModelPanelList').append(figure);
      }
      if (!row?.[kind]) {setBlank('这一帧没有保存该类点云。'); return;}
      $('rgbGroupRow').hidden=kind!=='fusion';
      const groups=row.fusion?.groups||[];
      $('rgbGroup').replaceChildren(new Option('当前步骤实际模型输入',''));
      for(const group of groups) $('rgbGroup').add(new Option(`组 ${group.component_id} · ${group.frame_count} 张 RGB${group.frame_count<2?' · 单帧':' · 局部融合'}`,String(group.component_id)));
      if(!groups.some(g=>String(g.component_id)===groupChoice)) groupChoice='';
      $('rgbGroup').value=groupChoice;
      selected = kind==='fusion'&&groupChoice!==''?groups.find(g=>String(g.component_id)===groupChoice):row[kind]; $('rgbPreview').alt=selected.human_group_browser?'保留分组，仅供人工回看':selected.attached_to_model?'当前步骤实际模型输入中的点云预览':'原始单帧估计，未发送给模型'; $('rgbStatus').textContent = summary(row,detail.index);
      $('rgbStatus').style.whiteSpace = 'pre-line';
      document.querySelector('.rgb-phase-row')?.remove();
      const labels={adjust_height:'调整高度',eight_direction_sweep:'八方向环视',look_down:'观察脚下',complete:'初始观察完成'};
      if(row.phase_before){
        const phase=document.createElement('div');phase.className='harness-row rgb-phase-row';
        const title=document.createElement('span'),value=document.createElement('strong');title.textContent='初始观察';
        value.textContent=(labels[row.phase_before]||row.phase_before)+(row.phase_after!==row.phase_before?' → '+(labels[row.phase_after]||row.phase_after):'');
        phase.append(title,value);$('harnessState').prepend(phase);
      }
      const src = selected.preview_url || selected.base + 'map_preview.png', image = new Image();
      image.onload = () => {if (token!==serial) return; $('rgbPreview').src=src; $('rgbPreview').hidden=false;};
      image.onerror = () => {if(token===serial) $('rgbStatus').textContent+='\n点云预览暂时无法读取，可重选类型重试。';};
      image.src = src;
      $('rgbOpen').disabled=false;
      $('rgbPly').href=selected.base+'pointcloud.ply'; $('rgbPly').hidden=Boolean(selected.packed);
      $('rgbReport').href=selected.report_url || selected.base+'report.json'; $('rgbReport').hidden=false;
      for (const next of rows.slice(detail.index+1,detail.index+4)) {
        const url=next[kind]?.preview_url || next[kind]?.base+'map_preview.png';
        if(next[kind]&&!warmed.has(url)){warmed.add(url); const im=new Image(); im.src=url;}
      }
      loadModal(token);
    } catch(error) {if(token===serial) setBlank(error.message);}
  }
  $('rgbGroup').addEventListener('change',()=>{groupChoice=$('rgbGroup').value;if(current) update(current);});
  function choose(value) {
    kind=value; $('rgbLocal').setAttribute('aria-pressed',String(kind==='local'));
    $('rgbFusion').setAttribute('aria-pressed',String(kind==='fusion'));
    if(current) update(current);
  }
  function close() {modal.hidden=true; $('rgbModalBody').replaceChildren(); savedFocus?.focus();}
  $('rgbLocal').addEventListener('click',()=>choose('local'));
  $('rgbFusion').addEventListener('click',()=>choose('fusion'));
  $('rgbOpen').addEventListener('click',()=>{
    if(!selected) return;
    if($('play').textContent.includes('暂停')) $('play').click();
    savedFocus=document.activeElement;modal.hidden=false;loadModal(serial);$('rgbClose').focus();
  });
  $('rgbClose').addEventListener('click',close);
  modal.addEventListener('click',event=>{if(event.target===modal) close();});
  modal.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab'){
      const focusable=[...modal.querySelectorAll('button:not(:disabled),iframe')];
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  $('rgbPrev').addEventListener('click',()=>$('decisionPrev').click());
  $('rgbNext').addEventListener('click',()=>$('decisionNext').click());
  window.addEventListener('esi:committed-frame',event=>update(event.detail));
  window.addEventListener('esi:run-loading',()=>{++serial; current=null;setBlank('加载当前任务…');section.hidden=true;if(!modal.hidden) close();});
})();
