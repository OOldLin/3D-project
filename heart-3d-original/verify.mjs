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
const meta=JSON.parse(await fs.readFile(path.join(root,'assets/original/model-manifest.json'),'utf8'));
const bytes=await fs.readFile(path.join(root,'assets/original',meta.runtime.file));
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
assert.equal(digest(bytes),meta.runtime.sha256);assert.equal(bytes.length,meta.runtime.bytes);
assert.equal(digest(await fs.readFile(path.join(root,meta.generator.file))),meta.generator.sha256);
assert.equal(meta.creation,'independent-parametric-v1');assert.equal(meta.medicalReview.status,'pending');assert.equal(meta.units.source,'arbitrary');
assert.equal(structures.length,56);assert.equal(new Set(structures.map(s=>s.id)).size,structures.length);
assert.equal(structures.filter(s=>s.kind==='valve').length,15);
assert.equal(structures.filter(s=>s.id.endsWith('-leaflet')).length,11);
assert.equal(structures.filter(s=>s.kind==='papillary').length,5);assert.equal(structures.filter(s=>s.kind==='chord').length,5);
assert(structures.every(s=>s.sourceIds.length===0&&s.review==='pending'));
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const meshes=new Map(),centers=new Map();let triangles=0,degenerate=0;
const A=new THREE.Vector3(),B=new THREE.Vector3(),C=new THREE.Vector3();
gltf.scene.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const id=mesh.userData.structureId||mesh.name;assert(byId[id]&&!meshes.has(id));
  const pos=mesh.geometry.getAttribute('position'),normal=mesh.geometry.getAttribute('normal'),color=mesh.geometry.getAttribute('color'),indices=mesh.geometry.index;
  assert(pos.count>0&&normal.count===pos.count&&color.count===pos.count);
  for(const value of pos.array)assert(Number.isFinite(value));for(const value of normal.array)assert(Number.isFinite(value));
  for(const index of indices.array)assert(index>=0&&index<pos.count);
  for(let i=0;i<indices.count;i+=3){A.fromBufferAttribute(pos,indices.array[i]);B.fromBufferAttribute(pos,indices.array[i+1]);C.fromBufferAttribute(pos,indices.array[i+2]);if(B.sub(A).cross(C.sub(A)).lengthSq()<=1e-18)degenerate++;}
  const count=indices.count/3;assert.equal(meta.structures.find(p=>p.id===id).triangles,count);triangles+=count;
  mesh.geometry.computeBoundingBox();meshes.set(id,mesh);centers.set(id,new THREE.Vector3());
});
assert.equal(degenerate,0);assert.deepEqual([...meshes.keys()].sort(),structures.map(s=>s.id).sort());
// 使用实际加载后的几何居中方式检查拆分与相机，而非手工预设尺寸。
const center=new THREE.Box3().setFromObject(gltf.scene).getCenter(new THREE.Vector3());
for(const mesh of meshes.values())mesh.position.sub(center);
const homes=new Map([...meshes].map(([id,m])=>[id,m.position.clone()]));
rememberHomes(meshes,byId);
for(const amount of [0,.25,1,.6,0,1,0]){
  const points=applyExplosion(meshes,centers,amount);assert.equal(points.length,structures.length*8);
  for(const [id,mesh]of meshes){assert(mesh.position.distanceTo(homes.get(id).clone().addScaledVector(mesh.userData.explosionOffset,amount))<1e-10);const anchor=mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrix);assert(anchor.distanceTo(centers.get(id))<1e-10);}
}
for(const [id,mesh]of meshes)assert.deepEqual(mesh.position.toArray(),homes.get(id).toArray());
for(const target of [1,.5,0]){let value=target?0:1;for(let i=0;i<180;i++){const next=nextExplosion(value,target,1/60);assert(next>=Math.min(value,target)&&next<=Math.max(value,target));value=next;}assert.equal(value,target);}
assert.equal(nextExplosion(0,1,0,true),1);
const initialPoints=applyExplosion(meshes,centers,0);
for(const axis of ['coronal','sagittal','transverse','oblique']){
  const settings={axis,position:0,yaw:43,pitch:27,flip:false};let plane=getClipPlane(settings,initialPoints);assert(initialPoints.every(p=>keptByClip(p,plane,true)));
  settings.position=100;plane=getClipPlane(settings,initialPoints);assert(initialPoints.every(p=>!keptByClip(p,plane,true)));
  settings.position=50;plane=getClipPlane(settings,initialPoints);const count=initialPoints.filter(p=>keptByClip(p,plane,true)).length;assert(count>0&&count<initialPoints.length);
  const flipped=getClipPlane({...settings,flip:true},initialPoints);for(const p of initialPoints)assert(Math.abs(plane.distanceToPoint(p)+flipped.distanceToPoint(p))<1e-10);
}
let frameCases=0;
for(const amount of [0,1])for(const dirArray of Object.values(viewDirections))for(const [width,height]of [[320,515],[736,660],[1280,730]]){
  const points=applyExplosion(meshes,centers,amount),dir=new THREE.Vector3(...dirArray).normalize(),camera=new THREE.PerspectiveCamera(32,width/height,.05,500);
  camera.position.copy(dir).multiplyScalar(fitDistance(points,dir,camera.fov,camera.aspect));camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  for(const point of points){const p=point.clone().project(camera);assert(Math.abs(p.x)<.9&&Math.abs(p.y)<.9&&p.z> -1&&p.z<1);}
  frameCases++;
}
applyExplosion(meshes,centers,0);
const state={selected:null,hidden:[],interior:false,isolated:false,mode:'intact',explode:0};
assert(!partVisible('left-ventricle',state));chooseStructure(state,'mitral-valve-anterior-leaflet');assert(state.interior&&!partVisible('left-ventricular-wall',state)&&!partVisible('right-atrium',state));
chooseStructure(state,'left-ventricular-wall');assert(!state.interior);chooseStructure(state,'left-ventricle');assert(state.interior&&partVisible('left-ventricle',state));
state.isolated=true;assert.equal(structures.filter(s=>partVisible(s.id,state)).length,1);state.hidden=[state.selected];assert.equal(structures.filter(s=>partVisible(s.id,state)).length,0);
assert(matchesSearch(byId['left-ventricular-wall'],'LV'));assert(matchesSearch(byId['mitral-valve-anterior-leaflet'],'二尖瓣'));assert(matchesSearch(byId['right-coronary'],'RCA'));
assert(renderPixelRatio(900,650,'high',1)>=2);assert(renderPixelRatio(3000,2000,'high',3)**2*3000*2000<=7000001);
const observation={schema:2,modelVersion:meta.runtime.sha256,name:'原创模型切面',savedAt:'2026-10-26',state:{mode:'cut',explode:0,selected:'left-ventricle',hidden:['right-atrium'],isolated:false,interior:true,profile:'natural',quality:'high',opacity:28,labels:true,view:'front',clip:{axis:'oblique',position:35,yaw:43,pitch:27,flip:true,helper:true}},camera:{position:[0,0,8],target:[0,0,0]}};
assert.deepEqual(validateObservation(JSON.parse(JSON.stringify(observation)),structures.map(s=>s.id),meta.runtime.sha256),observation);
for(const change of [v=>v.modelVersion='old-bodyparts-model',v=>v.camera.position=[NaN,0,0],v=>v.state.hidden=['missing'],v=>v.state.clip.pitch=300,v=>v.state.explode=1,v=>v.state.opacity=-10]){const invalid=structuredClone(observation);change(invalid);assert.throws(()=>validateObservation(invalid,structures.map(s=>s.id),meta.runtime.sha256));}
const html=await fs.readFile(path.join(root,'index.html'),'utf8');
const embedded=html.match(/<script id="heart-model" type="application\/octet-stream">([A-Za-z0-9+/=]+)<\/script>/);assert(embedded);assert.equal(digest(Buffer.from(embedded[1],'base64')),meta.runtime.sha256);assert(!/<script[^>]+src\s*=/i.test(html));assert(html.includes('Permission is hereby granted'));assert(!html.includes('CC BY-SA'));assert(!html.includes('FJ2428'));assert(!html.includes('lifesciencedb.jp'));
const markup=html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi,'$1</script>');const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
const app=await fs.readFile(path.join(root,'src/app.js'),'utf8');for(const m of app.matchAll(/\$\('([^']+)'\)/g))assert(ids.includes(m[1]),`页面缺少 ${m[1]}`);
assert(!app.includes('lifesciencedb.jp'));assert(!app.includes('下腔静脉人工截短'));assert(app.includes('heart-original-observations-v1'));
const webHtml=await fs.readFile(path.join(root,'web/index.html'),'utf8');assert(webHtml.includes('data-src="./assets/heart-original.glb"'));assert.equal(digest(await fs.readFile(path.join(root,'web/assets/heart-original.glb'))),meta.runtime.sha256);
const report={passed:true,checkedAt:new Date().toISOString(),structures:meshes.size,triangles,zeroAreaTriangles:degenerate,modelSha256:meta.runtime.sha256,generatorSha256:meta.generator.sha256,framingCases:frameCases,checks:['实际 GLTFLoader 解析所有 56 个结构','模型与生成器哈希','顶点法线与颜色有限、索引范围和零面积面','11 瓣叶、4 瓣环、5 乳头肌及5束腱索','拆分往返、复原和标签锚点','四种切面及反向半空间','36组完整/拆分取景','腔壁隐藏、腔体默认隐藏、单独显示','结构检索与像素预算','观察记录往返与无效数据拒绝','单文件与独立资源一致性','页面 ID 和第三方库许可','运行页面无旧模型编号、链接和许可声明'],browserQA:'not_completed_tool_startup_failure',medicalReview:'pending',limitations:['参数形态与比例未医学审核','血管交界未全部贯通','腱索附着、瓣叶方位和冠状路径为近似','无临床单位标定']};
await fs.writeFile(path.join(root,'docs/verification-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
