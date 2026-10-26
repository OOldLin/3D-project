import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {structures,byId,partVisible,chooseStructure,matchesSearch} from './src/anatomy.js';
import {rememberHomes,applyExplosion,nextExplosion} from './src/explosion.js';
import {fitDistance,getClipPlane,keptByClip,renderPixelRatio,viewDirections,validateObservation} from './src/viewer-tools.js';

const root=path.dirname(fileURLToPath(import.meta.url));
const asset=path.join(root,'assets/professional');
const meta=JSON.parse(await fs.readFile(path.join(asset,'model-manifest.json'),'utf8'));
const sourceMap=JSON.parse(await fs.readFile(path.join(asset,'source-map.json'),'utf8'));
const bytes=await fs.readFile(path.join(asset,meta.runtime.file));
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
assert.equal(digest(bytes),meta.runtime.sha256);assert.equal(bytes.length,meta.runtime.bytes);
assert.equal(meta.medicalReview.status,'pending');assert.equal(meta.units.source,'mm');assert.equal(meta.units.displayUnitToMm,50);
assert.equal(structures.length,32);assert.equal(structures.filter(s=>s.kind==='valve').length,11);assert.equal(structures.filter(s=>s.kind==='papillary').length,5);
assert.equal(sourceMap.files.length,84);
for(const file of sourceMap.files){const raw=await fs.readFile(path.join(asset,file.path));assert.equal(digest(raw),file.sha256,`源文件变化：${file.fj}`);assert(file.mirrorPointerDigestMatchesOfficial,`缺少独立哈希核对：${file.fj}`);}
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const meshes=new Map(),centers=new Map(),homes=new Map();let triangles=0;
gltf.scene.traverse(mesh=>{if(!mesh.isMesh)return;const id=mesh.userData.structureId||mesh.name;assert(byId[id]&&!meshes.has(id));const position=mesh.geometry.getAttribute('position'),normal=mesh.geometry.getAttribute('normal'),indices=mesh.geometry.index;assert(position.count>0&&normal.count===position.count);for(const value of position.array)assert(Number.isFinite(value));for(const value of normal.array)assert(Number.isFinite(value));for(const index of indices.array)assert(index>=0&&index<position.count);triangles+=indices.count/3;meshes.set(id,mesh);centers.set(id,new THREE.Vector3());homes.set(id,mesh.position.clone());});
assert.deepEqual([...meshes.keys()].sort(),structures.map(s=>s.id).sort());assert.equal(triangles,meta.structures.reduce((sum,item)=>sum+item.triangles,0));
const ivc=meta.structures.find(item=>item.id==='inferior-vena-cava-upper-source');assert(ivc.boundsMm.min[2]>=1150-1e-8);assert(meta.modifications.some(text=>text.includes('1150')));
rememberHomes(meshes,byId);
let points=applyExplosion(meshes,centers,0);
for(const amount of [0,.25,1,.6,0,1,0]){
  points=applyExplosion(meshes,centers,amount);assert.equal(points.length,structures.length*8);
  for(const [id,mesh]of meshes){const expected=homes.get(id).clone().addScaledVector(mesh.userData.explosionOffset,amount);assert(mesh.position.distanceTo(expected)<1e-12);const anchor=mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrix);assert(anchor.distanceTo(centers.get(id))<1e-12);}
}
for(const [id,mesh]of meshes)assert.deepEqual(mesh.position.toArray(),homes.get(id).toArray());
for(const target of [1,.5,0]){let value=target?0:1;for(let i=0;i<180;i++){const next=nextExplosion(value,target,1/60);assert(next>=Math.min(value,target)&&next<=Math.max(value,target));value=next;}assert.equal(value,target);}
assert.equal(nextExplosion(0,1,0,true),1);

const initialPoints=applyExplosion(meshes,centers,0);
for(const axis of ['coronal','sagittal','transverse','oblique']){
  const settings={axis,position:0,yaw:43,pitch:27,flip:false};let plane=getClipPlane(settings,initialPoints);assert(initialPoints.every(point=>keptByClip(point,plane,true)));
  settings.position=100;plane=getClipPlane(settings,initialPoints);assert(initialPoints.every(point=>!keptByClip(point,plane,true)));
  settings.position=50;plane=getClipPlane(settings,initialPoints);const count=initialPoints.filter(point=>keptByClip(point,plane,true)).length;assert(count>0&&count<initialPoints.length);
  const flipped=getClipPlane({...settings,flip:true},initialPoints);for(const point of initialPoints)assert(Math.abs(plane.distanceToPoint(point)+flipped.distanceToPoint(point))<1e-10);
}

