# 心脏解剖 · 专业观察工作台

本项目面向解剖学习、专业培训和交流。医学复核尚未完成。当前没有患者影像、临床测量、心脏长短轴标定、真实心肌运动或血流定量功能。

## 打开方式

直接双击根目录 `index.html`，用新版 Chrome 或 Edge 打开。所有模型、脚本和样式内嵌，断网可用。

专业完整版也保存在 `web/`：双击 `start.bat`，启动仅绑定 `127.0.0.1` 的本地服务并打开浏览器。端口自动选择，按 Ctrl+C 停止服务。网页资源已生成，无需 npm 安装即可运行。此启动方式需要本机 Python。

## 已实现

- 32 个实际网格结构：保留原心壁、心室腔、大血管和部分冠状动脉，并加入 11 个静态瓣叶、5 个乳头肌、四肺静脉主干及截短的下腔静脉近心段。
- 中文、英文、缩写及源编号检索；结构选择、隐藏、单独查看、点击聚焦。
- 解剖质感、结构辨认两套显示预设；高清/流畅画质；未选中结构透明度。
- 冠状、矢状、横断方向及自由斜切；反向保留；显示切面位置。剖切按真实网格裁剪，不填充缺失组织，裁掉部分不能被鼠标选中。
- 结构拆分、程度滑块、精确复原，与剖切模式互斥。扩展结构的展示位置仍待专业审校。
- 跟随结构的标签、引线和人体方向指示；标签按空间避让与遮挡筛选。
- 观察记录保存、读取及 JSON 导入/导出，包含相机、剖切、结构可见性及显示设置；模型校验值不匹配时拒绝恢复。
- 高清 PNG 导出，包含模型来源、版本、方向、显示模式及医学审核状态。
- 专业观察默认静态；简化跳动仅作为手动开启的教学示意，剖切和拆分期间自动暂停。

## 模型来源

32 个展示组由 84 个官方原始 OBJ 转换；保留原始坐标关系，不再次简化。

来源为 BodyParts3D / Anatomography 官方公开下载接口。文件头标明毫米，源文件 SHA-256 均与独立 GitHub 镜像中的 LFS 指针一致。原始文件、官方版本清单和来源说明保存在 `assets/professional/`。

BodyParts3D, © The Database Center for Life Science (DBCLS), licensed under CC BY-SA 2.1 Japan.

官方 4.0 Archive 的现行许可为 CC BY 4.0；本次在线 4.3 数据按其来源仍声明的 CC BY-SA 2.1 Japan 保留署名及同许可分享条件。两者分别记录，不混用。

- 在线来源：https://lifesciencedb.jp/bp3d/
- 在线许可：https://lifesciencedb.jp/bp3d/info_en/license/index.html
- CC BY-SA 2.1 Japan：https://creativecommons.org/licenses/by-sa/2.1/jp/
- 文件交叉核对镜像：https://github.com/olivercase/body_parts_3d_api
- 原先 4.0 GLB：仍保留在 `assets/heart.glb`，及其来源清单中，供对照。

### 转换记录

从源坐标 `[x,y,z]` 平移后变换为 `[x,z,-y]`，统一缩放 `0.02`。显示坐标 1 单位对应源坐标 50 mm；本页不据此提供临床测量。

下腔静脉 FJ3441 只保留源坐标 `z ≥ 1150 mm` 的近心部分，截断处保持开口。转换时重算法线，不生成纹理或额外解剖结构。原始 OBJ 保持不变。

## 已知不足

- 心室壁仍为左右合并网格，没有独立房间隔、室间隔、心房腔及腱索网格。
- 11 个瓣叶为静态表面，不能作为瓣膜运动或功能的依据。
- 冠状动脉为所选分支组，旧数据的 FJ2652、FJ2693、FJ2694 未纳入本次 4.3 数据。
- 中文名称、源方位命名、空间关系、拆分方向及切面仍待医学专业人员逐项审核。
- 标签为位置提示，受遮挡筛选和显示数量限制；完整结构以目录为准。
- 浏览器本地存储可能受限制或被清除，重要观察记录请导出 JSON。

## 开发

```powershell
npm.cmd install --no-audit --no-fund
npm.cmd run check
npm.cmd run build
node verify.mjs
```

构建会更新本项目生成的根目录 `index.html` 及 `web/` 成品。源模型转换脚本 `scripts/prepare-model.py` 还需要 NumPy，只在重新生成模型时使用。原始几何和派生模型按模型许可分发，Three.js 等依赖许可见 `THIRD-PARTY-NOTICES.txt`。

模型审核表见 `docs/MEDICAL-REVIEW.md`，实施与验证状态见 `docs/IMPLEMENTATION-STATUS.md`。
