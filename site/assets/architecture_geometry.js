(function(root){
  const cache=new WeakMap(),planes=new WeakMap(),scenes=new WeakMap(),rings=new WeakMap();
  const sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  function boundsMayHit(o,d,bounds,limit){
    let near=0,far=limit;
    for(let i=0;i<3;i++){
      if(Math.abs(d[i])<1e-12){if(o[i]<bounds[0][i]||o[i]>bounds[1][i])return false;continue}
      let a=(bounds[0][i]-o[i])/d[i],b=(bounds[1][i]-o[i])/d[i];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return false;
    }
    return far>.015;
  }
  function triangleHit(o,d,triangle,limit){
    const a=triangle.a,e1=triangle.e1,e2=triangle.e2;
    const px=d[1]*e2[2]-d[2]*e2[1],py=d[2]*e2[0]-d[0]*e2[2],pz=d[0]*e2[1]-d[1]*e2[0],det=e1[0]*px+e1[1]*py+e1[2]*pz;if(Math.abs(det)<1e-10)return null;
    const inv=1/det,sx=o[0]-a[0],sy=o[1]-a[1],sz=o[2]-a[2],u=(sx*px+sy*py+sz*pz)*inv;if(u < -1e-8||u>1+1e-8)return null;
    const qx=sy*e1[2]-sz*e1[1],qy=sz*e1[0]-sx*e1[2],qz=sx*e1[1]-sy*e1[0],v=(d[0]*qx+d[1]*qy+d[2]*qz)*inv;if(v < -1e-8||u+v>1+1e-8)return null;
    const t=(e2[0]*qx+e2[1]*qy+e2[2]*qz)*inv;return t>.015&&t<limit?t:null;
  }
  function tree(records){
    const bbox=[Array(3).fill(Infinity),Array(3).fill(-Infinity)];
    for(const triangle of records)for(let i=0;i<3;i++){bbox[0][i]=Math.min(bbox[0][i],triangle.bbox[0][i]);bbox[1][i]=Math.max(bbox[1][i],triangle.bbox[1][i])}
    if(records.length<=12)return {bbox,triangles:records};
    const lengths=sub(bbox[1],bbox[0]),axis=lengths.indexOf(Math.max(...lengths));records.sort((a,b)=>a.center[axis]-b.center[axis]);const middle=Math.floor(records.length/2);
    return {bbox,left:tree(records.slice(0,middle)),right:tree(records.slice(middle))};
  }
  function bvh(surface){
    if(!cache.has(surface)){
      const records=surface.triangles.map(face=>{const [a,b,c]=face.map(i=>surface.vertices[i]),bbox=[a.map((_,i)=>Math.min(a[i],b[i],c[i])),a.map((_,i)=>Math.max(a[i],b[i],c[i]))];return {a,e1:sub(b,a),e2:sub(c,a),plane:planeKey(a,b,c),bbox,center:a.map((_,i)=>(bbox[0][i]+bbox[1][i])/2)}});
      cache.set(surface,records.length?tree(records):null);
    }
    return cache.get(surface);
  }
  function raySurfaceHit(origin,direction,surface,limit){
    if(!boundsMayHit(origin,direction,surface.bbox,limit))return null;
    const root=bvh(surface);if(!root)return null;let nearest=limit,hit=null,stack=[root];
    while(stack.length){const node=stack.pop();if(!boundsMayHit(origin,direction,node.bbox,nearest))continue;
      if(node.triangles)for(const triangle of node.triangles){const t=triangleHit(origin,direction,triangle,nearest);if(t!==null){nearest=t;hit={distance:t,plane:triangle.plane}}}
      else stack.push(node.left,node.right);
    }
    return hit;
  }
  function raySurface(origin,direction,surface,limit){return raySurfaceHit(origin,direction,surface,limit)?.distance??null}
  function sceneTree(surfaces){
    if(!scenes.has(surfaces)){
      const records=[];for(const surface of surfaces)for(const face of surface.triangles){const [a,b,c]=face.map(i=>surface.vertices[i]),bbox=[a.map((_,i)=>Math.min(a[i],b[i],c[i])),a.map((_,i)=>Math.max(a[i],b[i],c[i]))];records.push({a,e1:sub(b,a),e2:sub(c,a),plane:planeKey(a,b,c),wallName:surface.name,bbox,center:a.map((_,i)=>(bbox[0][i]+bbox[1][i])/2)})}
      scenes.set(surfaces,{root:records.length?tree(records):null,names:new Set(surfaces.map(s=>s.name)),fallbacks:new WeakMap()});
    }return scenes.get(surfaces);
  }
  function missingWalls(surfaces,prisms){const scene=sceneTree(surfaces);if(!scene.fallbacks.has(prisms))scene.fallbacks.set(prisms,prisms.filter(p=>!scene.names.has(p.name)));return scene.fallbacks.get(prisms)}
  function raySceneHit(origin,direction,surfaces,limit){
    const root=sceneTree(surfaces).root;if(!root)return null;let nearest=limit,hit=null,stack=[root];
    while(stack.length){const node=stack.pop();if(!boundsMayHit(origin,direction,node.bbox,nearest))continue;
      if(node.triangles)for(const triangle of node.triangles){const t=triangleHit(origin,direction,triangle,nearest);if(t!==null){nearest=t;hit={distance:t,plane:triangle.plane,wallName:triangle.wallName}}}else{
        const centerDistance=child=>{let value=0;for(let i=0;i<3;i++){const v=(child.bbox[0][i]+child.bbox[1][i])/2-origin[i];value+=v*v}return value};
        if(centerDistance(node.left)<centerDistance(node.right))stack.push(node.right,node.left);else stack.push(node.left,node.right);
      }
    }return hit;
  }
  function pointInRing(point,ring){
    if(!rings.has(ring)){
      const minimum=Math.min(...ring.map(p=>p[1])),maximum=Math.max(...ring.map(p=>p[1])),bins=Array.from({length:128},()=>[]),step=(maximum-minimum)/128||1;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const a=ring[j],b=ring[i];if(a[1]===b[1])continue;const first=Math.max(0,Math.min(127,Math.floor((Math.min(a[1],b[1])-minimum)/step))),last=Math.max(0,Math.min(127,Math.floor((Math.max(a[1],b[1])-minimum)/step)));
        for(let bin=first;bin<=last;bin++)bins[bin].push([a,b]);
      }rings.set(ring,{minimum,maximum,step,bins});
    }
    const prepared=rings.get(ring);if(point[1]<prepared.minimum||point[1]>prepared.maximum)return false;let inside=false;
    const bin=Math.max(0,Math.min(127,Math.floor((point[1]-prepared.minimum)/prepared.step)));
    for(const [a,b] of prepared.bins[bin])if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;return inside;
  }
  function planeKey(a,b,c){let normal=cross(sub(b,a),sub(c,a)),length=Math.hypot(...normal);if(length<1e-12)return 'degenerate';normal=normal.map(v=>v/length);if(normal.find(v=>Math.abs(v)>1e-6)<0)normal=normal.map(v=>-v);return [...normal,dot(normal,a)].map(v=>Math.round(v*10000)).join(',')}
  function receiverKey(hit){return hit?.type==='ground'?'ground':hit?.type==='wall'?`${hit.key}|${hit.plane||'proxy'}`:null}
  function planeTriangles(surface,key){
    if(!planes.has(surface)){const groups=new Map();for(const face of surface.triangles){const points=face.map(i=>surface.vertices[i]),k=planeKey(...points);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(points)}planes.set(surface,groups)}return planes.get(surface).get(key)||[];
  }
  function clipDisk(polygon){
    for(let edge=0;edge<64&&polygon.length;edge++){
      const angle=(edge+.5)*Math.PI/32,n=[Math.cos(angle),Math.sin(angle)],limit=Math.cos(Math.PI/64),next=[];
      for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=limit-dot2(n,a),db=limit-dot2(n,b);if(da>=-1e-10)next.push(a);if((da<0)!==(db<0)){const t=da/(da-db);next.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])])}}polygon=next;
    }return polygon;
  }
  const dot2=(a,b)=>a[0]*b[0]+a[1]*b[1];
  function projectionPatches(cast,columns=24,rows=16,maxDepth=4){
    const cached=new Map(),groups=new Map();let rayCount=0;
    const sample=p=>{const key=p.map(v=>v.toFixed(8)).join(',');if(!cached.has(key)){cached.set(key,cast(p[0],p[1]));rayCount++}return cached.get(key)};
    const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
    function triangle(points,depth){
      const hits=points.map(sample),center=points[0].map((_,i)=>(points[0][i]+points[1][i]+points[2][i])/3),ch=sample(center),key=receiverKey(ch),keys=hits.map(receiverKey);
      if(key&&keys.every(k=>k===key)){
        const [a,b,c]=hits.map(h=>h.point);if(Math.hypot(...cross(sub(b,a),sub(c,a)))<1e-11)return;
        if(!groups.has(key))groups.set(key,{key,type:ch.type,wallName:ch.wallName,plane:ch.plane,triangles:[]});groups.get(key).triangles.push(hits.map(h=>h.point));return;
      }
      if(depth>=maxDepth||(!key&&keys.every(k=>!k)))return;
      const [a,b,c]=points,ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);for(const child of [[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]])triangle(child,depth+1);
    }
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
      const a=[x*2/columns-1,y*2/rows-1],b=[(x+1)*2/columns-1,y*2/rows-1],c=[b[0],(y+1)*2/rows-1],d=[a[0],c[1]],polygon=clipDisk([a,b,c,d]);
      for(let i=1;i<polygon.length-1;i++)triangle([polygon[0],polygon[i],polygon[i+1]],0);
    }
    return {groups:[...groups.values()],rayCount};
  }
  function clipNearPlane(points,eye,forward,near=.05){
    const output=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],da=dot(sub(a,eye),forward)-near,db=dot(sub(b,eye),forward)-near;if(da>=0)output.push(a);if((da<0)!==(db<0)){const t=da/(da-db);output.push(a.map((v,j)=>v+t*(b[j]-v)))}}return output;
  }
  const api={raySurface,raySurfaceHit,raySceneHit,missingWalls,pointInRing,boundsMayHit,planeKey,planeTriangles,projectionPatches,clipNearPlane};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ArchitectureGeometry=api;
})(typeof globalThis!=='undefined'?globalThis:this);
