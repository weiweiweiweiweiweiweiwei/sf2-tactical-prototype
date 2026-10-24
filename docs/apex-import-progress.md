# Apex 射擊訓練場匯入實測

目前成果是本機匯入驗證，尚未接入遊戲，也不是完整地圖還原。

## 已驗證

- RSX 2.4.0 可讀取本機安裝版本的 `mp_rr_canyonlands_staging_mu1` 資料。
- 由 client lumps 重建 world model 0：174,469 個頂點、274,097 個三角形。排除 TOOLS 材質表面，修復重複面後通過 Blender mesh.validate。
- 成功保存 Blender 檔並匯出 GLB（約 17.7 MB）。
- 19 個 LOD0 場景零件成功匯入，9 張原始色彩貼圖明確配對並封裝入 Blender 檔。
- 兩個場景均完成 CPU 渲染並人工檢視輸出圖。
- MCP 工具已出現在聊天工具清單，但 get_addon_status / get_scene_info 仍回傳無法連線，尚未完成即時控制驗證。成果由背景 Blender 產生。

## 檔案

所有遊戲衍生輸出保存在已忽略的 `tools/out/apex/preview/`：

- `firing_range_geometry.blend`：原始位置的世界幾何，使用診斷材質。
- `firing_range_geometry.glb`：相同世界幾何的交換格式。
- `firing_range_asset_gallery.blend`：19 個零件的展示排列，並非原地圖位置。
- `world_geometry.png` / `asset_gallery.png`：渲染預覽。
- `import_report.json`：幾何數量、貼圖連結、未配對材質與排除表面明細。
- `build.log`：最後一次建置紀錄。

## 尚待完成

1. 補齊尚未配對的模型並核對地圖擺放。靜態物件解析及大部分模型匯入已完成，見下方組裝紀錄。
2. 世界材質與 UV 還原；目前世界幾何無原始材質。零件目前僅配對色彩貼圖，法線、混合層、頂點色、貼花透明與原引擎 shader 尚未還原。
3. 尺寸、朝向、物件位置與遊戲參考逐區比對。目前使用每 Source 單位 0.0254 公尺，尚未在遊戲控制器驗證。
4. 碰撞、出生點、可走區、射擊遮擋與瀏覽器效能驗證。

不能把目前頂點數量或成功匯入比例換算成整張地圖的還原百分比。

## 重現與格式發現

背景 Blender 執行 `tools/blender/apex_probe.py`；需要先有 `tools/out/apex/` 下的 RSX 匯出與 CAST 原始碼。

RSX 的主 `.bsp` 匯出實際是 OBJ 文字，並非 rBSP 二進位檔。腳本直接解析同時匯出的 `.bsp.XXXX.client.bsp_lump`，避免以錯誤檔頭解讀。相關實作參考 [RSX BSP](https://github.com/r-ex/rsx/blob/main/src/game/bsp/bsp.cpp) 與 [CAST Blender importer](https://github.com/dtzxporter/cast/tree/master/plugins/blender)。

背景 Workbench 渲染會出現堆疊錯誤，因此使用 Cycles CPU 成功完成預覽。系統縮圖與擴充套件快取的權限警告不影響這次工作區檔案輸出。

## 靜態物件組裝

`apex_static_props.py` 解析 v52 sprp：480 筆模型名稱、10,932 筆擺放記錄，檔案沒有未解讀尾端資料。另以 bsp_tool 的 GameLump_SPRP 獨立解析，所有模型對應、座標、角度與縮放數值完全一致。

`apex_assemble.py` 匯入 467 種模型原型（約 64.8 萬個原型多邊形），使用共用模型的 collection instances 組裝。原始清單包含大小寫差異與同名路徑，因此 480 筆名稱不等於 480 種獨立原型。

`apex_validate_assembly.py` 檢查實例位置與縮放，將來源不明確的同名模型移入隱藏集合。遠景模型在診斷渲染中隱藏，仍保留於檔案中。數量與例外以 `placement_report.json` 為準。

成果：`tools/out/apex/preview/firing_range_assembled.blend`，預覽為 `placed_assets.png`，另有 `assembled_overview.png` 俯視檢查圖。檔案保留零件展示場景與組裝場景；活動場景為後者。這個階段沒有修改遊戲選單或替換既有地圖。

最終接受 10,631 個實例；另有 4 個同名異路徑的線圈物件保存在隱藏集合，1 個遠景模型保留但隱藏。所有接受實例的座標誤差小於 1 mm、縮放誤差小於 0.00001。這是與資料檔的數值比較，並非完整地圖的還原率。

尚缺 7 個模型鍵：barrel、firing_range_mu1_targets_01_stand、mp_setting_menu、sewer_grate_01、sewer_railing_01_128、sewer_staircase_quad、zipline_arm。多數新增模型仍未接材質。

格式依據：[bsp_tool Apex v52](https://github.com/snake-biscuits/bsp_tool/blob/master/bsp_tool/branches/respawn/apex_legends52.py)、[sprp 資料結構](https://github.com/snake-biscuits/bsp_tool/blob/master/bsp_tool/branches/respawn/titanfall2.py)。數值交叉檢查不代表已與遊戲畫面逐一核對；旋轉結果、貼花與皮膚仍需要視覺比對。

## 2026-10-24 材質與測試區域

`apex_materials.py` 產生 `firing_range_materials.blend`：65 個材質已配對色彩貼圖（其中 18 個為世界材質），並在有對應貼圖時以反轉 gloss 建立粗糙度。世界幾何重建 127 個材質分區及 823,755 個 UV 角點；保留 UV 接縫，因此與先前合併頂點版本的面數不同。482 個 PNG 檔包含跨模型的重複貼圖，不能當成獨立貼圖數量。

仍有 443 個材質記錄未配對。沒有還原原引擎的混合層、頂點色、法線與貼花透明；目前只能稱為部分材質還原。預覽為 `textured_overview.png`。新檔案引用 `materials-simple`、`terrain-materials` 和 `sample` 中的相對貼圖路徑，搬移時要連同這些目錄保留。

`apex_test_slice.py` 以 Blender 座標 (-125, -20) 公尺為水平中心，選出名義 80 × 80 公尺區域：32,523 個世界三角形、2,033 個物件實例。三角形依中心點、物件依原點選取，邊緣幾何可能超出名義邊界。不是精確裁切，也沒有可用的碰撞或出生點。

輸出 `firing_range_test_region.blend` 與 `firing_range_test_region.glb`。測試區域貼圖最長邊降至 1024 像素；完整場景與原始 PNG 不受影響。GLB 匯出後重新匯入，檢查幾何非空、座標有限與物件數量一致；明細在 `test_region_report.json`。目前仍有數千個 mesh，接入遊戲前需要合併、實例化與碰撞測試，不能據此宣稱已達到可玩效能。

## 2026-10-24 遊戲整合完成

上述段落為各階段歷史紀錄。目前測試區已接入遊戲選單，具備碰撞、導覽及安全出生點，A／B／C 已完成；詳見 apex-abc-checklist.md。使用現有 GLB，無需重建 Blender。遊戲資產為 assets/maps/apex-test/region.glb 與 collision.json；npm run build 重新組合 index.html。完整 Blender 與中間匯出仍留在本機 tools/out/。
