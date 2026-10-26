import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// 所有控制点与曲面公式均在本文件定义；生成过程不读取已有心脏网格、影像或贴图。
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const asset = path.join(root, 'assets/original');
const TAU = Math.PI * 2;
const catalog = [], parts = [];
const V = p => new THREE.Vector3(...p);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const palette = {wall:'#a84d51',septum:'#bf6862',vessel:'#c36b63',vein:'#747eab',coronary:'#e1b38a',valve:'#e2cfb1',papillary:'#c78370',chord:'#eadbc4',cavity:'#859fbe',trabecula:'#b97163'};

function surface(n, m, fn, reverse=false) {
  const positions=[], indices=[];
  for(let i=0;i<=n;i++)for(let j=0;j<=m;j++)positions.push(...fn(i/n,j/m));
  for(let i=0;i<n;i++)for(let j=0;j<m;j++){
    const a=i*(m+1)+j,b=a+m+1,c=a+1,d=b+1;
    indices.push(...(reverse?[a,c,b,c,d,b]:[a,b,c,c,b,d]));
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setIndex(indices);geo.computeVertexNormals();return geo;
}

function join(geometries){
  const merged=mergeGeometries(geometries.map(g=>g.index?g.toNonIndexed():g),false);
  geometries.forEach(g=>g.dispose());return merged;
}

function add(id,name,english,kind,group,geometries,extra={}){
  const original=Array.isArray(geometries)?join(geometries):geometries;
  const geo=mergeVertices(original);original.dispose();
  const pos=geo.getAttribute('position');
  // 移除端面收束产生的零面积三角形，避免导入其他建模工具后出现无效面。
  const clean=[],ia=geo.index.array,A=new THREE.Vector3(),B=new THREE.Vector3(),C=new THREE.Vector3();
  for(let i=0;i<ia.length;i+=3){
    A.fromBufferAttribute(pos,ia[i]);B.fromBufferAttribute(pos,ia[i+1]);C.fromBufferAttribute(pos,ia[i+2]);
    if(B.sub(A).cross(C.sub(A)).lengthSq()>1e-18)clean.push(ia[i],ia[i+1],ia[i+2]);
  }
  geo.setIndex(clean);
  // 轻微颜色变化由位置公式生成，只用于材质层次，不声称表达组织纤维走向。
  const colors=[];
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const q=kind==='wall'||kind==='septum'? .94+.045*Math.sin(25*y+9*x+4*z)+.018*Math.sin(71*x+39*z):1;
    colors.push(q,q,q);
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeBoundingBox();
  const item={id,name,english,kind,group,en:group,color:palette[kind]||palette.vessel,review:'pending',sourceName:'独立参数曲面生成',sourceIds:[],abbreviation:'',description:`${name}的独立参数几何示意。`,note:'形态、比例与相邻连接尚待医学复核；不用于患者诊断或临床测量。',...extra};
  catalog.push(item);parts.push({item,geo});return item;
}

// 观察坐标：+X 为人体左，+Y 为上，+Z 为前；采用任意展示单位，无毫米标定。
function ventPoint(t,a,inner=false,thickness=.18){
  const s=Math.sin(t*Math.PI*.59),r=.045+1.15*Math.pow(s,.84);
  const shift=.60*(1-t)-.05*t,twist=.16*(1-t),angle=a+twist;
  const groove=1-.023*Math.exp(-Math.pow((a-Math.PI*.32)/.065,2))-.02*Math.exp(-Math.pow((a-Math.PI*1.04)/.065,2));
  const rx=Math.max(.025,r*groove-(inner?thickness*Math.min(1,t*6):0));
  const rz=Math.max(.025,r*.72-(inner?thickness*Math.min(1,t*6):0));
  return [shift+rx*Math.cos(angle),-1.95+2.52*t,-.06+.09*t+rz*Math.sin(angle)];
}
const aRV=Math.PI*.32,bRV=Math.PI*1.04;
function wallShell(start,end,thick){
  const p=(u,v,inner)=>ventPoint(.018+.982*u,start+(end-start)*v,inner,thick);
  return join([
    surface(76,112,(u,v)=>p(u,v,false)),surface(76,112,(u,v)=>p(u,v,true),true),
    ...[0,1].map(u=>surface(1,112,(s,v)=>V(p(u,v,false)).lerp(V(p(u,v,true)),s).toArray(),u===1)),
    ...[0,1].map(v=>surface(76,1,(u,s)=>V(p(u,v,false)).lerp(V(p(u,v,true)),s).toArray(),v===0))
  ]);
}
add('left-ventricular-wall','左心室游离壁','Left ventricular free wall','wall','心肌与间隔',wallShell(bRV,aRV+TAU,.22),{abbreviation:'LV wall',interiorWall:true,explodeOffset:[1.65,-.35,-.65],description:'左心室游离壁采用较厚的双层曲面示意，与右心室游离壁分别建模。'});
add('right-ventricular-wall','右心室游离壁','Right ventricular free wall','wall','心肌与间隔',wallShell(aRV,bRV,.095),{abbreviation:'RV wall',interiorWall:true,explodeOffset:[-1.7,-.1,1.2],description:'位于较前方的右心室游离壁，采用较薄的双层曲面示意。'});

function septPoint(u,v,side){
  const t=.04+.96*u,A=V(ventPoint(t,aRV,true,.15)),B=V(ventPoint(t,bRV,true,.15));
  const p=A.lerp(B,v);p.z-=.12*Math.sin(v*Math.PI)*Math.sin(u*Math.PI);p.z+=side*.065;return p.toArray();
}
add('interventricular-septum','室间隔（简化）','Interventricular septum','septum','心肌与间隔',[
  surface(64,36,(u,v)=>septPoint(u,v,1)),surface(64,36,(u,v)=>septPoint(u,v,-1),true),
  ...[0,1].map(u=>surface(1,36,(s,v)=>V(septPoint(u,v,-1)).lerp(V(septPoint(u,v,1)),s).toArray())),
  ...[0,1].map(v=>surface(64,1,(u,s)=>V(septPoint(u,v,-1)).lerp(V(septPoint(u,v,1)),s).toArray()))
],{explodeOffset:[0,-.35,-1.8],description:'分隔左右心室的独立曲面示意；未细分肌部与膜部，厚度未按真实测量标定。'});

function ellipsoid(center,size,rotation=[0,0,0],u0=0,u1=1){
  const matrix=new THREE.Matrix4().compose(V(center),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),V(size));
  const geo=surface(46,72,(u,v)=>{
    const polar=.001+(Math.PI-.002)*(u0+(u1-u0)*u),angle=TAU*v;
    const ripple=1+.012*Math.sin(angle*5)*Math.pow(Math.sin(polar),3);
    return [ripple*Math.sin(polar)*Math.cos(angle),Math.cos(polar),ripple*Math.sin(polar)*Math.sin(angle)];
  },true);geo.applyMatrix4(matrix);return geo;
}
function atrium(center,size){
  // 房室交界处保留底部开口；血管接入口暂采用相交曲面，未作布尔贯通。
  const outer=ellipsoid(center,size,[0,0,.12],0,.80);
  const inner=ellipsoid(center,size.map(s=>s-.075),[0,0,.12],0,.80);
  const ind=inner.index.array;for(let k=0;k<ind.length;k+=3)[ind[k+1],ind[k+2]]=[ind[k+2],ind[k+1]];inner.computeVertexNormals();
  const edge=(v,inside)=>{const polar=.001+(Math.PI-.002)*.8,a=TAU*v;const s=inside?size.map(q=>q-.075):size;return V([Math.sin(polar)*Math.cos(a)*s[0],Math.cos(polar)*s[1],Math.sin(polar)*Math.sin(a)*s[2]]).applyEuler(new THREE.Euler(0,0,.12)).add(V(center));};
  return join([outer,inner,surface(1,72,(u,v)=>edge(v,false).lerp(edge(v,true),u).toArray())]);
}
add('right-atrium','右心房壁','Right atrial wall','wall','心房与心耳',atrium([-.85,.91,-.04],[.60,.65,.60]),{abbreviation:'RA',interiorWall:true,explodeOffset:[-1.8,1,-.3],note:'底部开口；腔静脉接入口未作布尔贯通。房壁细节与连接关系待医学审核。'});
add('left-atrium','左心房壁','Left atrial wall','wall','心房与心耳',atrium([.35,1.0,-.61],[.68,.53,.49]),{abbreviation:'LA',interiorWall:true,explodeOffset:[1.7,1,-1],note:'位于较后方；肺静脉接入口未作布尔贯通。'});
add('right-auricle','右心耳（简化）','Right atrial appendage','wall','心房与心耳',ellipsoid([-.65,1.09,.54],[.38,.23,.26],[0,0,-.45]),{explodeOffset:[-2.2,.5,1.2]});
add('left-auricle','左心耳（简化）','Left atrial appendage','wall','心房与心耳',ellipsoid([.83,1.07,.20],[.39,.17,.21],[.2,-.25,.55]),{explodeOffset:[2.2,.5,.8]});
add('interatrial-septum','房间隔（简化）','Interatrial septum','septum','心肌与间隔',ellipsoid([-.23,.98,-.40],[.075,.40,.33],[0,.1,-.12]),{explodeOffset:[0,1,-1.9],note:'仅示意房间分隔位置，未细分卵圆窝等局部结构。'});

