"""将已取得并校验的官方心脏 OBJ 转为保留结构编号的 GLB。"""
import hashlib
import json
import math
import shutil
import struct
import sys
from pathlib import Path

import numpy as np

root = Path(sys.argv[1]).resolve()
source = Path(sys.argv[2]).resolve()
mapping = json.loads((source / "source-map.json").read_text(encoding="utf-8"))
catalog_base = {item["id"]: item for item in json.loads((root / "src/catalog.json").read_text(encoding="utf-8"))}
target = root / "assets/professional"
target.mkdir(parents=True, exist_ok=True)
(target / "source-obj").mkdir(exist_ok=True)
files = {item["fj"]: item for item in mapping["files"]}
center = np.array([21.5438, -113.22495, 1245.64], dtype=np.float64)
scale = .02


def parse_obj(file):
    content = Path(file["path"]).read_bytes()
    if hashlib.sha256(content).hexdigest() != file["sha256"]:
        raise ValueError(f"源文件校验不一致：{file['fj']}")
    points, faces = [], []
    for line in content.decode("utf-8", errors="replace").splitlines():
        if line.startswith("v "):
            points.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("f "):
            indices = [int(x.split("/")[0]) for x in line.split()[1:]]
            indices = [x - 1 if x > 0 else len(points) + x for x in indices]
            for i in range(1, len(indices) - 1):
                faces.append([indices[0], indices[i], indices[i + 1]])
    return np.asarray(points, dtype=np.float64), np.asarray(faces, dtype=np.int64)


def truncate_ivc(points, faces):
    # 仅截短远离心脏的下腔静脉部分，保留原坐标；不生成封口或补组织。
    output, triangles, lookup = [], [], {}
    def index(point):
        key = tuple(round(float(x), 9) for x in point)
        if key not in lookup:
            lookup[key] = len(output)
            output.append(point)
        return lookup[key]
    for face in faces:
        polygon = [points[i] for i in face]
        clipped = []
        for i, end in enumerate(polygon):
            start = polygon[i - 1]
            start_in, end_in = start[2] >= 1150, end[2] >= 1150
            if start_in != end_in:
                t = (1150 - start[2]) / (end[2] - start[2])
                clipped.append(start + t * (end - start))
            if end_in:
                clipped.append(end)
        for i in range(1, len(clipped) - 1):
            tri = [index(clipped[0]), index(clipped[i]), index(clipped[i + 1])]
            if len(set(tri)) == 3:
                triangles.append(tri)
    return np.asarray(output), np.asarray(triangles)


binary = bytearray()
views, accessors, nodes, meshes, materials, catalog, converted = [], [], [], [], [], [], []
def accessor(array, component, value_type, bounds=False):
    while len(binary) % 4:
        binary.append(0)
    raw = array.tobytes()
    view_index = len(views)
    views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(raw)})
    binary.extend(raw)
    entry = {"bufferView": view_index, "componentType": component, "count": len(array), "type": value_type}
    if bounds:
        entry.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
    accessors.append(entry)
    return len(accessors) - 1


