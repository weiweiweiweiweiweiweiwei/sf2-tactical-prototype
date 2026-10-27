# 協作規則（兩個 Claude Code 帳號共用這個專案）

> **2026-10-27 停用**：使用者決定第二個帳號改做別的專案，本專案只有 A 在做；`.worktrees/b` 和 `collab/b` 已移除（沒有任何提交）。保留這份規則，之後若重新啟用可照用。

> 使用者：WEI。A＝原本的 Claude Code（主線、Apex 地圖）；B＝第二個帳號。
> 兩邊開工前都要先讀這份檔案。改了這份檔案的「鎖定表」或「留言板」，就跟著自己的下一個 commit 一起提交。

## 1. 各自在哪裡工作

| | 資料夾 | 分支 | 可以做 |
|---|---|---|---|
| **A** | `Online Game\`（專案根目錄） | `master` | 提交、合併 B 的分支、推上 GitHub（使用者說「推上去」時） |
| **B** | `Online Game\.worktrees\b\`（git worktree，已被 .gitignore 排除） | `collab/b` | 只在自己的分支提交；**不推、不合併、不改 master** |

- B 第一次開工：在專案根目錄執行 `git worktree add .worktrees/b -b collab/b`（已存在就略過），之後所有工作都在 `.worktrees\b\` 裡，並在那裡執行 `npm install`（worktree 不含 node_modules）。
- 要拿到 A 的新進度：B 在自己的資料夾執行 `git merge master`（不要 rebase）。衝突只出現在 `index.html` 時，直接 `sh src/build.sh` 重建後提交。
- B 的成果要進主線：由使用者告訴 A「合併 B」，A 合併 `collab/b`、跑檢查、推上去。

## 2. 檔案歸屬（不屬於自己的檔案不要改）

**A 專屬**（Apex 地圖、碰撞、物理、導航）
- `src/04_collision.js`、`src/05_physics_fx.js`、`src/07u_apex.js`、`src/07v_apex_full.js`、`src/07w_skulltown.js`、`src/08_nav_input.js`
- `tools/blender/skulltown_*.py`、`tools/blender/apex_*.py`、`tools/pack-apex-js.mjs`、`tools/bake-apex-nav.mjs`、`tools/compress-apex-textures.py`
- `tools/check-apex-*.mjs`、`tools/_skull*.mjs`、`tools/_walkprobe.mjs`、`tools/_stuckprobe.mjs`、`tools/_trimesh.mjs`、`tools/_apex*.mjs`、`tools/_doorpairs.mjs`
- `assets/maps/apex-*`、`tools/out/apex/`

**B 專屬**（槍枝、AI、HUD 稽核）
- `src/09b_gunparts.js`、`src/10_weapons.js`、`src/11_weaponsystem.js`、`src/13_bots.js`、`src/14_hud.js`
- `tools/guns/`、`tools/blender/*_build.py` 裡的槍（`g36c_build.py`、`m4a1_build.py` 這類）、`tools/blender/gunlib.py`、`assets/guns/`
- B 新增的檔案（`tools/_b_*.mjs` 這種前綴最好認）

**共用檔案**（要改先在下面的鎖定表登記，改完提交後刪掉那一行）
- `src/00_head.html`、`src/01_core.js`、`src/12_player.js`、`src/16_match.js`、`src/17_app.js`、`src/18*.js`、`src/build.sh`、`src/02_audio.js`、`src/03_textures.js`、`src/06_mapbuilder.js`、`src/07_maps.js`、`src/09_models.js`、`src/15*.js`
- `README.md`、`CLAUDE.md`、`.gitignore`、`package.json`
- `index.html`：**由 `sh src/build.sh` 產生，不要手改**；合併衝突一律重建。

### 鎖定表

| 檔案 | 誰 | 開始 | 為了什麼 |
|---|---|---|---|
| （目前沒有） | | | |

## 3. 共同規矩

1. **回覆使用者用繁體中文。** 進度報告和下一步寫在同一則訊息（見 `CLAUDE.md`）。
2. **git 身分**：`git -c user.name=WEI -c user.email="$(git config user.email)"`（noreply 信箱，不要用 Gmail）。
3. **commit 格式**：`[Mx] 區塊: 說明…`，結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`（B 用自己模型的名字也可以）。
4. **不要做的事**：強制推送、改寫已提交的歷史、刪除不是自己建立的檔案、改專案以外的檔案、修改對方的專屬檔案。需要對方改的地方寫在留言板。
5. **建置與檢查**：改了 `src/` 就跑 `sh src/build.sh`（要看到 `BUILD_OK`）；提交前至少跑 `node tools/check.mjs`。
6. **重型工作一次一個**：Blender 烘焙、`bake-apex-nav.mjs` 會吃滿 GPU／CPU。開始前看一下 `tasklist | grep -i blender`，有人在跑就先做別的；效能數字（fps）在對方跑重型工作時不準，註明一下。
7. **進度紀錄**：A 寫 `PROGRESS.md`；B 寫 `docs/progress-b.md`（合併時 A 把重點併進 PROGRESS）。
8. **使用者的偏好**（兩邊都適用）：按 E 互動、Shift 只衝刺、按住 Ctrl/C 蹲不會掉下邊緣、沒有滑鏟；Apex 模式沒有跌落傷害、每秒回 5；推上 GitHub 一定要等使用者說。

## 4. 留言板（新的寫在最上面，格式：日期 · 誰 → 誰：內容）

- 2026-10-27 · A → B：歡迎。你的任務在 `docs/handoff-b.md`。我這邊正在修 Apex 地圖的台階／接縫，會改 `src/04_collision.js`（A 專屬），不會碰你的檔案。
