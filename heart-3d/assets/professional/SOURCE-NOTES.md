# 心脏公开模型来源与使用说明

本次从 BodyParts3D / Anatomography 官方公开接口直接下载，未执行第三方仓库代码。下载日期为 2026-10-26。

## 推荐给查看器使用的文件

- `source-map.json`：32 个推荐展示结构，保留原先 11 个结构 ID，追加 11 个瓣叶、5 个乳头肌模型和 5 个静脉组。`files` 包含实际可用的 OBJ，`structures[].members` 给出组合关系。
- `obj/FJ*.obj`：官方导出的源坐标，单位毫米，未缩放、未平滑、未填充、未添加虚构结构。
- `official-FMA2Obj.txt`、`official-manifest.zip`：官方 4.3 版本清单。前 3 行为 Data Version 4.3 / Objects set 4.3 / Tree version FMA3.0。
- `official-obj2FMA.html`：官方下载的结构映射。导出 OBJ 文件头给出当前选择路径对应的精确概念编号。
- `official-heart-meshes.zip`：官方原始响应。由于 BP 关联可能展开同组网格，ZIP 和 obj 目录比最终推荐集合多 1 个腹部下腔静脉段，`source-map.json` 已排除该段。
- `mirror-source-index.zip`：GitHub 公开镜像索引，仅用其中 Git LFS 指针的 SHA256 与官方文件校验和交叉核对。推荐文件全部能与镜像指针的 SHA256 一致。

## 下载依据

官方站点：https://lifesciencedb.jp/bp3d/

官方版本清单：`GET https://lifesciencedb.jp/bp3d/get-info.cgi?version=4.3&cmd=concept-objfiles-list`

映射：`POST https://lifesciencedb.jp/bp3d/get-info.cgi`，参数 `cmd=upload-all-list&load=1&md_abbr=bp3d&title=obj2FMA&tree=isa&version=4.3`。

网格：`POST https://lifesciencedb.jp/bp3d/download.cgi`，参数 `ids=[FJ编号数组]&rep_id=[BP编号数组]&type=art_file&all_downloads=1`。版本由所选 4.3 FJ 清单确定，并由每个导出 OBJ 的 `Compatibility version : 4.3` 文件头交叉核对。

镜像：https://github.com/olivercase/body_parts_3d_api 。其 CSV 的 FMA 字段有时是父概念，不能替代官方映射和 OBJ 文件头中的细分概念。例如二尖瓣前叶为 FMA7242，而不是父概念 FMA14065。

## 许可记录

官方 Archive 授权页于 2025-02-27 更新为 CC BY 4.0，允许带署名再分发与修改：https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html 。该页对应 Archive 的 4.0 下载数据，须与本次 4.3 在线导出来源分别记录。

4.3 镜像仍声明 CC BY-SA 2.1 Japan。因此本次对 4.3 网格保守保留这个原有授权及同许可分享条件，并同时保存官方当前 Archive 许可证据。代码授权与模型授权分别处理。

模型署名：BodyParts3D, © The Database Center for Life Science (DBCLS), licensed under CC BY-SA 2.1 Japan. 模型修改需注明，并按相同许可分享。授权链接：https://creativecommons.org/licenses/by-sa/2.1/jp/ 。

镜像作者仅提供下载工具和镜像，不是原始模型创建机构。医学审核状态：未完成。

## 必须保留的边界

1. 原有结构中能够一一对照的 60 个网格顶点和三角面数量与旧数据相同，因此不能把 4.3 的版本号称为实际提高精度。本次实质提升是补充内部部件、优化查看器和显示效果。
2. 旧版冠脉所用 FJ2652、FJ2693、FJ2694 不在本次 4.3 可用选择中，最终清单明确记录，不静默视为完整相同覆盖。旧 GLB 应保留供对照。
3. 心室壁仍是左右合并网格；未发现单独房间隔、室间隔、腱索、心房腔体或传导系统的可用模型。不要虚构这些结构，也不能将腔体表面称为心肌。
4. 11 个瓣叶表示四组瓣膜的静态几何。不能据此宣称瓣膜运动、真实心肌收缩或血流模拟已经验证。
5. 中文名称是按精确英文源名给出的建议，仍待医学专业人员核对。尤其主动脉瓣、肺动脉瓣使用源数据的方位命名，不擅自改成其他命名体系。
6. FJ3441 为下腔静脉较靠心脏的一段，但向腹部延伸较长。建议在源坐标 z≥1150 mm 截短，明确记录人为截断。不要将腹部 FJ3659 放入查看器、参与模型默认取景或称为心脏结构。
7. 同一组多个肺静脉片段合成展示时保留各片段的原坐标，不独立归中心。所有模型来自一般成人男性参考人体，非病例模型。
