# PROGRESS — Web 戰術 FPS

> 依 `CLAUDE.md.md` §0 / §3.1 維護：每輪開工前先讀，完成後更新（完成項、數值變更、下一步）。
> 目前版本：**v62c（2026-10-27）**。`versions/` 只保存重大改版的可遊玩單檔（使用者 09-25 指示），其餘版本在 git 歷史裡。
> `CLAUDE.md` 已在 v18 的 commit 中刪除，下表的「CLAUDE.md 要求」是當時的紀錄。

## 架構現況（和新版 CLAUDE.md 的差異，**待使用者決定**要不要遷移）

| 項目 | 現況（v17） | CLAUDE.md 要求 |
|---|---|---|
| Three.js | r160（importmap 鎖定版本） | 鎖定 r170 |
| 碰撞 | 自製 AABB 格網、坡道、地形高度場、梯子、攀爬、滑鏟、台階輔助 | Octree + Capsule |
| 物理 | cannon-es（手榴彈、彈殼、屍體） | cannon-es 只用於手榴彈 / 彈殼 / 掉落物 ✅ |
| 模組 | `src/` 21 個分檔，由 `sh src/build.sh` 串成單一 `index.html`（可雙擊遊玩，方便 `versions/` 保存） | 原生 ES Modules、`src/main.js` 加分資料夾、免建置 |
| 檔案長度 | 5 個檔超過 600 行：07_maps 762、09_models 705、06_mapbuilder 691、16_match 685、13_bots 655 | 每檔 < 600 行 |
| 自動檢查 | ✅ `node tools/check.mjs`（Playwright 1.63.0，驅動系統已安裝的 Chrome / Edge） | ✅ |
| 版本控制 | ✅ git（v17 起） | ✅ |

## 里程碑對照（✅ 完成 · ⚠️ 部分 · ❌ 未做 · 🔍 尚未稽核）

- **M0 基礎建設**：✅ importmap、遊戲迴圈、Pointer Lock、ACES＋環境貼圖＋陰影、check.mjs、PROGRESS.md、git。⚠️ 模擬迴圈只有移動是固定步長（1/120），AI、武器、規則仍用可變 dt（規範要求 60 Hz 固定步長）。⚠️ 目錄結構見上表。
- **M1 移動與射擊**：✅ 移動、Hitscan、ADS 插值、鏡頭＋槍模雙層後座力、槍口火焰、退殼、火花、Hitmarker、音效、滑鏟、攀爬。
  - 🔍 未稽核：各槍種開鏡時間（0.15–0.35 s）、每槍前 10 發彈道表、散佈倍率（移動 ×2、跳 ×4、蹲 ×0.7）。
  - ❌ 未做：狙擊 Shift 屏息 3 秒。
- **M2 戰術 AI**：✅ 部位 hitbox、狀態機、開火橫移、受擊閃避、壓制反應、包抄、搜索。
  - 🔍 未稽核：反應時間是否為 700 / 450 / 300 ms、橫移 ≥ 2.5 m/s、低血量撤退。
  - ❌ 未做：F3 AI 除錯顯示。
- **M3 大地圖**：✅ 山嶺前哨 280×280（地形、陡坡、多層建築、梯子）、導航圖、前進重生點。✅ v18：7 張圖的出生點互視都是 0。
- **M4 武器**：✅ 31 把槍、副武器、刀、切換、倉庫卡牌配裝（v20）。✅ v21 起資料欄位改為 `damageNear` / `damageFar` / `falloffStart` / `falloffEnd`。
- **M5 投擲物與拾取**：✅ 手榴彈、閃光彈、煙霧彈（蓄力 ≤ 1 s）、死亡掉槍、E 拾取。⚠️ 按鍵是 4 / 5 / 6，規範是 G / 4。
- **M6 模式與 HUD**：✅ 團隊死鬥、回合殲滅、奪取、佔領、計分板、雷達、擊殺欄、Killcam。
- **M7 打磨**：✅ v17 電影感調色（見下）、效能優化（v12）。
- **M8**：❌ 爆破模式。
- **規範外（使用者 2026-09-25 已同意的路線）**：連線對戰 v18–v21，採瀏覽器房主制 WebRTC 加 Supabase Realtime。詳見 `C:\Users\WEI\.claude\plans\index-2-online-steady-kitten.md`。

## 待辦

見 [`docs/TODO.md`](docs/TODO.md)（大方向 → 細項）。舊的待辦紀錄在 [`docs/archive/TASKS-2026-10.md`](docs/archive/TASKS-2026-10.md)。

## 已知問題

- **Chrome 預設顯卡會在內顯與 GTX 之間切換**（09-25 同一天內實測：早上預設 GTX，傍晚變成 Intel UHD）。遊戲已能在兩者都跑 60 FPS（見 v24），要固定用 GTX 需在 Windows 設定 → 系統 → 顯示器 → 圖形，把 Chrome 設為「高效能」。`tools/check.mjs` 預設用 `--use-adapter-luid` 固定 GTX，`--gpu intel` 可改測內顯。

- ~~Draw calls 在交戰時超過 300~~ ✅ v22 已解決（交戰中 126–234）。
- **Playwright 內建 Chromium 下載逾時**（cdn.playwright.dev 無法連線）。check.mjs 改用系統 Chrome，其次 Edge，不需要另外下載瀏覽器。
- 無頭 Chrome 跑在 GTX 1650 Ti 上會被 vsync 限制在約 60 FPS，所以 avgFps 只能看「是否掉幀」。要知道 GPU 餘裕請看 frameMs。

## 版本紀錄

每一版做了什麼、數值、怎麼驗證：[`docs/CHANGELOG.md`](docs/CHANGELOG.md)（v17 起，最新的在最後面）。