for item in mapping["structures"]:
    positions, faces, members = [], [], []
    for fj in item["members"]:
        info = files[fj]
        p, f = parse_obj(info)
        if item["id"] == "inferior-vena-cava-upper-source":
            p, f = truncate_ivc(p, f)
        offset = sum(len(part) for part in positions)
        positions.append(p)
        faces.append(f + offset)
        destination = target / "source-obj" / f"{fj}.obj"
        if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest() != info["sha256"]:
            raise ValueError(f"已保存的源文件发生变化：{destination}")
        if not destination.exists():
            shutil.copy2(info["path"], destination)
        members.append(fj)
    positions = np.concatenate(positions)
    faces = np.concatenate(faces)
    mm_bounds = {"min": positions.min(axis=0).tolist(), "max": positions.max(axis=0).tolist()}
    local = (positions - center) * scale
    local = local[:, [0, 2, 1]]
    local[:, 2] *= -1
    normals = np.zeros_like(local)
    v1 = local[faces[:, 1]] - local[faces[:, 0]]
    v2 = local[faces[:, 2]] - local[faces[:, 0]]
    cross = np.cross(v1, v2)
    for column in range(3):
        np.add.at(normals, faces[:, column], cross)
    length = np.linalg.norm(normals, axis=1)
    normals /= np.maximum(length[:, None], 1e-20)
    old = catalog_base.get(item["id"])
    info = files[members[0]]
    kind = item["kind"]
    if kind in ("artery", "vein"):
        kind = "vessel"
    if old:
        record = dict(old)
        record["name"] = item["chineseName"]
        record["note"] = record["note"].replace("选择后会自动隐藏心室壁。", "完整观察时选择会隐藏心室壁；也可单独查看。")
    else:
        group = "瓣叶" if kind == "valve" else "乳头肌" if kind == "papillary" else "静脉"
        record = {"id": item["id"], "name": item["chineseName"], "english": info["englishName"], "abbreviation": "", "group": group, "color": "#ddc49e" if kind == "valve" else "#c97d6c" if kind == "papillary" else "#869fba", "description": "展示源数据中的静态瓣叶表面。可使用剖切、隐藏外壁或单独查看观察形态。" if kind == "valve" else "展示源数据中的乳头肌结构。可单独查看其位置与形态。" if kind == "papillary" else "展示源数据选取的静脉主干或靠近心脏的片段，末端可能截断。", "note": "名称沿用源数据的方位命名；中文名称及解剖关系待医学专业人员复核。"}
    if item["id"] == "inferior-vena-cava-upper-source":
        record.update(name="下腔静脉近心段", english="Inferior vena cava, selected proximal segment", abbreviation="IVC", note="源文件在原始坐标 z=1150 mm 处人工截短；保持开口，不补面。")
    if kind == "coronary":
        record["note"] = "所选源分支合并展示，不代表完整冠状动脉树。旧版的 3 个分支片段未纳入本次 4.3 数据，详见来源清单。"
    record.update(kind=kind, fma=old.get("fma") if old else item["fmaIds"][0], sourceFmaIds=item["fmaIds"], sourceIds=members, review="pending", sourceName=info["englishName"])
    abbreviation_map = {"left-superior-pulmonary-vein": "LSPV", "left-inferior-pulmonary-vein": "LIPV", "right-superior-pulmonary-vein": "RSPV", "right-inferior-pulmonary-vein": "RIPV"}
    if item["id"] in abbreviation_map:
        record["abbreviation"] = abbreviation_map[item["id"]]
    elif kind == "valve":
        record["abbreviation"] = "MV" if "mitral" in item["id"] else "TV" if "tricuspid" in item["id"] else "AV" if "aortic" in item["id"] else "PV"
    elif kind == "papillary":
        record["abbreviation"] = "PM"
    if item["id"] in ("left-coronary", "right-coronary"):
        record["name"] = "左冠状动脉分支组" if item["id"] == "left-coronary" else "右冠状动脉分支组"
    catalog.append(record)
    pos_index = accessor(local.astype("<f4"), 5126, "VEC3", True)
    normal_index = accessor(normals.astype("<f4"), 5126, "VEC3")
    index_index = accessor(faces.reshape(-1).astype("<u4"), 5125, "SCALAR")
    material_index = len(materials)
    materials.append({"name": item["id"], "doubleSided": True, "pbrMetallicRoughness": {"baseColorFactor": [.5, .25, .2, 1], "metallicFactor": 0, "roughnessFactor": .6}})
    meshes.append({"name": item["id"], "primitives": [{"attributes": {"POSITION": pos_index, "NORMAL": normal_index}, "indices": index_index, "material": material_index}]})
    nodes.append({"name": item["id"], "mesh": len(meshes) - 1, "extras": {"structureId": item["id"], "sourceIds": members, "fmaIds": item["fmaIds"], "medicalReview": "pending"}})
    converted.append({"id": item["id"], "sourceIds": members, "vertices": len(local), "triangles": len(faces), "boundsMm": mm_bounds})

