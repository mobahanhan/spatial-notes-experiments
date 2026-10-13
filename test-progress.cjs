'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/site/experiments.html','utf8'),playerSource=fs.readFileSync(__dirname+'/site/assets/frame_playback.js','utf8');
const uiSource=html.slice(html.indexOf('  function seekFromScrubber('),html.indexOf('  const framePlayer='));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(walk){
  const nodes=new Map(),images=[],paints=[],timers=new Map();let timer=0;
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:0,dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v}});return nodes.get(selector)};
  class Image{
    constructor(){this.dataset={};this.attrs=new Map();this.hidden=true;this.naturalWidth=0;this.naturalHeight=360;images.push(this)}
    get attributes(){return [...this.attrs].map(([name,value])=>({name,value}))}
    setAttribute(k,v){this.attrs.set(k,v)}
    removeAttribute(k){this.attrs.delete(k)}
    replaceWith(image){this.replaced=image}
    decode(){return Promise.resolve()}
  }
  const context={window:{requestAnimationFrame:fn=>paints.push(fn)},document:{querySelector:node},Image,
    setTimeout(fn){const id=++timer;timers.set(id,fn);return id},clearTimeout(id){timers.delete(id)},playing:false,walkPlaying:false};
  vm.createContext(context);vm.runInContext(playerSource,context);vm.runInContext(uiSource,context);
  const canvas={dataset:{},width:0,height:0,getContext(){return{drawImage(image){canvas.src=image.src}}}};
  const slider=node(walk?'#walkScrubber':'#scrubber'),geometry={frame:-1};
  const player=context.window.FramePlayback.create({image:new Image(),surface:canvas,count:()=>5,url:index=>'/saved/'+index,
    onCommit(index){geometry.frame=index;slider.value=index},onState(state){context.playbackState(state,walk)}});
  context.framePlayer=walk?{pause(){}}:player;context.walkPlayer=walk?player:{pause(){}};
  async function loaded(index){const image=images.findLast(image=>image.src==='/saved/'+index&&image.onload);assert.ok(image,'pending image '+index);image.naturalWidth=640;image.complete=true;await image.onload();await settle()}
  async function paint(){for(const fn of paints.splice(0))fn();await settle()}
  return {context,node,player,slider,canvas,geometry,images,loaded,paint,seek(index){slider.value=index;return context.seekFromScrubber({currentTarget:slider},player)}};
}
(async()=>{
  for(const walk of [false,true]){
    const f=fixture(walk),first=f.player.seek(0);await f.loaded(0);await f.paint();await first;
    assert.equal(Number(f.slider.value),0);
    const pending=f.seek(3);
    assert.equal(f.player.wanted,3,'pause must not overwrite the captured target');
    assert.equal(Number(f.slider.value),0,'dragging ahead must not advance displayed progress');
    assert.equal(f.geometry.frame,0);assert.equal(f.canvas.dataset.displayedFrame,'0');
    assert.equal(f.slider.dataset.requestedFrame,'3');assert.ok(f.node(walk?'#walkPlaybackStatus':'#framePlaybackStatus').textContent.includes('正在加载帧 4/5'));
    await f.loaded(3);
    assert.equal(Number(f.slider.value),0,'decoded but not painted is still the old frame');
    await f.paint();assert.equal(await pending,true);
    assert.equal(Number(f.slider.value),3);assert.equal(f.geometry.frame,3);assert.equal(f.canvas.dataset.displayedFrame,'3');assert.equal(f.slider.dataset.displayedFrame,'3');
    const rapidOld=f.seek(1),rapidNew=f.seek(2);await f.loaded(2);await f.paint();await rapidNew;
    await f.loaded(1);await f.paint();await rapidOld;
    assert.equal(Number(f.slider.value),2,'a stale request cannot roll back progress');assert.equal(f.geometry.frame,2);
    const failed=f.seek(4);const image=f.images.findLast(image=>image.src==='/saved/4'&&image.onerror);assert.ok(image);image.onerror();await settle();assert.equal(await failed,false);
    assert.equal(Number(f.slider.value),2,'failed seeks retain the displayed progress');assert.equal(f.canvas.dataset.displayedFrame,'2');
    f.player.reset();assert.equal(Number(f.slider.value),0);assert.equal(f.slider.dataset.displayedFrame,'-1');
  }
  assert.ok(html.includes("seekFromScrubber(e,framePlayer)"));assert.ok(html.includes("seekFromScrubber(event,walkPlayer)"));
  console.log('Progress controls passed for observation and robot playback: slow seeks, target-before-pause, decode-before-paint, atomic progress/image/3D commit, rapid seeks, failure and reset.');
})().catch(error=>{console.error(error);process.exitCode=1});
