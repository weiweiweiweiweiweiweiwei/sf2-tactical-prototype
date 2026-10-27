# 全場景與移動改進

- [x] A：GitHub 參考研究；二段跳、持續滑鏟、較高攀爬、墜落死亡，行為測試通過。
- [x] B：沿用既有完整場景，匯出全地圖、近似碰撞及 27 扇可互動門；修正非活動場景變換讀取、背面顯示與非實體霧片。
- [ ] C：全圖與原倉庫地圖對局通過；等待 GitHub Pages 部署驗證。
- [x] D（10-24）：`開始遊戲.bat` 本機伺服器、`file://` 提示；碰撞二進位＋延遲展開；貼圖 JPEG；縮圖（見 PROGRESS v55）。

- [x] F（10-24）：Draco 壓縮、全場景開放對戰（烘焙導航／出生區／據點）、Bot 二段跳與滑鏟（PROGRESS v57）。
- [x] E（10-24）：兩張 Apex 地圖改成 script 分塊包（`assets/maps/apex-*/pack/`），直接雙擊 index.html（file://）也能玩；`開始遊戲.bat` 已移除（見 PROGRESS v56）。

## 操作

地圖選單：Apex 訓練場・全場景。
- E：近距離開關電動門，關門遇到角色會重新打開。
- Space：跳躍；空中再次按下可二段跳，每次落地恢復一次空中跳躍。
- W + Shift 加速後按住 C 或 Ctrl：持續滑鏟；保持前進，放開蹲鍵結束，Space 可跳出。
- 面向邊緣前進並跳躍：嘗試攀爬較高平台；保留頭頂與路徑碰撞檢查。
- 低於底部死亡面或超出完整地圖水平邊界：扣血死亡，出生保護不會阻止此死亡。

## 驗證與範圍

約 1,117 × 1,024 公尺的完整 world model 0 範圍，10,630 個接受的靜態物件實例。與原測試區共用的 2,733 個物件，其匯出位置、旋轉、縮放逐值一致。沒有重新建模。

移動測試：兩次跳躍後第三次不刷新跳躍速度；持續滑鏟 3 秒；攀上 2.1 公尺平台；低天花板阻擋；墜落死亡。門測試：5 扇實例開關、碰撞與物理同步、防夾；外圍 12 處落地；越界死亡。

最終短測：GTX 1650 Ti、1280×720、高畫質、5 對 5、12 秒。全場景平均 29 FPS（先前 8 秒測試 31 FPS），倉庫 59 FPS，錯誤 0。完整場景尚未達到 60 FPS。近處村落材質合批、外圍共享模型及視距裁切；完整探索版關閉靜態場景投射陰影以降低負擔。

完整地形可探索，外圍 1 公尺保守碰撞、簡化模型；原村落保留已驗證的 0.5 公尺碰撞。Bot 導航、出生區、據點涵蓋村落周圍約 325×270 公尺可往返的區域（v57 烘焙，見 PROGRESS）。門依原始 prop_door 實體位置建立替代電動門，不是原作門模型與動畫的完整還原。

地板顯示針對裁切邊界、背面剔除、重疊貼花及錯誤霧片處理；未宣稱所有原始缺面、缺材質或不可達區域皆已修復。113 個需要原引擎特效 shader 的霧片／光束不作不透明替代，也不作實體碰撞。仍沿用前階段缺失模型／材質限制。

## 重現

1. Blender 執行 tools/blender/apex_full.py（完整視覺匯出）。
2. Blender 執行 tools/blender/apex_full_collision_work.py、apex_collision_triangles.py（碰撞簡化／三角形串流）。
3. PowerShell Add-Type -Path tools/apex-raster.cs；呼叫 ApexRaster.Run 將 collision-triangles.bin 轉為 full-boxes.bin。
4. node tools/pack-apex-collision.mjs（輸出 collision.bin）；python tools/compress-apex-textures.py（不透明貼圖轉 JPEG）；node tools/bake-apex-nav.mjs（全場景導航、出生區、據點，約 3 分鐘）；node tools/pack-apex-js.mjs（Draco 壓縮並打成遊戲實際讀的 script 分塊包）；npm run build。
5. node tools/check-apex-traversal.mjs；node tools/check-apex-full.mjs；node tools/check.mjs --map 18,0 --seconds 12 --bots 5 --shot。

本機證據：tools/out/apex/preview/traversal-report.json、full-runtime-report.json、full-final-check.log。

## GitHub 設計參考

自行實作，未直接複製下列程式：
- https://github.com/delgoodie/Zippy/blob/main/Source/Zippy/Private/ZippyCharacterMovementComponent.cpp ：分離滑行／攀爬狀態及轉換條件。
- https://github.com/ValveSoftware/source-sdk-2013 ：Source 引擎角色移動架構。
- https://github.com/Mauler125/r5sdk ：Apex 引擎 SDK 背景；不是可直接套用到瀏覽器的完整控制器。

二段跳與持續滑行是此專案自訂玩法，不宣稱精確複製原作所有角色的移動規則。
