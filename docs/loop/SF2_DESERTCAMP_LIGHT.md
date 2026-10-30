# 交接：SF2 沙漠營地（Desert Camp）光照（使用者 2026-10-29 選 A：先做光照貼圖）

上一個 session 做到 v65x（commit c10ebdf，`local/assets`）。地圖形狀已經對了（斜坡斷層、鐵皮屋位置都修好），下一步是**畫面偏白偏灰藍**。
規則照 CLAUDE.md 和 memory：繁中回覆；只推 `local/assets`，不推 master；不動 `maps/`、`music/`、`rea-cn/`；沙漠之都、惡魔島維持隱藏（使用者 10-29 選 A，不重建）。

## 已知
- 原始貼圖本身是暖沙色（`dc_wall_010` 平均 RGB 190/177/158），畫面變灰藍是**我們的燈光**：`src/07x_sf2maps.js` 第 21–22 行 sf2TriMap 預設 `hemi: [0xd8e2ec, …]`、`background/fog 0x8c9aa6`，太陽 `sun.pos [30,60,20]` 是隨便設的。
- SF2 的值（`tools/out/sf2/Desertcamp_dec.upk`，`tools/sf2_props.py`）：
  - DominantDirectionalLight_0：Rotation (Pitch −10016, Yaw −1120992) → 俯角約 55°、方位約 322°（UE 座標；換到遊戲：x = UE x，z = UE y（已鏡像），y = 高度）。
  - DominantDirectionalLightComponent_0：`p.props()` 讀到一半會壞（某個 struct 解析錯），顏色／亮度還沒讀到——要逐 tag 讀或修 `_tags`。
  - HeightFogComponent_0：Height 2590、Density 4.5e-5、LightBrightness 0.8、StartDistance 1000、LightColor 沒解出（`?14940665` 名字索引怪，看原始 bytes）。
  - WorldInfo `DefaultPostProcessSettings`、PostProcessVolume_3 `Settings`：Bloom_Scale 0.5、DOF…，SceneHighLights／MidTones／Shadows／Desaturation 還沒印完整（字串被截在 160 字）。
- 你的參考照（使用者給的 SF2 截圖）：暖米色天空霧、強烈太陽陰影、沙地偏黃。

## 建議做法（兩段）
1. **快速見效**：用 SF2 的太陽方向與顏色、霧色、後製色調改 Desert Camp 的 `sun / hemi / fog / background / exposure`（只改這張圖的 def，不動別張）。截圖跟參考照比。
2. **光照貼圖**（較大）：主包有 LightMapTexture2D 63、ShadowMap1D 1685、ShadowMap2D 291、ShadowMapTexture2D 17，貼圖本體在 `D:\SpecialForce2\SFGame\CookedPCConsole\Lighting_DesertCamp.tfc`。
   - BSP：Model 的 VertexBuffer（FModelVertex 有 ShadowTexCoord）在 `tools/sf2_map_bsp.py` 讀到的 Verts 之後；ModelComponent 505 個各帶 LightMap。
   - 模型：StaticMeshComponent 的 LODData → LightMap2D（貼圖＋ScaleVectors／CoordinateScale／CoordinateBias），模型的第二組 UV。
   - 做不到就標 ⏸ 寫原因，停在第 1 段。

## 工具（都在 `tools/out/`，scratch）
- `_sf2cam.mjs`：`VIEWS='名:px,py,pz:tx,ty,tz[:fov];…' node tools/out/_sf2cam.mjs` → `tools/out/cam_<名>.jpg`。好用的角度：`stairsUp:23.5,-0.8,-17.6:13,0.6,-17.6:70`、`hut1b:30,1.7,-28:33,0.5,-38:70`、`pit:26,2,-17.5:12,-2,-17.5:75`。
- `_sf2walk.mjs`（Bot 40 秒移動，目前 78–105 m）、`_sf2hmap.mjs`（高度圖）、`_sf2float.mjs`（浮空物件）、`_sf2col.py <pkg> x y`（某點的 BSP 柱）、`_sf2mbox.py`（範圍內的擺放）。
- 重建：`node tools/sf2_map_build.mjs Desertcamp` → `sh src/build.sh` → `node tools/esm/analyze.mjs`（MODULES_OK）→ `node tools/check.mjs`（CHECK_OK）→ `node tools/_mapthumbs.mjs sf2_desertcamp`。
- 每完成一段：更新 `docs/CHANGELOG.md`（下一版 v65y）、本檔，commit（`[M3] Maps: … (local)` + Co-Authored-By）→ push `local/assets`。

## 還沒做（排在光照之後）
外圍沙丘：主包 2 個 Terrain（17×17、每格 512 cm、Z 比例 256，高度 (h−32768)×2 cm；位置在可玩範圍外，UE3 Terrain 是否吃 Rotation 未確認）；牆面貼花（DecalActor 143）；效能。導航圖仍有約 300 個小區塊（最大 5557 節點），A→B 已通。
