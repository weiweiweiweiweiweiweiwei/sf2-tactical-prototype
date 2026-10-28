# 雲端 ↔ 本機 工作交接

> 雲端 session 做不到的事寫在「待本機」；本機 Claude Code 做完後移到「本機已完成」，並寫明輸出路徑。
> 本機只 push 到 `local/assets` 分支，雲端每輪會把它合進 `claude/intelligent-einstein-vgvrqy`。
> 狀態：⬜ 未開始 · 🔄 進行中 · ✅ 完成 · ⏸ 需要使用者本人

## 待本機（雲端寫，本機做）

### H9 ⬜ 先做：回報 `master` 怎麼被推上去的
- 2026-10-28 12:16（+08:00）左右，遠端 `master` 從 `64bc56a` 變成 `f1d39c0`（`local/assets` 的合併 commit），沒有經過 PR #1。
- 請在這裡寫：是哪個指令推的（`git push` 預設推到 master？還是 upstream 設定錯？），並檢查 `git config branch.local/assets.merge`、`git config push.default`，修好後寫上修法。`master` 不要再動，等使用者決定。

### H8 ⬜ 其他 SF2 原版槍的第三人稱槍模
- v63f 遊戲端已經通用：`tools/guns/<weapon id>_3rd.glb`（UModel 座標＋`MUZZLE`／`SCOPE` 標記，和 `m4a1_3rd.glb` 一樣）打包進 `guns.js` 後，Bot 和其他玩家手上就會用它（`src/09_models.js` 的 `GUN_3RD`）。
- 依序做：ak103、g36c、k2、scarl、scarh、famas、xm8、galil、hk417、mp5k、m16a3、qbz97（`node tools/sf2_3rd_build.mjs <id>`，再 `node tools/guns/pack.mjs`）。沒有 `_3rd` 零件的槍標 ⏸ 並寫原因。
- 驗證：`check.mjs`；遊戲中截一張 Bot 拿槍的側面圖，和 `docs/testing/shots/m4a1_3rd_ingame.png` 比對位置。

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

### L2 ✅ H2：apexlegends.wiki.gg 29 把槍的數值表＋TTK（2026-10-28）
- 輸出：`docs/research/apex/web/wiki-<slug>.md`（29 個；每頁所有表格照原樣轉 Markdown，放在原本的章節標題下，附網址和日期）：Damage Profile（**Shots to kill**：100／150／175／200／225 HP × 頭／各級頭盔／身／Fortified／腿，以及 Amped Cover、Sniper's Mark 加成）、**Advanced Stats**（遊戲內部變數：fire_rate、projectile_launch_speed、headshot_distance、spread_stand_hip／run／sprint、crouch／air、ads、deploy／holster／raise／lower、zoom_time_in／out、ads_move_speed_scale …）、Weapon Mastery、History。
- `docs/research/apex/web/ttk-from-wiki.md`：由 Shots to kill（身體）和 fire_rate 算出的 TTK 總表。
- 工具：`tools/fetch-wiki-gg.py`（MediaWiki API `action=parse`，間隔 3 秒）。
- 驗證：29／29 都有網址和日期；有 Shots to kill 表的槍 **28／29**（Bocek 是依拉弓程度的另一種表）；能直接算 TTK 的 19 把。
- 注意：wiki 沒有叫「TTK」的表（只有 Mozambique 頁面提到），TTK 是用發數 ÷ 射速算的；栓動槍的 fire_rate 不像實際拉栓間隔，見 ttk 檔的註記。wiki 的 spread 是「半徑」（R-301 站立腰射 6.5），source.gs 寫 3°，兩邊單位不同，比對時要注意。

### L3 ✅ H3 的 MP5K：SF2 原版衝鋒槍（2026-10-28）
- 匯出（不 commit）：`tools/out/sf2/mp5k/`（`smg_mp5k` 模型、`smg_mp5k_texture`、`Sound_MP5K`）、`tools/out/sf2/mp5k_anim/`（`1st_anim_mp5k.psa`、插槽）。
- 成品：`tools/guns/mp5k_sf2_rig.glb`（791 KB，15 段動畫；`tools/sf2_rig_build.mjs` 的 `mp5k`：`pkg/stem smg_mp5k`、`hoodedPost`、前準星 `smg_mp5k_sight_up` 掛 `Sight` 插槽、貼圖用 `mp5k_barrel`）；`assets/guns/guns.js` 重新打包；`assets/sfx_sf2.js` 加 6 組 `sf2_mp5k_*`（原有 66 組一個位元組都沒變）。
- **改到 `src/`（照 H3 第 7 步，盡量小）**：
  - `src/01_core.js`：`WEAPON_DATABASE.mp5k`（傷害照 MP5 的平衡：25／16，10–35 m；`sound: 'mp5'` 備用、`sf2: 'mp5k'`）、說明文字、`general`／`rifle` 兩個模式清單加在 `mp5` 後面；`SF2_WEAPONS` 由 `tools/sf2_weapon_table.py` 重新產生（新增 mp5k：射速、換彈、拔槍、FOV、`vLocZoomIN`、後座 `sf2Recoil`）。
  - `src/09_models.js`：`mp5k(def)` → `fromRig('mp5k_sf2_rig')`，備用 `mp5`。
