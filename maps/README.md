# 地圖總目錄（maps/）

每張地圖的**原始檔**（Blender 檔、工作資料夾、存檔版本）都放在 `maps/<地圖>/`；遊戲實際讀的**成品**在 `assets/maps/`，玩法和佈局在 `src/07*.js`。
`maps/*/view/`、`maps/*/work/` 很大，只留在本機（`.gitignore`），不進 git。

| 地圖 | 遊戲 id | 原始檔（本資料夾） | 成品 | 程式 |
|---|---|---|---|---|
| 櫻花客棧 | `ryokan` | `ryokan/view/ryokan.blend`、`ryokan/v44_2026-10-05/`（存檔版） | `assets/maps/ryokan.js` | `src/07r_ryokan.js`；建模 `tools/ryokan/`、`tools/blender/` |
| 天空之城 | `skycity` | `skycity/view/skycity.blend`、`skycity/blockout/*.blend`（使用者的草模與存檔） | `assets/maps/skycity.js` | `src/07s_skycity.js`；`tools/sky/`、`tools/blender/sky_*.py` |
| 衛星基地 | `satellite` | （由腳本生成，沒有手改的 .blend） | `assets/maps/satellite.js` | `src/07t_satellite.js`；`tools/satellite/` |
| Apex 骷髏鎮 | `apex_skulltown` | `apex-skulltown/work/`（`skulltown.blend`、`skulltown_baked.blend`、匯出與日誌） | `assets/maps/apex-skulltown/` | `src/07w_skulltown.js`；`tools/blender/skulltown_*.py`、`apex_maps.py` |
| Apex 訓練場 | `apex_full` | `apex-range/work/`（`range.blend`、`range_baked.blend`、匯出） | `assets/maps/apex-range/` | `src/07w_skulltown.js`、`07v_apex_full.js`；`tools/blender/apex_maps.py` |
| SF2 沙漠營地 | `sf2_desertcamp` | 從 SF2 安裝檔轉出，沒有 .blend（中間檔在 `tools/out/sf2/maps/`） | `assets/maps/sf2-desertcamp/` | `src/07x_sf2maps.js`；`tools/sf2_map_*.py/.mjs` |
| SF2 邊境要塞 | `sf2_tower` | 同上 | `assets/maps/sf2-tower/` | 同上 |
| SF2 惡魔島、沙漠之都（隱藏中） | `sf2_alcatraz`、`sf2_dustcity` | 同上 | `assets/maps/sf2-alcatraz/`、`sf2-dustcity/` | 同上（`SF2_LISTED = false`） |
| 程式生成的地圖：廢棄倉庫、沙漠小鎮、港口碼頭、辦公大樓、雪地基地、遺跡山丘、山嶺前哨、農莊、水壩、機庫、失落神殿、峽谷陣地、河谷村落、雪嶺研究站 | `warehouse` … `polar` | 沒有外部檔，整張圖寫在程式裡 | — | `src/07_maps.js`、`src/06_mapbuilder.js` |

縮圖：`assets/maps/thumbs/<id>.jpg`（`node tools/_mapthumbs.mjs <id>`）。

## 存一個版本

使用者說「保存」時，才把那張地圖的當下版本存一份到這裡。其他時候的修改都在 git 歷史裡。

```
maps/<地圖>/<版本>_<日期>/
  07r_ryokan.js      地圖佈局與玩法（src/ 的那一份）
  ryokan_glb.js      Blender 模型（assets/maps/ryokan.js）
  blender/*.py       Blender 建模腳本
  tools/             plan 匯出、GLB 打包、當時的 plan.json
  NOTES.md           這一版的內容與已知問題
```

還原某一版：
1. 把 `07r_ryokan.js` 複製回 `src/`。
2. 把 `ryokan_glb.js` 複製回 `assets/maps/ryokan.js`。
3. 執行 `sh src/build.sh`。