function tube(points,radius,segments=72,sides=24,hollow=true,taper=1){
  const curve=new THREE.CatmullRomCurve3(points.map(V),false,'centripetal');
  const frames=curve.computeFrenetFrames(segments,false);
  const p=(u,v,inside)=>{
    const i=Math.round(u*segments),a=v*TAU,r=radius*(1+(taper-1)*u)*(inside?.82:1);
    return curve.getPointAt(u).addScaledVector(frames.normals[i],Math.cos(a)*r).addScaledVector(frames.binormals[i],Math.sin(a)*r).toArray();
  };
  const meshes=[surface(segments,sides,(u,v)=>p(u,v,false),true)];
  if(hollow)meshes.push(surface(segments,sides,(u,v)=>p(u,v,true)));
  for(const u of [0,1])meshes.push(surface(1,sides,(s,v)=>hollow?V(p(u,v,false)).lerp(V(p(u,v,true)),s).toArray():V(p(u,v,false)).lerp(curve.getPointAt(u),s).toArray(),u===1));
  return join(meshes);
}
const vessel=(id,n,e,p,r,extra={})=>add(id,n,e,'vessel','大血管',tube(p,r,84,36,true),extra);
vessel('ascending-aorta','升主动脉','Ascending aorta',[[.16,.53,-.03],[.20,1.08,-.08],[.16,1.72,-.14]],.225,{abbreviation:'AAo',explodeOffset:[.3,1.9,-.4]});
vessel('aortic-arch','主动脉弓','Aortic arch',[[.16,1.72,-.14],[.28,2.18,-.18],[.72,2.33,-.38],[1.12,2.02,-.65],[1.14,1.64,-.74]],.225,{explodeOffset:[1.3,2.2,-.6]});
vessel('descending-aorta','降主动脉近段','Proximal descending aorta',[[1.14,1.64,-.74],[1.13,1,-.81],[1.08,.20,-.85]],.20,{explodeOffset:[2,.7,-1.3]});
for(const [id,n,e,p,r]of [
  ['brachiocephalic-trunk','头臂干近段','Brachiocephalic trunk',[[.27,2.04,-.16],[.06,2.47,-.13],[-.12,2.72,-.08]],.105],
  ['left-common-carotid','左颈总动脉近段','Left common carotid artery',[[.57,2.26,-.29],[.55,2.64,-.25],[.56,2.86,-.23]],.077],
  ['left-subclavian','左锁骨下动脉近段','Left subclavian artery',[[.88,2.2,-.48],[1.08,2.56,-.47],[1.35,2.65,-.49]],.085],
  ['pulmonary-trunk','肺动脉干','Pulmonary trunk',[[-.26,.47,.55],[-.34,.96,.68],[-.17,1.47,.55]],.23],
  ['left-pulmonary-artery','左肺动脉近段','Left pulmonary artery',[[-.17,1.47,.55],[.49,1.57,.32],[1.18,1.51,-.03],[1.56,1.47,-.23]],.15],
  ['right-pulmonary-artery','右肺动脉近段','Right pulmonary artery',[[-.17,1.47,.55],[-.65,1.38,-.30],[-1.16,1.32,-.48],[-1.55,1.28,-.48]],.15],
  ['superior-vena-cava','上腔静脉','Superior vena cava',[[-1.01,1.11,-.17],[-1.04,1.68,-.19],[-1.10,2.18,-.19]],.21],
  ['inferior-vena-cava','下腔静脉近段','Proximal inferior vena cava',[[-.98,.62,-.33],[-1.10,.20,-.39],[-1.12,-.17,-.48]],.22]
])vessel(id,n,e,p,r,{color:/vena/.test(id)?palette.vein:palette.vessel});
for(const [id,n,e,side,y]of [
  ['right-superior-pulmonary-vein','右上肺静脉近段','Right superior pulmonary vein',-1,1.19],['right-inferior-pulmonary-vein','右下肺静脉近段','Right inferior pulmonary vein',-1,.77],
  ['left-superior-pulmonary-vein','左上肺静脉近段','Left superior pulmonary vein',1,1.19],['left-inferior-pulmonary-vein','左下肺静脉近段','Left inferior pulmonary vein',1,.77]
])vessel(id,n,e,[[.35+side*.39,y,-.86],[.35+side*.76,y+.03,-1.01],[.35+side*1.12,y+.06,-1.13]],.115,{color:'#b67c84',note:'采用四支近段的常见结构示意，不代表全部肺静脉变异。'});

