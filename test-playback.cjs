'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/site/assets/frame_playback.js','utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({count=3,interval=650,staticSite=false,paint=false,surface=false}={}){
  let serial=0,now=0;const timers=new Map(),images=[],commits=[],states=[],paints=[],pixels=[];
  class FakeImage{
    constructor(){this.attrs=new Map();this.dataset={};this.hidden=true;this.complete=false;this.naturalWidth=0;this.naturalHeight=360;images.push(this);}
    get attributes(){return [...this.attrs].map(([name,value])=>({name,value}));}
    setAttribute(name,value){this.attrs.set(name,String(value));}
    removeAttribute(name){this.attrs.delete(name);if(name==='src')this.src='';}
    replaceWith(image){this.replaced=image;}
    decode(){return Promise.resolve();}
  }
  const initial=new FakeImage();initial.setAttribute('id','frameImage');initial.setAttribute('class','frame-image');initial.setAttribute('alt','saved observation');
  const context=vm.createContext({window:{},Image:FakeImage,
    setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);}});
  if(staticSite)context.window.ESIStatic={resourceURL:route=>'https://pages.invalid/project/assets/'+encodeURIComponent(route)+'.png'};
  if(paint)context.window.requestAnimationFrame=fn=>{paints.push(fn);};
  vm.runInContext(source,context);
  const f={run:'run-a',count};
  const screen=surface?{dataset:{},hidden:true,width:0,height:0,getContext(){return{drawImage(image){pixels.push(image.src);}};}}:null;
  const player=context.window.FramePlayback.create({image:initial,surface:screen,count:()=>f.count,url:index=>`/api/frame?id=${f.run}&index=${index}`,interval,
    onCommit(index,image){if(screen)assert.equal(screen.dataset.displayedFrame,String(index),'RGB pixels must commit with metadata');commits.push({index,src:image.src,decoded:image.complete&&image.naturalWidth>0});},onState(state){states.push(state);}});
  function url(index){const route=`/api/frame?id=${f.run}&index=${index}`;return staticSite?context.window.ESIStatic.resourceURL(route):route;}
  function pending(index){return images.findLast(image=>image.src===url(index)&&image.onload);}
  async function loaded(index){const image=pending(index);assert.ok(image,`No pending image ${index}`);image.complete=true;image.naturalWidth=640;await image.onload();await settle();}
  async function fail(index){const image=pending(index);assert.ok(image);image.onerror();await settle();}
  async function advance(ms){now+=ms;for(const [id,timer] of [...timers]){if(timer.at<=now){timers.delete(id);timer.fn();}}await settle();}
  async function flushPaint(){for(const fn of paints.splice(0))fn();await settle();}
  return Object.assign(f,{player,images,commits,states,timers,loaded,fail,advance,url,screen,pixels,paints,flushPaint});
}

