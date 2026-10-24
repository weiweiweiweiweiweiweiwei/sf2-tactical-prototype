# Apex 材質改善任務清單

沿用既有測試區 Blender；不重做幾何、碰撞或出生點。

- [x] A：擴充既有貼圖搜尋，遊戲 GLB 中有色彩貼圖的材質由 39 增至 130（共 259），7 個材質啟用透明。未明確配對者採分類替代色彩。
- [x] B：保留材質原有顏色；模型幾何與擺放 SHA-256 完全相同；實際畫面檢視及 5 對 5 載入測試通過。
- [ ] C：更新 GitHub 與線上遊戲，驗證部署及資產可用。

驗證：GTX 1650 Ti，1280×720、高畫質、8 秒短測，平均 58 FPS，錯誤 0。GLB 68,124,048 bytes（原 46,131,300）。新貼圖最大 512 像素，既有貼圖保留。

證據：tools/out/apex/preview/material-artifact-check.json、material_pass_report.json、material-game-check.log，遊戲截圖 tools/out/apex_test.png。

限制：部分材質仍缺失；原引擎混合層、頂點色與法線尚未完整還原，植物仍有簡化外觀。本輪為材質改善版本，不代表完整還原。
