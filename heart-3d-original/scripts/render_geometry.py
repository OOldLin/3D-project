"""对实际 GLB 网格作离线几何投影，不能当成网页渲染验收。"""
from pathlib import Path
import json, struct
import numpy as np
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
raw = (root/'assets/original/heart-original.glb').read_bytes()
length, = struct.unpack_from('<I',raw,12)
doc = json.loads(raw[20:20+length])
binary = memoryview(raw)[28+length:]
catalog = {s['id']:s for s in json.loads((root/'src/catalog.json').read_text(encoding='utf-8'))}
def attr(index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']]
    return np.frombuffer(binary,dtype=dtype,count=a['count']*(3 if a['type']=='VEC3' else 1),offset=v.get('byteOffset',0)).reshape(-1,3) if a['type']=='VEC3' else np.frombuffer(binary,dtype=dtype,count=a['count'],offset=v.get('byteOffset',0))
meshes=[]
for node in doc['nodes']:
    primitive=doc['meshes'][node['mesh']]['primitives'][0]
    meshes.append((node['name'],attr(primitive['attributes']['POSITION']),attr(primitive['attributes']['NORMAL']),attr(primitive['indices']).reshape(-1,3)))

font_path=r'C:\Windows\Fonts\msyh.ttc'
title_font=ImageFont.truetype(font_path,26)
small_font=ImageFont.truetype(font_path,17)
canvas=Image.new('RGB',(1440,1600),'#101a28');draw=ImageDraw.Draw(canvas)
draw.text((38,25),'独立参数心脏 · 实际 GLB 几何投影',font=title_font,fill='#f0d6c0')
draw.text((38,67),'本图由离线几何投影生成，非浏览器截图；结构与比例待医学审核。',font=small_font,fill='#a9b9ca')
views=[('前面观',[0,0,1],False,False),('后面观',[0,0,-1],False,False),('去除腔壁看内部',[.25,.12,1],True,False),('结构拆分',[0,0,1],False,True)]
known={'right-atrium':[-1.65,.55,.05],'left-atrium':[1.65,1.1,-.15],'right-ventricle':[-.65,0,.8],'left-ventricle':[.75,0,.8],'ascending-aorta':[.35,1.4,-.1],'aortic-arch':[1,2.1,-.3],'pulmonary-trunk':[-.7,1.55,.65],'superior-vena-cava':[-1.8,1.45,-.2],'right-coronary':[-2.6,-1.55,.55]}
extras=[key for key in catalog if key not in known]
for panel,(title,direction,interior,explode) in enumerate(views):
    direction=np.array(direction,dtype=float);direction/=np.linalg.norm(direction)
    right=np.cross([0,1,0],direction);right/=np.linalg.norm(right);up=np.cross(direction,right)
    rotation=np.stack([right,up,direction],axis=1)
    projected=[]
    for key,p,n,indices in meshes:
        item=catalog[key]
        if item['kind']=='cavity' and not explode:continue
        if interior and item.get('interiorWall'):continue
        offset=np.zeros(3)
        if explode:
            if key in known:offset=np.array(known[key])
            elif 'explodeOffset' in item:offset=np.array(item['explodeOffset'])
            else:
                i=extras.index(key);a=i/len(extras)*np.pi*2;r=3 if item['kind'] in ['valve','papillary'] else 3.7
                offset=np.array([np.cos(a)*r,np.sin(a)*r,1.5+i%2*.5])
        q=(p+offset)@rotation
        base=np.array(tuple(int(item['color'][i:i+2],16) for i in [1,3,5]))
        light=np.array([-.4,.6,1.]);light/=np.linalg.norm(light)
        normals=n@rotation
        shade=.36+.64*np.maximum(0,normals@light)
        projected.append((q,indices,base,shade))
    allp=np.concatenate([p[0] for p in projected]);lo=allp[:,:2].min(0);hi=allp[:,:2].max(0)
    scale=min(630/(hi[0]-lo[0]),610/(hi[1]-lo[1]));middle=(lo+hi)/2
    origin=np.array([panel%2*720+360,panel//2*720+460])
    triangles=[]
    for q,indices,base,shade in projected:
        xy=(q[:,:2]-middle)*scale;xy[:,1]*=-1;xy+=origin
        for i in indices:
            tri=xy[i]
            edge1,edge2=tri[1]-tri[0],tri[2]-tri[0]
            if abs(edge1[0]*edge2[1]-edge1[1]*edge2[0])<.05:continue
            color=tuple(np.clip(base*shade[i].mean(),0,255).astype(int))
            triangles.append((q[i,2].mean(),tri.reshape(-1).tolist(),color))
    triangles.sort(key=lambda tri:tri[0])
    for _,coords,color in triangles:draw.polygon(coords,fill=color)
    draw.text((panel%2*720+35,panel//2*720+118),title,font=title_font,fill='#edcdb2')
    print(title,len(triangles),flush=True)
draw.text((38,1552),'56 个独立结构 · 任意展示单位 · 血管接口未完整贯通 · 非临床模型',font=small_font,fill='#a9b9ca')
(root/'docs').mkdir(exist_ok=True)
canvas.save(root/'docs/geometry-preview.png')
print(root/'docs/geometry-preview.png')