credit = "BodyParts3D, © The Database Center for Life Science (DBCLS), CC BY-SA 2.1 Japan."
gltf = {"asset": {"version": "2.0", "generator": "Heart Anatomy Workspace local OBJ conversion", "copyright": credit}, "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}], "nodes": nodes, "meshes": meshes, "materials": materials, "buffers": [{"byteLength": len(binary)}], "bufferViews": views, "accessors": accessors}
encoded = json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode()
encoded += b" " * (-len(encoded) % 4)
binary.extend(b"\0" * (-len(binary) % 4))
output = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(encoded) + 8 + len(binary)) + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded + struct.pack("<II", len(binary), 0x004E4942) + binary
(target / "heart-4.3.glb").write_bytes(output)
meta = {"dataset": "BodyParts3D", "version": "4.3 · 教学参考", "credit": credit, "license": "CC-BY-SA-2.1-JP", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.1/jp/", "sourceStatus": "官方直接下载；84 个源文件哈希与独立镜像指针一致；医学复核待完成", "medicalReview": {"status": "pending", "reviewer": None}, "units": {"source": "mm", "scale": .02, "displayUnitToMm": 50, "note": "原始 OBJ 文件头标明毫米；显示坐标 1 单位=50 mm；未开放临床测量"}, "transform": {"centerMm": center.tolist(), "scale": scale, "axes": "[x, z, -y]"}, "runtime": {"file": "heart-4.3.glb", "bytes": len(output), "sha256": hashlib.sha256(output).hexdigest()}, "modifications": ["按源坐标合并选定部件，未重新简化", "整体居中、坐标轴转换、统一缩放、重算法线", "下腔静脉在原始 z=1150 mm 处截短，保持开口", "显示材质与颜色为示意；当前医学复核未完成"], "limitations": mapping["limitations"], "unavailablePreviousVersionElements": mapping.get("unavailablePreviousVersionElements", []), "structures": converted, "coverage": [{"name": "心房壁 / 心室壁", "status": "已加载；心室壁左右合并"}, {"name": "左右心室腔", "status": "已加载；表面代表腔内空间"}, {"name": "四组瓣膜", "status": "11 个静态瓣叶；不含运动"}, {"name": "乳头肌", "status": "5 个源模型；非完整瓣膜装置"}, {"name": "大血管与肺静脉", "status": "所选片段已加载；末端有截断"}, {"name": "冠状动脉", "status": "所选分支；覆盖不完整"}, {"name": "独立间隔 / 腱索 / 心房腔", "status": "未包含独立网格"}, {"name": "心脏长短轴 / 临床测量", "status": "未标定 / 未开放"}]}
(target / "model-manifest.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
(root / "src/catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
saved_mapping = json.loads(json.dumps(mapping))
used_members = {fj for item in mapping["structures"] for fj in item["members"]}
saved_mapping["files"] = [file for file in saved_mapping["files"] if file["fj"] in used_members]
for file in saved_mapping["files"]:
    file["path"] = "source-obj/" + file["fj"] + ".obj"
(target / "source-map.json").write_text(json.dumps(saved_mapping, ensure_ascii=False, indent=2), encoding="utf-8")
for name in ("SOURCE-NOTES.md", "official-FMA2Obj.txt", "official-manifest.zip", "official-heart-meshes.zip", "official-obj2FMA.html"):
    if (source / name).exists() and not (target / name).exists():
        shutil.copy2(source / name, target / name)
print(json.dumps({"structures": len(catalog), "triangles": sum(item["triangles"] for item in converted), "bytes": len(output), "sha256": meta["runtime"]["sha256"]}, indent=2))
