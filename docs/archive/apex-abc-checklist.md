# Apex 測試地圖 A／B／C 任務清單

範圍：既有 80 × 80 公尺測試區，沿用 firing_range_test_region.blend，未重建場景。

- [x] A：2,820 個載入網格整理為 264 個繪製批次，GLB 與貼圖載入通過。
- [x] B：17,304 個碰撞盒；16 個出生點、20 段移動、10 次牆面阻擋、兩處角色及投擲物落地檢查通過。
- [x] C：新增「Apex 訓練場・測試區」，5 對 5 對局與原倉庫地圖回歸檢查通過。

2026-10-24：GTX 1650 Ti，1280×720、高畫質，每圖 8 秒，平均 59 FPS，瀏覽器錯誤 0。短測試不代表所有場景持續效能。已檢視實際遊戲截圖。

本機證據：tools/out/apex/preview/abc-runtime-report.json、tools/out/apex/preview/final-game-check.log、tools/out/apex_test.png。

限制：材質部分還原；碰撞採 0.5 公尺網格保守近似；目前驗證團隊死鬥。尚非完整 Apex 地圖。