const valves=[
  {id:'mitral',name:'二尖瓣',en:'Mitral valve',center:[.43,.50,-.31],radius:.38,names:['前叶','后叶'],enNames:['anterior','posterior'],abbreviation:'MV'},
  {id:'tricuspid',name:'三尖瓣',en:'Tricuspid valve',center:[-.57,.46,.23],radius:.40,names:['前叶','后叶','隔叶'],enNames:['anterior','posterior','septal'],abbreviation:'TV'},
  {id:'aortic',name:'主动脉瓣',en:'Aortic valve',center:[.16,.59,-.03],radius:.196,names:['右冠瓣','左冠瓣','无冠瓣'],enNames:['right-coronary','left-coronary','non-coronary'],abbreviation:'AV'},
  {id:'pulmonary',name:'肺动脉瓣',en:'Pulmonary valve',center:[-.28,.64,.59],radius:.202,names:['前瓣','左瓣','右瓣'],enNames:['anterior','left','right'],abbreviation:'PV'}
];
function leaflet(valve,k){
  const n=valve.names.length,base=TAU*k/n+.12,span=TAU/n-.025;
  const f=(u,v,side)=>{
    const a=base+span*v,r=valve.radius*(1-u*.84);
    const sag=valve.id==='mitral'||valve.id==='tricuspid'?-.20:-.065;
    return [valve.center[0]+r*Math.cos(a),valve.center[1]+sag*Math.sin(u*Math.PI/2)+.025*Math.sin(v*Math.PI)*u+side*.008,valve.center[2]+r*Math.sin(a)];
  };
  return join([surface(22,32,(u,v)=>f(u,v,1)),surface(22,32,(u,v)=>f(u,v,-1),true),...([0,1].map(u=>surface(1,32,(s,v)=>V(f(u,v,-1)).lerp(V(f(u,v,1)),s).toArray()))),...([0,1].map(v=>surface(22,1,(u,s)=>V(f(u,v,-1)).lerp(V(f(u,v,1)),s).toArray())))]);
}
for(const valve of valves){
  const ring=Array.from({length:41},(_,i)=>[valve.center[0]+valve.radius*Math.cos(i/40*TAU),valve.center[1],valve.center[2]+valve.radius*Math.sin(i/40*TAU)]);
  add(`${valve.id}-annulus`,`${valve.name}瓣环（简化）`,`${valve.en} annulus`,'valve','瓣膜与瓣环',tube(ring,.026,100,10,false),{abbreviation:valve.abbreviation,explodeOffset:[valve.center[0]*4,2.4,valve.center[2]*4]});
  valve.names.forEach((name,k)=>add(`${valve.id}-valve-${valve.enNames[k]}-leaflet`,`${valve.name}${name}`,`${valve.en} ${valve.enNames[k]} leaflet`,'valve','瓣膜与瓣环',leaflet(valve,k),{abbreviation:valve.abbreviation,explodeOffset:[valve.center[0]*4+(k-1)*.45,1.8+k*.3,1.6+valve.center[2]*2],note:'瓣叶为静态曲面，命名、朝向、附着位置与闭合形态均待医学复核。'}));
}