(async()=>{
  for(const interval of [650,180]){
    const f=fixture({interval});const first=f.player.seek(0);
    assert.equal(f.commits.length,0,'initial metadata cannot precede its image');
    await f.loaded(0);await first;assert.equal(f.commits.at(-1).index,0);
    await f.player.play();await f.advance(interval);
    assert.equal(f.player.busy,true);assert.equal(f.player.index,0);
    await f.advance(interval*4);
    assert.equal(f.commits.length,1,'slow download cannot cause skipped frames or blank-image commits');
    assert.equal(f.images.filter(image=>image.src===f.url(1)).length,1,'pending fetch is reused');
    f.player.pause();await f.loaded(1);
    assert.equal(f.player.index,0,'a response after pause cannot advance the frame');
    await f.player.play();await f.advance(interval);assert.equal(f.player.index,1);
    await f.loaded(2);await f.advance(interval);assert.equal(f.player.index,2);
    assert.equal(f.player.playing,false,'stop at final frame, do not silently wrap');
    assert.ok(f.commits.every(commit=>commit.decoded));
    await f.advance(interval*5);assert.equal(f.player.index,2);
    await f.player.play();assert.equal(f.player.index,0,'explicit replay from the end starts at the first frame');
    f.player.pause();
  }
  const rapid=fixture();const a=rapid.player.seek(0);const b=rapid.player.seek(2);
  await rapid.loaded(2);await b;await rapid.loaded(0);await a;
  assert.deepEqual(rapid.commits.map(c=>c.index),[2],'out-of-order image arrival never rolls back the scrubber');
  const stale=fixture();const old=stale.player.seek(0);const oldImage=stale.images.at(-1);
  stale.run='run-b';stale.player.reset();const fresh=stale.player.seek(0);await stale.loaded(0);await fresh;
  oldImage.complete=true;oldImage.naturalWidth=640;await oldImage.onload();await old;
  assert.equal(stale.commits.length,1);assert.ok(stale.commits[0].src.includes('run-b'),'switching experiments cancels stale commits');
  const broken=fixture();const initial=broken.player.seek(0);await broken.loaded(0);await initial;
  const bad=broken.player.seek(1);await broken.fail(1);assert.equal(await bad,false);
  assert.equal(broken.player.index,0);assert.ok(broken.player.error);
  const retry=broken.player.seek(1);await broken.loaded(1);assert.equal(await retry,true);assert.equal(broken.player.error,'');
  const hidden=fixture();const loading=hidden.player.seek(0);hidden.player.setActive(false);
  await hidden.loaded(0);await loading;assert.equal(hidden.commits.length,0);
  hidden.player.setActive(true);await settle();assert.equal(hidden.player.index,0);assert.equal(hidden.player.playing,false);
  const single=fixture({count:1});const only=single.player.seek(0);await single.loaded(0);await only;await single.player.play();
  assert.equal(single.player.playing,false);assert.equal(single.timers.size,0);
  const exported=fixture({staticSite:true});const offline=exported.player.seek(0);await exported.loaded(0);await offline;
  assert.ok(exported.commits[0].src.startsWith('https://pages.invalid/project/assets/'));
  assert.equal(exported.player.image.attrs.get('id'),'frameImage');assert.equal(exported.player.image.attrs.get('alt'),'saved observation');
  const timeout=fixture();const timed=timeout.player.seek(0);await timeout.advance(30000);assert.equal(await timed,false);assert.ok(timeout.player.error.includes('超时'));
  const atomic=fixture({paint:true,surface:true});const atomicFirst=atomic.player.seek(0);await atomic.loaded(0);
  assert.equal(atomic.commits.length,0);assert.equal(atomic.pixels.length,0,'decode alone cannot advance either canvas');
  await atomic.flushPaint();assert.equal(await atomicFirst,true);assert.equal(atomic.screen.hidden,false);assert.equal(atomic.player.image.hidden,true);
  assert.equal(atomic.screen.width,640);assert.equal(atomic.screen.height,360);
  const atomicNext=atomic.player.seek(1);await atomic.loaded(1);
  assert.equal(atomic.player.index,0);assert.equal(atomic.screen.dataset.displayedFrame,'0');
  await atomic.flushPaint();assert.equal(await atomicNext,true);assert.equal(atomic.screen.dataset.displayedFrame,'1');
  assert.deepEqual(atomic.pixels,atomic.commits.map(commit=>commit.src));
  const cancelled=atomic.player.seek(2);await atomic.loaded(2);atomic.player.reset();await atomic.flushPaint();
  assert.equal(await cancelled,false);assert.equal(atomic.pixels.length,2,'a cancelled queued paint must not show a stale frame');
  assert.equal(atomic.screen.hidden,true);assert.equal(atomic.screen.dataset.displayedFrame,undefined);
  const canvasRapid=fixture({paint:true,surface:true});const canvasOld=canvasRapid.player.seek(0);await canvasRapid.loaded(0);
  const canvasLatest=canvasRapid.player.seek(2);await canvasRapid.loaded(2);await canvasRapid.flushPaint();
  assert.equal(await canvasOld,false);assert.equal(await canvasLatest,true);assert.deepEqual(canvasRapid.commits.map(commit=>commit.index),[2]);
  assert.equal(canvasRapid.pixels.length,1,'a superseded frame cannot paint before the latest RGB/geometry commit');
  console.log('Frame playback passed: atomic RGB/geometry paint, queued-paint cancellation, both playback rates, decode-before-commit, slow network, pause, final stop, rapid seeking, run-switch cancellation, errors/retry, visibility, single-frame, timeout and static URL routing.');
})().catch(error=>{console.error(error);process.exitCode=1});
