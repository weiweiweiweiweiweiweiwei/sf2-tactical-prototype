# 雲端 loop 規則（Claude Code 雲端 session）

> 由排程任務每小時叫醒一次，每次照本頁做一輪。改規則只要改這個檔，不用改排程。
> 本機那邊的規則在 [`LOCAL.md`](LOCAL.md)，兩邊靠 [`HANDOFF.md`](HANDOFF.md) 交換工作。

## 分支規則（最優先）
- 只在 `claude/intelligent-einstein-vgvrqy` 開發和 push。
- 不 push、merge、rebase 到 `master`（這個 repo 的 main），不開 PR，不開 auto-merge。
- 每輪開始時，用 merge（不要 rebase）把 `origin/master` 和本機分支 `origin/local/assets`、`origin/local/user` 合進來（遠端有這兩個分支、而且有新 commit 時才合）。解完衝突、驗證過再繼續。

## 每輪
1. `git pull`，讀 `PROGRESS.md`、`docs/TODO.md`、`docs/DECISIONS.md`、`docs/loop/HANDOFF.md`、最近 10 筆 git log。
2. 環境準備（容器可能是新的）：`npm ci && npm install --no-save three@0.170.0 cannon-es@0.20.0`。
3. **一輪連續做多項**，直到這一輪大約做了 45 分鐘，或對話太長為止。每做完一項都要：驗證 → commit → push。這樣容器中途被回收也不會丟東西。
4. 挑選順序：
   - `HANDOFF.md` 裡本機交回來、還沒處理的成果（例如抓回來的網頁、匯出的模型）
   - 使用者回報的問題
   - ❓ 項目：照推薦的選項做，記在 `DECISIONS.md`
   - 大功能
5. 需要本機的工作（D 槽的 SF2／Apex 安裝檔、真實顯卡、這個環境連不上的網站），不要停下來等：寫進 `HANDOFF.md` 的「待本機」區（寫明要做什麼、輸出到哪個路徑、怎麼驗證），TODO 標「⏸ 本機」，然後換下一項。
6. 太大的項目先拆成細項寫進 TODO，一次做一個細項。

## Apex 槍枝（優先度和 TODO 第 0 節同級）
照 `docs/TODO.md` 第 3 節的細項：扣血接線 → TTK 自動測試 → 散布和後座 → 配件系統。
- 數值來源：`docs/research/apex/weapons-full.json` 的 `current`（說明見 `docs/research/apex/README.md`）。
- 本機抓回 apex.source.gs 或 wiki 的頁面後，先用它們更新 `tools/apex_weapon_data.py` 的來源層（新增 `s30.1-full` 層，優先度高於 `s14`），再接遊戲。

## 實作規範
- 一個檔只能 import 比它早載入的檔（`src/main.js` 的順序）；新程式每個檔盡量 < 600 行。
- 改動要小、要可驗證，配合周圍程式碼的寫法和註解密度。
- 沒有使用者同意，不改已經照 SF2 截圖調好的數值（M4A1 的開鏡、後座等）。

## 驗證（全部通過才 commit）
1. `node tools/esm/analyze.mjs` → `MODULES_OK`
2. `sh src/build.sh` → `BUILD_OK`
3. `node tools/check.mjs` → `CHECK_OK`（雲端是軟體繪圖，FPS 不具參考性，只看錯誤）
4. 有改數值，就寫一個小腳本印出改前和改後的值，結果寫進 CHANGELOG。

失敗就修到過；修不好就 `git restore`，把原因寫進 TODO、標「⚠️ 卡住」，換下一項。

## 每項收尾
- 版本號 +1，更新 `docs/CHANGELOG.md`、`PROGRESS.md`、`docs/TODO.md`。
- commit 訊息格式：`[Mx] 類別: 說明 (vXX)`；有自選決策時加上 `(self-picked, see DECISIONS)`。
- `git push -u origin claude/intelligent-einstein-vgvrqy`（網路失敗時，依 2／4／8／16 秒重試）。
- 在 `docs/REVIEW.md` 追加一行：版本、commit、一句話說明、要使用者試玩或確認的地方。

## 第三者審查（雲端可做的項目剩不到 3 項時）
從效能、程式精簡、正確性（固定步長、連線、防作弊）、和 SF2／Apex 資料的落差、還能找的公開資料這幾個角度，新增最多 5 項到 TODO，每項附一句理由。不要重複已有的項目，也不要為了改而改。

## 停止
只剩「⏸ 本機」或「⚠️ 卡住」的項目，而且連續兩次審查都找不到有價值的新項目時：
1. 在 `DECISIONS.md` 最上面寫總結：做了哪些自選決策、哪些項目等使用者。
2. 在 `REVIEW.md` 最上面寫「併入前檢查」：比 `master` 多幾個 commit、改了哪些檔案、建議先試玩什麼、怎麼試玩。
3. 停用自己的排程任務（`update_trigger enabled=false`），然後告訴使用者：「分支已準備好，請確認後告訴我要不要併入 master」。