const muscles=[
 ['lv-anterolateral-papillary','左心室前外侧乳头肌',[.82,-.65,-.12],[.65,-.15,-.19],'mitral'],
 ['lv-posteromedial-papillary','左心室后内侧乳头肌',[.12,-.72,-.48],[.27,-.19,-.40],'mitral'],
 ['rv-anterior-papillary','右心室前乳头肌',[-.45,-.65,.57],[-.51,-.13,.39],'tricuspid'],
 ['rv-posterior-papillary','右心室后乳头肌',[-.63,-.46,-.05],[-.67,-.05,.15],'tricuspid'],
 ['rv-septal-papillary','右心室隔侧乳头肌',[-.07,-.37,.28],[-.28,.04,.26],'tricuspid']
];
for(const [id,name,base,tip,vid]of muscles){
  add(id,name,id.replaceAll('-',' '),'papillary','乳头肌与腱索',tube([base,V(base).lerp(V(tip),.5).toArray(),tip],.10,30,18,false,.32),{note:'按常见分组制作的位置示意，数量、形状及附着变异尚未建模。'});
  const valve=valves.find(v=>v.id===vid),chords=[];
  for(let j=0;j<7;j++){
    const a=TAU*j/7+.23,anchor=[valve.center[0]+valve.radius*.35*Math.cos(a),valve.center[1]-.18,valve.center[2]+valve.radius*.35*Math.sin(a)];
    const middle=V(tip).lerp(V(anchor),.55);middle.x+=(j-3)*.006;
    chords.push(tube([tip,middle.toArray(),anchor],.008,18,6,false,.65));
  }
  add(`${id}-chordae`,`${name.replace('乳头肌','')}腱索束（示意）`,'Chordae tendineae bundle','chord','乳头肌与腱索',chords,{note:'每束七条连线为教学布置，未复现真实腱索的分支、数量及准确附着。'});
}

