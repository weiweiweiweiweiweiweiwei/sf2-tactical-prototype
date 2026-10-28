# 雲端 ↔ 本機 工作交接

> 雲端 session 做不到的事寫在「待本機」；本機 Claude Code 做完後移到「本機已完成」，並寫明輸出路徑。
> 本機只 push 到 `local/assets` 分支，雲端每輪會把它合進 `claude/intelligent-einstein-vgvrqy`。
> 狀態：⬜ 未開始 · 🔄 進行中 · ✅ 完成 · ⏸ 需要使用者本人

## 待本機（雲端寫，本機做）

### H2 🔄 抓公開的 TTK 表和 wiki 數值，給雲端比對
- 來源：`https://apexlegends.wiki.gg/wiki/<槍名>`（每把槍頁面的 Stats、TTK、Advanced stats 表），以及任何列出 TTK 的數據站。
- 輸出：`docs/research/apex/web/wiki-<slug>.md`（表格原樣轉成 Markdown，附抓取日期和網址）。
- 驗證：每個檔都有網址和日期；有 TTK 表的槍至少 20 把。

### H3 ⬜ SF2 原版素材（`D:\SpecialForce2`，UModel；流程見 `docs/pipelines/guns.md`「SF2 原版槍＋原版動畫」）
- M16A3：找平頂機匣的照門或瞄具零件（不在類別預設裡，搜尋 `weapon_common_part*`、`rif_m16a3*` 的全部零件）。找到後照第 7 步加進 `tools/sf2_rig_build.mjs`，再取消 `tools/sf2_weapon_table.py` 裡 m16a3 那行的註解。
- QBZ-97：提把上的瞄準線（現在眼睛落在照門本體上），對照 `.props.txt` 的插槽。
- MP5K：照第 7 步新增（衝鋒槍類別）。
- M4A1 第三人稱槍模：`_3rd` 零件，原始匯出放在 `tools/out/sf2/m4a1_3rd/`，成品 commit 成 `tools/guns/m4a1_3rd.glb`；接到 Bot 手上的部分留給雲端（寫進「本機已完成」）。
- 驗證：`node tools/check.mjs`、`node tools/_gunshot.mjs`（開鏡截圖存進 `docs/testing/shots/`）。

### H4 ⬜ 真實顯卡的效能檢查
- `node tools/check.mjs --map all` 跑 GTX 和 `--gpu intel` 各一次，加 `--novsync` 再跑一次 GTX。
- 輸出：`docs/testing/gpu-<日期>.md`（三張表原樣貼上；有掉幀或錯誤的地圖標出來）。

### H5 ⬜ Apex 原版槍模和音效（RSX；先確認電腦上有沒有裝 Apex）
- 沒裝的話，在這裡標 ⏸，寫「未安裝」。
- 有裝的話：先匯出 R-301 一把試做（模型、貼圖、槍聲）。原始匯出放在 `tools/out/apex/r301/`（不會 commit），成品 commit 成 `tools/guns/apex_r301.glb` 和音效檔，流程寫進 `docs/pipelines/apex-guns.md`。

### H6 ⏸ 需要使用者本人
- AK-103、G36C 的 SF2 開鏡截圖（要進 SF2 遊戲裡截）。
- 實際試玩的手感意見（M4A1 腰射位置、拔槍 0.8 s、後座力）。

## 本機已完成（本機寫，雲端接手）

### L0 ✅ 合併本機 master 上兩個沒推的 commit（使用者 10-27 選 C：Apex 載入時間；loop 開始前做的）
- `85c4ebd` 載入時間、`4ae2787` 碰撞資料縮小——在 CHANGELOG 改編號為 **v62x、v62y**（雲端已用掉 v62t–w；commit 訊息裡仍寫 v62t／v62u）。
- 動到 `src/`（使用者直接要求的功能，在 loop 分工前完成）：
  - `07w_skulltown.js`：預載時建好碰撞 `TriSoup`（`_tri.soup`）、讀新碰撞格式 `STRZ`、載入計時 `window.__loadT`；新 import `TriSoup`。
  - `04_collision.js`：`CollisionWorld.useTris(soup)`，export `TriSoup`。
  - `16_match.js`：`def._preloadP` 共用預載；`setupEnvironment` 後先建 `Effects`、`post.applyWorld` 再背景 `compileAsync`；`applyEnvIntensity` 在 weapons 還沒建時跳過槍模。
  - `15_postfx.js`：`configure` 拆出 `applyWorld(match, q)`、`_composer(match, q)`。
  - `17_app.js`：`warm()` 在房間就呼叫 `def.preload()`。
- 素材：兩張 Apex 地圖的 `pack/` 重新打包（碰撞 STRZ：Skull Town 10.4 → 2.3 MB、訓練場 8.9 → 2.2 MB）；`tools/pack-apex-js.mjs` 的 `strz()`。
- 工具：`tools/_loadprof.mjs`（各載入階段計時，`LOBBY=` `PROFILE=` `RUNS=`）。
- 驗證（合併後）：`analyze.mjs` MODULES_OK、`build.sh`、`check.mjs`、`check-apex-full` 都過。

### L1 ✅ H1：apex.source.gs 29 把槍的完整頁面（2026-10-28）
- 輸出：`docs/research/apex/source-gs-s30/<slug>.html`（原始頁面，29 個）＋ `<slug>.md`（`<main>` 逐行轉文字：標題、每個欄位和值，照網頁順序；29 個），共 6.4 MB。
- 工具：`tools/fetch-source-gs.py`（每頁間隔 3 秒；`--md-only` 只重轉）。
- 驗證：29／29；`r-301-carbine.md` 有 15（傷害）、810（RPM）、737（m/s 初速）。
- 頁面內容：傷害（身／頭／腿＋倍率、爆頭距離上限）、射速、彈匣與各級擴容、換彈（一般／空彈匣）、拔槍／收槍／舉槍／放下、開鏡／離鏡時間、開鏡 FOV、開鏡移速、彈道（初速、阻力、重力倍率、歸零距離、壽命）、腰射散布（站／蹲／空中）、開鏡散布、後座倍率（垂直／水平）、每個配件各級數值。
- 注意：頁尾寫 `build 11630615 · updated 2026-10-07`，頁面上沒寫賽季編號；是不是 S30.1 要雲端對照。後座只有「倍率」，沒有逐發後座圖案。