- 換彈音效時間（量 Reload 片段 65 格的 `weapon_magazine`／`weapon_cartridge`）：0.17／0.48／0.77（`tools/out/_reloadtimes.py`，同方法量 AK-103 得 0.14／0.46／0.82）。
- 驗證：`analyze.mjs` MODULES_OK、`build.sh`、`check.mjs` 過；`_gunshot.mjs mp5k`（FIRE=1）開鏡時照門鼓（刻字 HK NO.5 99051-A）和前準星護圈對齊、準星在中央，開火有 SF2 火光；截圖 `docs/testing/shots/mp5k_hip.jpg`、`mp5k_ads.jpg`。
- 留給雲端：Bot 配槍清單、倉庫卡片排序、第三人稱 `tp` 外形（目前用預設）。

### L4 ✅ H3 的 M4A1 第三人稱槍模（2026-10-28）
- 原始匯出：`tools/out/sf2/m4a1_3rd/`（`rif_m4a1_{body,barrel,stock,magazine}_3rd`，不 commit）。
- 成品：**`tools/guns/m4a1_3rd.glb`**（222 KB，Draco、WebP 512 貼圖）；工具 `tools/sf2_3rd_build.mjs [m4a1]`。
- 座標：UModel 原樣（公尺、Y 朝上、**槍口朝 +X**），沒轉成 gunlib 的槍座標。四個零件共用 4 根骨頭的綁定姿勢，頂點直接用。材質 `gun:tex_m4a1_<part>`，貼圖和第一人稱同一套（SF2 沒有另外的第三人稱貼圖）。
- 標記（空物件，公尺）：`MUZZLE` (0.497, 0.087, 0)、`SCOPE` (0.073, 0.109, 0)、`GRIP` (0.205, 0.064, 0)、`STOCK` (−0.016, 0.087, 0)——來自 `rif_m4a1_body_3rd.props.txt` 的插槽 `flame`／`Scope`／`Grip`／`stock`。
- 注意：平頂機匣，**沒有照門和前準星**（第一人稱的提把 `rif_m4a1_handle_a` 沒有 `_3rd`；`weapon_common_part` 有 `dot_handle_3rd` 可以掛在 `SCOPE`，但它的貼圖還沒對上，見 H3 M16A3 的調查）。
- 注意：`tools/guns/pack.mjs` 會自動把 `tools/guns/` 裡所有 .glb 打進 `assets/guns/guns.js`（多約 300 KB，遊戲會把它當成一把槍模解析）；本機沒有打包它，接 Bot 時再打包。
- 注意：`tools/guns/pack.mjs` 會自動把 `tools/guns/` 裡所有 .glb 打進 `assets/guns/guns.js`（多約 300 KB，遊戲會把它當成一把槍模解析）；本機沒有打包它，接 Bot 時再打包。
- 驗證：Blender 預覽 `docs/testing/shots/m4a1_3rd_side.png`（gun_preview.py 是照 gunlib 座標取景，所以畫面偏）。

### L5 ✅ H5：Apex 原版 R-301 槍模和槍聲（2026-10-28）
- Apex 有裝（Steam：`C:/Program Files (x86)/Steam/steamapps/common/Apex Legends`），RSX 2.4.0 匯出。流程：**`docs/pipelines/apex-guns.md`**（新）。
- 原始匯出（不 commit）：`tools/out/apex/r301/`（`mdl/r301_base_v`、`r301_base_w` 的 CAST、資產清單 CSV、`audio/audio/*.wav` 14 個音源）。
- 成品：
  - **`tools/guns/apex_r301.glb`**（335 KB）：第一人稱模型的機匣、預設彈匣、機械瞄具，材質 `gun:tex_apex_r301`（顏色、法線、粗糙度，1024 WebP）。工具 `tools/blender/apex_gun_build.py`（先系統 Python 做貼圖，再 Blender 組模型）。
  - **`tools/guns/apex_r301_sfx/*.wav`**（11 個、2.4 MB，16-bit 立體聲）：fire_first／fire_loop／fire_tail／fire_single／magout／maggrab／magin／boltback／boltfwd／draw／adsin。工具 `tools/apex-sfx.mjs`。
- 注意：模型還在 Apex 的模型空間（英寸 → 公尺），**沒有轉成 gunlib 槍座標、沒有 MUZZLE／SIGHT 標記**，也還沒接進遊戲和音效包（留給雲端）。`tools/guns/pack.mjs` 會自動把 `apex_r301.glb` 打進 `guns.js`，本機沒有打包。
- 驗證：GLB 有 1 個材質、3 張貼圖（顏色、金屬粗糙、法線）、3 個網格；尺寸 0.88 m 長 × 0.26 m 高（和實槍相近）；Blender 預覽 `docs/testing/shots/apex_r301.jpg`。