for(const [id,name,start,end]of [['rv-trabeculae','右心室肉柱（简化）',aRV+.1,bRV-.1],['lv-trabeculae','左心室肉柱（简化）',bRV+.2,aRV+TAU-.2]]){
  const ribs=[];for(let i=0;i<11;i++){
    const a=start+(end-start)*i/10,points=[];
    for(let j=0;j<5;j++){const t=.24+.54*j/4,p=ventPoint(t,a+.04*Math.sin(j),true,id.startsWith('rv')?.11:.235);points.push(p);}
    ribs.push(tube(points,.023,36,8,false,.65));
  }
  add(id,name,'Simplified ventricular trabeculae','trabecula','心室内部',ribs,{note:'稀疏条带仅表达内壁起伏，不代表真实肉柱网络。'});
}
function cavity(start,end,thickness){
  const geos=[surface(60,68,(u,v)=>ventPoint(.07+.90*u,start+(end-start)*v,true,thickness),true)];
  geos.push(surface(60,12,(u,v)=>V(ventPoint(.07+.9*u,start,true,thickness)).lerp(V(ventPoint(.07+.9*u,end,true,thickness)),v).toArray()));
  for(const t of [.07,.97])geos.push(surface(1,68,(u,v)=>{const p=V(ventPoint(t,start+(end-start)*v,true,thickness));const a=V(ventPoint(t,start,true,thickness)),b=V(ventPoint(t,end,true,thickness));return p.lerp(a.lerp(b,.5),u).toArray();}));
  return join(geos);
}
add('right-ventricle','右心室腔轮廓（示意）','Right ventricular cavity envelope','cavity','心腔轮廓',cavity(aRV,bRV,.13),{abbreviation:'RV',explodeOffset:[-.7,-1.6,1.7],note:'默认不显示。此曲面包络仅辅助定位，不是经影像分割的真实心腔体积。'});
add('left-ventricle','左心室腔轮廓（示意）','Left ventricular cavity envelope','cavity','心腔轮廓',cavity(bRV,aRV+TAU,.245),{abbreviation:'LV',color:'#d99483',explodeOffset:[.8,-1.6,-1],note:'默认不显示；不是可用于容积测量的医学分割。'});

