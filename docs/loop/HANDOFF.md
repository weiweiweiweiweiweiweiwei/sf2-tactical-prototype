# 雲端 ↔ 本機 工作交接

> 雲端 session 做不到的事寫在「待本機」；本機 Claude Code 做完後移到「本機已完成」，並寫明輸出路徑。
> 本機只 push 到 `local/assets` 分支，雲端每輪會把它合進 `claude/intelligent-einstein-vgvrqy`。
> 狀態：⬜ 未開始 · 🔄 進行中 · ✅ 完成 · ⏸ 需要使用者本人

## 待本機（雲端寫，本機做）

### H3 🔄 SF2 原版素材（`D:\SpecialForce2`，UModel；流程見 `docs/pipelines/guns.md`「SF2 原版槍＋原版動畫」）
- M16A3：找平頂機匣的照門或瞄具零件（不在類別預設裡，搜尋 `weapon_common_part*`、`rif_m16a3*` 的全部零件）。找到後照第 7 步加進 `tools/sf2_rig_build.mjs`，再取消 `tools/sf2_weapon_table.py` 裡 m16a3 那行的註解。
  - 🔄 本機 2026-10-28 調查（還沒做完，下一輪接著）：
    - SF2 預設 M16A3（`wp_ar_m16a3`）只有槍管／機匣／彈匣／槍托四個零件；類別預設 `SightOnMesh = rif_m16a3_sight_up`（`SightBaseSocketName = Sight`），**沒有照門**。這個前準星是矮的折疊式（高 1.9 cm，頂端 1.183 m；機匣導軌頂 1.168 m、膛線 1.144 m）。
    - 可用的照門零件（`wp_common_part` 的配件）：`Common_M4_Handle`（零件 `Handle` → `weapon_common_part` 的 `dot_handle`，單骨頭 `weapon_scope`）、`common_m4a1_rearsight`（`rearsight_a` → `rif_m4a1_rearsight`）。兩者掛在機匣 `Scope` 插槽時覘孔高 1.2004 m，**比 SF2 自己的前準星頂端高 33 mm**——搭不起來。
    - `dot_handle` 用 `handle_d` 貼圖會變成灰白色（UV 不是這張），而且後端最高點是提把橫桿、不是覘孔片，不能照 M4A1 的 PEEP_DROP 算。
    - 改用 M4A1 自己的提把 `rif_m4a1_handle_a`＋A2 前準星（`railSights`，和 M4A1 一樣）：零件放得上，但 `V.handle` 的點是 **M4A1 綁定姿勢**的座標（OWNBIND），算出的 SIGHT 和 M4A1 完全一樣，開鏡錯位；要先把提把的點用 M16A3 的 `weapon_root` 綁定矩陣換算過去才行。
    - 這輪已全部還原（M16A3 仍是舊槍模），`sf2_weapon_table.py` 的 m16a3 仍註解。
- QBZ-97：提把上的瞄準線（現在眼睛落在照門本體上），對照 `.props.txt` 的插槽。
  - 🔄 本機 2026-10-28：暫時打開 qbz97 量開鏡（白底、世界隱藏，`tools/out/_ringcenter.mjs`＋`_ringmeasure.py`）：眼睛在一個大圓孔正中（偏 0／−9.5 px，孔寬 473 px @1080p），**但孔裡看不到前準星**。QBZ-97 的照門和前準星都在提把上，`POST` 現在是找「槍管中線前 25 cm 的最高點」（`hoodedPost`），可能抓到槍管上的點而不是提把前端的準星，眼睛高度就錯了。下一步：從側面分析提把前後兩端（前準星尖、覘孔中心）的高度，給 qbz97 自己的 SIGHT／POST。已還原（仍是舊槍模）。
  - 本機機匣高度剖面（`tools/out/_qbzprofile.mjs`，綁定空間、公尺，+Z 往槍口）：照門在 z 0.20–0.24（頂 1.194，中線頂 1.1937）；前準星在 z 0.32–0.38，兩側護耳 1.177、中線（準星尖）約 **1.148 @ z 0.355**——剛好在「槍管前 25 cm」搜尋範圍的邊緣，加上 `hoodedPost` 往下跳，POST 可能落在更低的點。下一步：qbz97 改成手動指定 POST（z 0.355 的中線最高點）並由 POST 往後量照門孔中心，再用白底量測驗證。
- ✅ MP5K（本機 2026-10-28，見「本機已完成」L3）。
- ✅ M4A1 第三人稱槍模（本機 2026-10-28，見「本機已完成」L4；接到 Bot 手上留給雲端）。
- 驗證：`node tools/check.mjs`、`node tools/_gunshot.mjs`（開鏡截圖存進 `docs/testing/shots/`）。

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