### L6 ✅ H4：真實顯卡效能檢查（2026-10-28）
- 輸出：**`docs/testing/gpu-2026-10-28.md`**（三張表原樣貼上＋摘要）。
- GTX：16 張全部 59–60 fps；**失敗只有 hangar 出生點互看 1/256**（另外兩次 0/256，偶發）。
- Intel UHD：全過，平均 52–58 fps，但 warehouse、desert、harbor、office、ridge、satellite、ryokan 的 p95 ≈ 33 ms（常掉 30 fps），ryokan p99 49.8 ms 最差。
- GTX 不鎖幀：平均 206–429 fps；snow、dam 有週期性尖峰（p95 27.8／23.3 ms）。
- 注意：`--map all` 不含天空城、兩張 Apex 地圖。

### L7 ✅ H3 的 M16A3：SF2 原版槍＋照門（2026-10-28）
- 原因（兩個）：①SF2 的 M16A3 類別只裝矮的折疊前準星（`rif_m16a3_sight_up`，高 1.9 cm），**沒有照門**；任何照門的覘孔都比它高 33 mm。②**`tools/guns/pack.mjs` 的 `SKIP` 一直把 `m16a3_sf2_rig.glb` 排除**，所以先前所有 M16A3 開鏡測試看的其實是舊槍模。
- 做法：M16A3 用 M4A1 那組——M4A1 的提把 `rif_m4a1_handle_a`（同一款 AR-15 上機匣，`handle_d` 貼圖）＋ A2 前準星放在瞄準線上（`railSights`，真的 M16A3 也是這組）。眼睛在提把後 5.5 cm（和 M4A1 一樣）。
- 修了一個通用問題：有自己綁定姿勢的零件（OWNBIND），`addPart` 回傳的點原本是**零件自己的**綁定座標；現在用每根骨頭的 inv(機匣 IBM) × 零件 IBM 換到機匣的綁定空間（`toBody`，新的 `inv4`）。M4A1 的提把也是 OWNBIND（差 1.3 mm），`PEEP_DX` 0.00136 → 0.00006 抵銷，M4A1 的 SIGHT 不變（rig 沒重打包）。
- 改到的檔：`tools/sf2_rig_build.mjs`（m16a3 設定、`toBody`／`inv4`、`PEEP_DX`）、`tools/sf2_weapon_table.py`（m16a3 打開）、**`src/01_core.js`**（`SF2_WEAPONS` 重新產生，多 m16a3）、**`src/09_models.js`**（`_rigOpts`：m16a3 的 `eyeRelief` 0.055）、`tools/guns/pack.mjs`（`SKIP`：拿掉 m16a3，加上還沒接進遊戲的 `m4a1_3rd.glb`、`apex_r301.glb`；qbz97 仍跳過）、`tools/guns/m16a3_sf2_rig.glb`、`assets/guns/guns.js`。
- 驗證：白底量測覘孔中心差 1.4／−0.5 px（1080p），孔寬 268 px（和 M4A1 一樣）；`check.mjs`、`analyze.mjs` 過；開鏡連射鏡頭上飄 3.35°；截圖 `docs/testing/shots/m16a3_ads.jpg`、`m16a3_hip.jpg`。

### L8 ✅ H3 的 QBZ-97：SF2 原版槍＋提把瞄準線（2026-10-28）；H3 全部完成
- 原因：①和 M16A3 一樣，`tools/guns/pack.mjs` 的 `SKIP` 一直排除 `qbz97_sf2_rig.glb`（之前看到的是舊槍模）；②它的照門、前準星都在提把上，自動找的 POST 停在槍管上，眼睛在照門下方；③犢牛式，頭部骨頭在照門塊裡面。
- 做法：`tools/sf2_rig_build.mjs` 新增 `sightMarks`（手動指定 SIGHT／POST）：qbz97 的 SIGHT (−0.1015, **1.1883**, 0.205)、POST (−0.1015, 1.1483, 0.36)——x 取照門孔左右壁中點（`tools/out/_qbzhole.mjs`），高度用白底開鏡截圖逐步校正（1.1604 → 1.1692 → 1.181 → 1.1883，約 44 px／mm）。眼睛在 SIGHT 後 6 cm（`src/09_models.js` 的 `RIG_EYE`，和 M16A3 的 5.5 cm 一起）。
- 改到的檔：`tools/sf2_rig_build.mjs`、`tools/sf2_weapon_table.py`（qbz97 打開）、**`src/01_core.js`**（`SF2_WEAPONS` 重新產生，10 把）、**`src/09_models.js`**（`RIG_EYE` 表取代 L7 的單一判斷）、`tools/guns/pack.mjs`（`SKIP` 只剩 m4a1_sf2、m4a1_3rd、apex_r301）、`tools/guns/qbz97_sf2_rig.glb`、`assets/guns/guns.js`。
- 驗證：白底量測前準星護圈孔中心差 −0.3／−1.0 px（1080p），後照門環也在正中；`check.mjs`、`analyze.mjs` 過；開鏡連射上飄 2.50°；截圖 `docs/testing/shots/qbz97_ads.jpg`、`qbz97_hip.jpg`。