// 冠状动脉按手工控制点与游离壁公式布置，只建立主要分支示意。
const LAD=[];for(let i=0;i<=12;i++){const t=.98-.86*i/12;const p=ventPoint(t,aRV+.015);p[2]+=.035;LAD.push(p);}
const RCA=[];for(let i=0;i<=12;i++){const a=.52+(Math.PI*1.08-.52)*i/12;const p=ventPoint(.98,a);p[1]+=.025;RCA.push(p);}
const LCX=[];for(let i=0;i<=12;i++){const a=.65-(Math.PI*1.12+.65)*i/12;const p=ventPoint(.99,a);p[1]+=.04;LCX.push(p);}
const branches=(parent,starts,sign)=>starts.map(i=>{const p=parent[i],ys=[p,[p[0]+sign*.18,p[1]-.17,p[2]-.035],[p[0]+sign*.29,p[1]-.42,p[2]-.12]];return tube(ys,.018,28,8,false,.35);});
add('left-coronary-main','左冠状动脉主干（示意）','Left main coronary artery','coronary','冠状动脉',tube([[.27,.73,.06],[.40,.66,.32],LAD[0]],.055,30,14,true),{note:'开口与分叉为近似布置，尚待医学复核。'});
add('left-anterior-descending','前室间支及小分支（示意）','Anterior interventricular artery','coronary','冠状动脉',[tube(LAD,.045,100,14,true,.35),...branches(LAD,[3,6,8],1)],{abbreviation:'LAD',explodeOffset:[1.8,-1.3,1.7]});
add('left-circumflex','左冠状动脉旋支（示意）','Left circumflex artery','coronary','冠状动脉',[tube(LCX,.042,100,14,true,.4),...branches(LCX,[4,8],1)],{abbreviation:'LCx',explodeOffset:[2,-1,-1]});
add('right-coronary','右冠状动脉（示意）','Right coronary artery','coronary','冠状动脉',[tube([[.06,.70,.04],[-.17,.64,.34],...RCA],.045,110,14,true,.4),...branches(RCA,[5,9],-1)],{abbreviation:'RCA',explodeOffset:[-2,-.8,.8]});

