# 本機 loop 規則（使用者電腦上的 Claude Code）

> 本機負責雲端做不到的事：D 槽的 SF2／Apex 安裝檔、真實顯卡、雲端連不上的網站。
> 工作清單在 [`HANDOFF.md`](HANDOFF.md) 的「待本機」。雲端的規則在 [`CLOUD.md`](CLOUD.md)。

## 分支規則（最優先）
- 只在 `local/assets` 分支開發和 push。分支不存在就從 `origin/claude/intelligent-einstein-vgvrqy` 建立。
- 不 push 到 `master` 或 `claude/intelligent-einstein-vgvrqy`，不開 PR。雲端每輪會把 `local/assets` 合進雲端分支。
- 每輪開始時，用 merge（不要 rebase）把 `origin/claude/intelligent-einstein-vgvrqy` 合進來，拿到雲端最新的 `HANDOFF.md`。
- 盡量不改 `src/` 的遊戲程式，那是雲端的範圍。素材、研究資料、`tools/` 的匯出腳本、`docs/testing/` 由本機負責。H3 必須改 `src/` 時，改動越小越好，並在 HANDOFF 寫清楚改了哪裡。

## 每輪
1. `git fetch origin`，把雲端分支合進 `local/assets`，再讀 `docs/loop/HANDOFF.md`。
2. 從「待本機」挑第一個 ⬜ 或 🔄 的項目，標成 🔄 並 commit（讓雲端知道你在做）。
3. 照項目寫的輸出路徑和驗證方式做。一輪可以連續做多項，但每完成一項就 commit 並 push 一次。
4. 做完一項：把它從「待本機」移到「本機已完成」，寫上輸出路徑、數量和驗證結果；遇到的問題也寫上（例如某個網址 404）。
5. 做不到的項目（例如 Apex 沒裝、需要使用者本人截圖）：標 ⏸ 並寫原因，然後換下一項。不要停下來問。
6. 「待本機」全部是 ✅ 或 ⏸ 時：用 `/loop` 的停止方式結束迴圈，最後回報一段總結。

## 驗證
- 抓網頁：檔案數、抽查數字（見各項目）。網站擋爬蟲時放慢速度（每頁間隔 3 秒）；還是不行就標 ⏸ 並寫原因。
- 改到建置或遊戲：`node tools/esm/analyze.mjs`、`sh src/build.sh`、`node tools/check.mjs` 都要通過。
- commit 訊息格式：`[Mx] 類別: 說明 (local)`，結尾加上 Claude Code 預設的 Co-Authored-By 行。

## 不要做
- 不要把整個遊戲安裝檔或大型原始素材 commit 進來（`tools/out/` 已在 `.gitignore` 的話保持原樣）；只 commit 最後要用的成品和流程文件。
- 不要改 `docs/DECISIONS.md` 裡雲端的決策；本機有要使用者決定的事，寫在 HANDOFF 的 H6。
