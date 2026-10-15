'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const runtime=fs.readFileSync(__dirname+'/site/assets/static_runtime.js','utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(hint){
 const scripts=[],manifest={catalog:[{id:'a'}],files:{'run/a':'run.js','geometry/a':'geometry.js','geometry/stale':'stale.js'},resources:{},run_geometry:hint?{a:hint}:undefined};
 const context={window:{ESI_STATIC_MANIFEST:manifest},document:{baseURI:'https://pages.invalid/project/experiments.html',createElement:()=>({remove(){}}),head:{append:script=>scripts.push(script)}},URL,URLSearchParams,Response,DOMException};
 vm.createContext(context);vm.runInContext(runtime,context);
 function complete(file,key,value){const script=scripts.find(script=>script.src.endsWith(file));assert.ok(script,file);context.window.ESIStatic.register(key,value);script.onload();}
 return{scripts,api:context.window.ESIStatic,complete};
}
(async()=>{
 const f=fixture('geometry/a'),pending=f.api.dataFor('/api/data?id=a');
 assert.equal(f.scripts.length,2,'run and geometry downloads must start before either completes');
 f.complete('geometry.js','geometry/a',{room_geometry:{fixture:true},objects:[1,2]});await settle();
 f.complete('run.js','run/a',{geometry_key:'geometry/a',data:{run:{id:'a'},trajectory:[1]}});
 const data=await pending;assert.equal(data.run.id,'a');assert.equal(data.room_geometry.fixture,true);assert.equal(data.objects.length,2);
 await f.api.dataFor('/api/data?id=a');assert.equal(f.scripts.length,2,'switching back reuses decoded static data');
 const legacy=fixture(),old=legacy.api.dataFor('/api/data?id=a');assert.equal(legacy.scripts.length,1);
 legacy.complete('run.js','run/a',{geometry_key:'geometry/a',data:{run:{id:'a'}}});await settle();assert.equal(legacy.scripts.length,2);
 legacy.complete('geometry.js','geometry/a',{room_geometry:{legacy:true}});assert.equal((await old).room_geometry.legacy,true);
 const stale=fixture('geometry/stale'),safe=stale.api.dataFor('/api/data?id=a');
 stale.complete('stale.js','geometry/stale',{room_geometry:{wrong:true}});
 stale.complete('run.js','run/a',{geometry_key:'geometry/a',data:{run:{id:'a'}}});await settle();
 stale.complete('geometry.js','geometry/a',{room_geometry:{correct:true}});assert.equal((await safe).room_geometry.correct,true,'stale hints must not join a different room');
 console.log('Loading performance passed: parallel run/geometry requests, decoded-data reuse, legacy offline compatibility, safe fallback from stale geometry hints.');
})().catch(error=>{console.error(error);process.exitCode=1});
