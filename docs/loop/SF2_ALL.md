# SF2 全槍枝＋全地圖迴圈（使用者 2026-10-29）

> 「復刻 SF2 所有的槍枝，不需要特別塗裝（M4A1 有標準、EO、Reflex、ACOG、消音、Max 等型態）」、「還原 SF2 所有地圖，除了特殊模式（殭屍…）」、「需要我確認的問題一律選 A（推薦），不要停下來問」、「不要過度糾結小細節，節省 token」。

每一輪：讀本檔 → 做佇列第一個 ⬜／🔄 → 驗證 → 更新本檔、`docs/CHANGELOG.md`（「（本機）」標題）、`docs/TODO.md` → commit → `git push origin local/assets`。佇列全部 ✅／⏸ 時停止迴圈並總結。

## 規則
- **不問使用者**：要決定的事選推薦的那個（A），把選擇寫進 CHANGELOG 的該筆紀錄。只有刪除資料、強制推送、改專案外的檔案才停。
- **省 token**：對位這類細節最多試 2 次，不行就標 ⏸ 寫原因、換下一項；不要反覆截圖微調。
- 分支 `local/assets`；**不推 master**（使用者測完再說）。git 身分：`git -c user.name=WEI -c user.email="$(git config user.email)"`。
- 不動 `maps/`（使用者的 Blender 檔）、`music/`、`rea-cn/`；新地圖的輸出放 `assets/maps/sf2-<名>/`、工具放 `tools/`、匯出暫存放 `tools/out/`。
- 平衡：傷害照 CLAUDE.md §4.2 和同類槍；射速、換彈、拔槍、開鏡、後座、重量用 SF2 原始資料。
- 每輪結束：`sh src/build.sh`、`node tools/esm/analyze.mjs`（MODULES_OK）、`node tools/check.mjs`（CHECK_OK）。
- 一把槍的做法照 `docs/loop/GUNS.md`「一把槍的做法」。

## 佇列
狀態：⬜ 未做 · 🔄 進行中 · ✅ 完成 · ⏸ 做不到（寫原因）

### G0. 先處理容量（`assets/guns/guns.js` 已 60.7 MB，再加槍會拖慢載入）
- ✅（v65j）槍模按需載入：`tools/guns/pack.mjs` 改成每把槍一個檔（`assets/guns/<id>.js`）＋索引；遊戲只載入目前配裝、Bot 手上、倉庫正在看的槍（倉庫縮圖可用預先畫好的圖）。驗證：首次進對戰的下載量、`check.mjs`、倉庫縮圖、`_fileplay`。
- ✅（v65k）變體在遊戲裡組裝：底槍的 rig＋配件零件（瞄具、消音器）各一個小 GLB，執行時掛到槍身插槽（`Scope`／`Sight`／`Silencer`），不再每個變體一個完整 rig。把現有的 `g36c_eo`、`hk417_rs`、`scarl_eo` 改成這種方式驗證。

### G1. 槍枝清單
- ⬜ 從 `docs/research/sf2/client-data/weapons.json`、`SFCItem_*` 的 `DefaultItemClassNames`（`tools/sf2_props.py`）、SF2 的武器名稱表整理出：**每把底槍**＋**型態**（標準、EO、Reflex、ACOG、Silencer、Max／改、其他配件組合），排除塗裝（CircuitFX、Blaster、活動造型等）和特殊模式武器。輸出 `docs/research/sf2/gun-inventory.md`（底槍、型態、類別名、包名、遊戲裡有沒有）。依這份清單展開下面 G2–G4 的項目。

### G2. 補完暫停的 11 把（`docs/loop/GUNS.md` 的 ⏸）
- ⬜ SVD、P90、PP-2000／vz.61（雙持）、M249、RPK、L86A1、AA-12；沒有 SF2 包的（MP5、Vector、Negev、PKM、MG42、M1014、USP、AK-47）再找一次包名，真的沒有就維持原本的槍。

### G3. 遊戲裡還沒有的 SF2 底槍（依 G1 清單）
- ⬜（G1 完成後展開）

### G4. 各槍的型態（依 G1 清單；M4A1 先做：EO、Reflex、ACOG、Silencer、Max）
- ⬜（G1 完成後展開）

### M1. 地圖清單
- ⬜ 列出 SF2 安裝檔裡的地圖包（`D:/SpecialForce2/SFGame/CookedPCConsole`），排除殭屍／PVE／活動等特殊模式；記下各圖的包名、主要的子關卡（streaming levels）、大小。輸出 `docs/research/sf2/map-inventory.md`。

### M2. 地圖匯出可行性
- ⬜ 用一張小圖試：UModel 匯出靜態網格；關卡裡物件的擺放（`StaticMeshActor`／`StaticMeshComponent` 的位置、旋轉、縮放）用 `tools/sf2_props.py` 的解析器讀；BSP 牆地板（`Model`）能不能讀；光照（lightmap）先不管。做出 `tools/sf2_map_export.py` → GLB＋碰撞，照 Apex 三角碰撞地圖的方式接進遊戲（`apexTriMap`）。驗證：能走、能打、出生點、`check.mjs`。

### M3. 逐張還原（依 M1 清單，M2 成功後展開）
- ⬜（M2 完成後展開）

## 自動選擇紀錄
（迴圈中替使用者做的決定，一行一個，使用者可以回頭改）
- v65j：地上掉的槍若還沒載入，那一次先用簡易模型、背景載入，下一次才是精細模型（選 A：不讓掉槍時卡頓）。
- v65k：型態一律輸出成「配件檔」（`<id>_sf2_ovl.glb`，`node tools/sf2_rig_build.mjs <型態>`；要整把時加 `--full`），不再另存整把 rig。