// 独立投影检查所有包围角点，覆盖完整、拆分和窄屏情况下的六个方向。
let frameCases=0;
for(const amount of [0,1]){const framedPoints=applyExplosion(meshes,centers,amount);for(const dirArray of Object.values(viewDirections))for(const [width,height]of [[320,515],[736,660],[1280,730]]){
  const dir=new THREE.Vector3(...dirArray).normalize(),camera=new THREE.PerspectiveCamera(32,width/height,.05,500);const distance=fitDistance(framedPoints,dir,camera.fov,camera.aspect);camera.position.copy(dir).multiplyScalar(distance);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);for(const point of framedPoints){const projected=point.clone().project(camera);assert(Math.abs(projected.x)<.9&&Math.abs(projected.y)<.9&&projected.z> -1&&projected.z<1,`取景裁掉部件：${amount}/${dirArray}/${width}`);}frameCases++;
}}
applyExplosion(meshes,centers,0);
const state={selected:null,hidden:[],interior:false,isolated:false,mode:'intact',explode:0};chooseStructure(state,'left-ventricle');assert(state.interior&&!partVisible('ventricular-wall',state));state.mode='exploded';state.explode=1;state.interior=false;chooseStructure(state,'right-ventricle');assert(!state.interior);state.isolated=true;assert.equal(structures.filter(s=>partVisible(s.id,state)).length,1);state.hidden=[state.selected];assert.equal(structures.filter(s=>partVisible(s.id,state)).length,0);
assert(matchesSearch(byId['left-ventricle'],'LV'));assert(matchesSearch(byId['mitral-valve-anterior-leaflet'],'MV'));assert(matchesSearch(byId['mitral-valve-anterior-leaflet'],'FJ2420'));assert(matchesSearch(byId['left-superior-pulmonary-vein'],'LSPV'));
assert(renderPixelRatio(900,650,'high',1)>=2);assert(renderPixelRatio(3000,2000,'high',3)**2*3000*2000<=7000001);

const observation={schema:2,modelVersion:meta.runtime.sha256,name:'剖切观察',savedAt:new Date().toISOString(),state:{mode:'cut',explode:0,selected:'left-ventricle',hidden:['ventricular-wall'],isolated:false,interior:false,profile:'natural',quality:'high',opacity:28,labels:true,view:'front',clip:{axis:'oblique',position:35,yaw:43,pitch:27,flip:true,helper:true}},camera:{position:[0,0,8],target:[0,0,0]}};
const restored=validateObservation(JSON.parse(JSON.stringify(observation)),structures.map(s=>s.id),meta.runtime.sha256);assert.deepEqual(restored,observation);
for(const mutation of [value=>value.modelVersion='different',value=>value.camera.position=[NaN,0,0],value=>value.state.hidden=['missing'],value=>value.state.clip.pitch=300,value=>value.state.explode=1,value=>value.state.opacity=-10]){const invalid=structuredClone(observation);mutation(invalid);assert.throws(()=>validateObservation(invalid,structures.map(s=>s.id),meta.runtime.sha256));}

const html=await fs.readFile(path.join(root,'index.html'),'utf8');const embedded=html.match(/<script id="heart-model" type="application\/octet-stream">([A-Za-z0-9+/=]+)<\/script>/);assert(embedded);assert.equal(digest(Buffer.from(embedded[1],'base64')),meta.runtime.sha256);assert(!/<script[^>]+src\s*=/i.test(html));assert(html.includes('Permission is hereby granted'));assert(html.includes('CC BY-SA 2.1 Japan'));
const markup=html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi,'$1</script>');const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(new Set(ids).size,ids.length);
const app=await fs.readFile(path.join(root,'src/app.js'),'utf8');for(const match of app.matchAll(/\$\('([^']+)'\)/g))assert(ids.includes(match[1]),`缺少页面元素：${match[1]}`);
const webHtml=await fs.readFile(path.join(root,'web/index.html'),'utf8');assert(webHtml.includes('data-src="./assets/heart-4.3.glb"'));assert.equal(digest(await fs.readFile(path.join(root,'web/assets/heart-4.3.glb'))),meta.runtime.sha256);
const report={passed:true,checkedAt:new Date().toISOString(),structures:meshes.size,triangles,sourceObj:sourceMap.files.length,modelSha256:meta.runtime.sha256,framingCases:frameCases,checks:['84个官方源文件与交叉哈希','32个结构映射与有限网格','静态瓣叶与乳头肌覆盖','下腔静脉人工截断记录','拆分往返与标签锚点','剖切四方向及反向半空间','36组视角/完整与拆分取景','隐藏与单独查看状态','中文/英文/缩写/源编号检索','画质像素预算','观察记录序列化及无效数据拒绝','离线与独立资源网页一致性','页面元素ID及完整许可'],browserQA:'not_completed_tool_startup_failure',medicalReview:'pending'};
await fs.mkdir(path.join(root,'docs'),{recursive:true});await fs.writeFile(path.join(root,'docs/verification-report.json'),JSON.stringify(report,null,2),'utf8');console.log(JSON.stringify(report,null,2));