// 写入标准 glTF 二进制文件；仅依赖以上新生成的顶点数组。
const buffers=[],bufferViews=[],accessors=[],meshes=[],nodes=[],materials=[];let offset=0;
function accessor(array,type,componentType,target,min,max){
  const b=Buffer.from(array.buffer,array.byteOffset,array.byteLength),pad=(4-b.length%4)%4;
  const view=bufferViews.length;bufferViews.push({buffer:0,byteOffset:offset,byteLength:b.length,target});buffers.push(b,Buffer.alloc(pad));offset+=b.length+pad;
  const value={bufferView:view,componentType,count:array.length/({SCALAR:1,VEC3:3}[type]),type};if(min)value.min=min;if(max)value.max=max;accessors.push(value);return accessors.length-1;
}
for(const {item,geo}of parts){
  const p=geo.getAttribute('position').array,n=geo.getAttribute('normal').array,c=geo.getAttribute('color').array,b=geo.boundingBox;
  const attributes={POSITION:accessor(p,'VEC3',5126,34962,b.min.toArray(),b.max.toArray()),NORMAL:accessor(n,'VEC3',5126,34962),COLOR_0:accessor(c,'VEC3',5126,34962)};
  const color=new THREE.Color(item.color);materials.push({name:item.id,pbrMetallicRoughness:{baseColorFactor:[color.r,color.g,color.b,1],metallicFactor:0,roughnessFactor:.58},doubleSided:true});
  const indices=accessor(geo.index.array,'SCALAR',geo.index.array instanceof Uint16Array?5123:5125,34963);
  meshes.push({name:item.id,primitives:[{attributes,indices,material:materials.length-1,mode:4}]});nodes.push({name:item.id,mesh:meshes.length-1,extras:{structureId:item.id,creation:'independent-parametric-v1'}});
}
const gltf={asset:{version:'2.0',generator:'Independent parametric heart generator v1'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials,accessors,bufferViews,buffers:[{byteLength:offset}]};
let json=Buffer.from(JSON.stringify(gltf));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const bin=Buffer.concat(buffers);
const header=Buffer.alloc(12);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+bin.length,8);
const chunk=(b,t)=>{const h=Buffer.alloc(8);h.writeUInt32LE(b.length,0);h.writeUInt32LE(t,4);return Buffer.concat([h,b]);};
const model=Buffer.concat([header,chunk(json,0x4e4f534a),chunk(bin,0x004e4942)]);
await fs.mkdir(asset,{recursive:true});await fs.writeFile(path.join(asset,'heart-original.glb'),model);
await fs.writeFile(path.join(root,'src/catalog.json'),JSON.stringify(catalog,null,2));
const manifest={dataset:'独立参数心脏模型',version:'1.0',creation:'independent-parametric-v1',sourceStatus:'由项目脚本从几何公式与手工控制点生成；未读取第三方解剖网格',sourceUrl:'项目 scripts/generate-model.mjs',license:'项目自建模型；商用权利请结合创作记录及法律审查确认',licenseUrl:'',credit:'独立参数心脏模型 v1.0 · 本项目几何脚本生成 · 医学审核待完成',medicalReview:{status:'pending'},units:{source:'arbitrary',note:'任意展示单位，无毫米标定，不支持临床测量'},runtime:{file:'heart-original.glb',bytes:model.length,sha256:sha(model)},generator:{file:'scripts/generate-model.mjs',sha256:sha(await fs.readFile(fileURLToPath(import.meta.url)))},modifications:['全新定义腔壁、间隔、瓣叶、血管路径及表面材质参数','血管交界为相交曲面，未进行完整布尔贯通','腱索、肉柱与冠状分支为简化示意；未按患者影像或标本重建'],coverage:[{name:'心室游离壁与室间隔',status:'分别建模；比例待审'},{name:'心房、心耳与房间隔',status:'参数曲面；入口未贯通'},{name:'四组瓣膜',status:'11 瓣叶＋4 瓣环；静态示意'},{name:'乳头肌与腱索',status:'5 组乳头肌＋5 束腱索示意'},{name:'大血管与冠状动脉',status:'近段与主要分支；连接待审'},{name:'临床标定与患者特异性',status:'未提供'}],structures:parts.map(({item,geo})=>({id:item.id,name:item.name,triangles:geo.index.count/3,bounds:{min:geo.boundingBox.min.toArray(),max:geo.boundingBox.max.toArray()}}))};
await fs.writeFile(path.join(asset,'model-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({structures:parts.length,triangles:manifest.structures.reduce((s,p)=>s+p.triangles,0),bytes:model.length,sha256:manifest.runtime.sha256},null,2));
