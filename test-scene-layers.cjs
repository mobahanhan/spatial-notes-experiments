'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/site/experiments.html','utf8'),calls=[];
const makeCanvas=()=>({width:1,height:1,dataset:{},getContext(){return this.context||(this.context={setTransform(){},clearRect(){},save(){},restore(){},drawImage(layer){assert.ok(layer.width>0&&layer.height>0);calls.push(layer===context.render.layers.room?'room-pixels':'objects-pixels')}})}});
const canvas=makeCanvas(),context={data:{room_geometry:{},architecture:{},objects:[1,2]},canvas,ctx:canvas.getContext('2d'),
 document:{createElement:()=>makeCanvas()},framePlayer:{index:0},w:400,h:300,dpr:2,yaw:0,pitch:.7,distance:8,center:[0,0,1],renderBasis:null,renderPointCache:null,projectedObjects:[],roomLayoutMode:false,
 toggles:{rooms:{checked:false},objects:{checked:true},rays:{checked:true}},
 basis:()=>({}),drawRoom:()=>calls.push('room-draw'),drawRoomRegions:()=>calls.push('regions-draw'),
 visibleObjects:()=>context.data.objects,drawBox:item=>{calls.push('object-draw');context.projectedObjects.push({o:item,x:1,y:2})},
 drawArchitectureDoors:()=>calls.push('doors-draw'),drawGroundLight:()=>calls.push('light'),drawRoomHighlight:()=>calls.push('highlight'),drawTrajectory:()=>calls.push('trajectory'),
 drawRobotWalk(){},drawGt(){},drawRoomLabels(){},markRenderedFrame(){},drawFloorPlan(){},roomRegions:()=>[]};
canvas.width=800;canvas.height=600;vm.createContext(context);
vm.runInContext(html.slice(html.indexOf('  function render(){'),html.indexOf('  function markRenderedFrame(){')),context);
context.render();assert.equal(context.render.layers.builds,1);assert.equal(context.projectedObjects.length,2);
calls.length=0;for(let i=0;i<30;i++)context.render();
assert.equal(context.render.layers.builds,1,'thirty new trajectory frames reuse the same scene layers');
assert.equal(calls.filter(x=>x==='object-draw').length,0,'stationary furniture is not reprojected on each step');
assert.deepEqual(calls.slice(0,5),['room-pixels','light','objects-pixels','highlight','trajectory'],'dynamic light remains behind furniture');
assert.equal(context.projectedObjects.length,2,'cached objects remain clickable');
context.yaw=.2;context.render();assert.equal(context.render.layers.builds,2);
context.toggles.objects.checked=false;context.render();assert.equal(context.render.layers.builds,3);assert.equal(context.projectedObjects.length,0);
context.data={...context.data};context.render();assert.equal(context.render.layers.builds,4,'new tasks cannot reuse old geometry');
context.canvas.width=1200;context.w=600;context.render();assert.equal(context.render.layers.builds,5);assert.equal(context.render.layers.room.width,1200);
context.w=0;context.render();assert.equal(context.render.layers.builds,5,'zero-size panels never draw empty sources');
console.log('Scene layer cache passed: 30 dynamic frames / one scene build, preserved light ordering and object picking, invalidation on view/layer/data/size changes.');
