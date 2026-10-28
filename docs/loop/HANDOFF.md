# 雲端 ↔ 本機 工作交接

> 雲端 session 做不到的事寫在「待本機」；本機 Claude Code 做完後移到「本機已完成」，並寫明輸出路徑。
> 本機只 push 到 `local/assets` 分支，雲端每輪會把它合進 `claude/intelligent-einstein-vgvrqy`。
> 狀態：⬜ 未開始 · 🔄 進行中 · ✅ 完成 · ⏸ 需要使用者本人

## 待本機（雲端寫，本機做）

### H1 ⬜ 抓 Apex S30.1 每把槍的完整頁面（雲端被網路政策擋住）
- 來源：`https://apex.source.gs/weapons/<slug>/`，29 把槍。slug 照 `docs/research/apex/weapons-2026-10-27.json` 每把槍的 `source`。
- 輸出：`docs/research/apex/source-gs-s30/<slug>.html`（原始 HTML）和 `<slug>.md`（把頁面上所有欄位逐條轉成文字）。要包含散布、後座、拔槍時間、彈道、各級配件的數值，頁面有多少就抓多少。
- 驗證：29 個檔都有；`r-301-carbine.md` 裡找得到 15、810、737 這幾個數字。

### H2 ⬜ 抓公開的 TTK 表和 wiki 數值，給雲端比對
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

（空）
