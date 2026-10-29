# 槍枝迴圈（使用者 2026-10-28：「一直運行直到把所有槍枝和周邊都製作完畢，我再一次測試」）

每一輪照下面做，**不要停下來問使用者**；做不到的標 ⏸ 寫原因，換下一項。佇列全部 ✅ 或 ⏸ 時停止迴圈並總結。

## 規則
- 只在 `local/assets` 工作；每完成一把：驗證 → 更新本檔佇列、`docs/CHANGELOG.md`、`docs/TODO.md` → commit（`[M4] Guns: … (local)`，結尾 Co-Authored-By）→ `git push origin local/assets`。**不推 master**（使用者測完再說）。
- git 身分：`git -c user.name=WEI -c user.email="$(git config user.email)"`。
- 不動 `maps/`、使用者的 `.blend`、`music/`、`rea-cn/`。不刪資料。
- 平衡：傷害照 CLAUDE.md §4.2 與同類現有槍（狙擊槍照 K14：damageNear 110）；射速、換彈、拔槍、開鏡、後座、重量一律用 SF2 原始資料（`tools/sf2_weapon_table.py`、`tools/sf2_weight_table.py`）。
- 檔案大小：`assets/guns/guns.js` 目前約 23 MB。**超過 60 MB 就停下**，在本檔「⏸ 需要使用者」記下，迴圈停止（載入時間是使用者在意的）。
- 每輪結束前：`sh src/build.sh`、`node tools/esm/analyze.mjs`（MODULES_OK）、`node tools/check.mjs`（CHECK_OK）。

## 一把槍的做法（照 TRG-41，v64s）
> v65k 型態（同一把槍加瞄具／消音器，`GUNS` 裡另一個 key、`dir` 指向底槍）會輸出成配件檔 `tools/guns/<id>_sf2_ovl.glb`，遊戲把它綁到底槍 rig 上（`sf2Variant`）。
1. **匯出**：`sh tools/sf2_export.sh <id> <pkg> <Sound_pkg> [<pkg>_texture]`；鏡子 `sh tools/sf2_export.sh --part <包> <物件> [<貼圖包> <貼圖> …]`。新的十字：`python tools/sf2_reticle_svg.py <名> <Diffuse.png> [<dot.png>]` 直接轉成 SVG。聲音檔字首和 id 不同時寫 `<id>@<字首>`。（原始指令：`tools/out/umodel_win32/umodel_64.exe -game=sf2 -path=D:/SpecialForce2/SFGame/CookedPCConsole`，在該目錄執行）：
   - `-export -gltf -png -out=../sf2/<id> <pkg>`，有 `<pkg>_texture` 包時另外匯出到同一個資料夾；
   - `-export -psk -out=../sf2/<id>_anim <pkg>`（動畫 `.psa`、槍身 `.props.txt` 的插槽）；
   - `-export -sounds -out=../sf2/<id> Sound_<槍>`。
   - 一次只能給一個包名（第二個參數會被當成物件名）。手槍包整包 `-psk` 匯出會卡住：用 `tools/out/_pistol_export.py` 逐個物件匯出。
2. **鏡子／瞄具**：看 `SFCItem_<槍>` 的 `DefaultItemClassNames`（`tools/sf2_props.py`），找鏡子零件的 `ScopeMesh`／`MeshData`／`SightCrosshair`。鏡子網格在 `weapon_common_part`（scope_awp、scope_cheytac、scope_cz700、scope_dragunov、scope_pm2、scope_pm50、scope_psg-1、scope_sr25…）或 `weapon_common_part01`。用 `-export -gltf -png -out=../sf2/parts <包> <物件>`，`-export -psk -out=../sf2/parts_props <包> <物件>` 匯出。**每顆鏡子都要試 `ROLL=0` 和 `ROLL=90` 兩張腰射截圖比對**（根骨骼一樣也不代表網格方向一樣：Bender／CZ700 要 90，Zeiss 要 0）；正確的樣子是高低轉鈕朝上、鏡環在下面架在導軌上。之後建模腳本會自動「鏡片中心對準槍膛、最低點貼齊插槽」（v64u），看 log 的 `SQUARE` 位移：超過 1 cm 通常表示轉向錯了。
3. **建模**：`tools/sf2_rig_build.mjs` 加 `gun('<id>', { pkg, stem, tex, anim, optic })`。動畫檔名不一定是 `1st_anim_<id>`，看 `<id>_anim/<pkg>/AnimSet/`。執行 `node tools/sf2_rig_build.mjs <id>`，再 `node tools/guns/pack.mjs`。
4. **數值**：`tools/sf2_weapon_table.py` 的 GUNS 加一行（換彈音效時間點看 Reload 片段：PSA 的 ANIMINFO 格數）；跑 `PYTHONPATH=tools python tools/sf2_weapon_table.py`。`tools/sf2_weight_table.py` 的 MAP 確認有這把，跑一次。
5. **聲音**：`node tools/sfx_sf2.mjs <下面「聲音清單」全部> <新的>`，再把新 id 加進清單。
6. **遊戲端**：`WEAPON_DATABASE` 已有這把就只靠 SF2_WEAPONS 接上（`sf2Rig`）；沒有就新增定義和 `WEAPON_DESC`、倉庫清單。狙擊槍：`zoomHFovs: [fZoomedFOV, 20]`、`sf2Reticle`（新的十字要在 `src/00_head.html` 的 `#scope` 加一個 `svg.ret.<名>`，CSS 加對應選擇器；十字照 `common_sight` 的貼圖量，見 `docs/research/sf2/sniper-reticles.md`）。
7. **驗證**：`GUNID=<id> ONLY=hip,ads,ads2,fire TAG=<id> node tools/out/_rigshot.mjs`（看截圖：鏡子在槍正上方、手握得住、開鏡十字對）、`GUNID=<id> node tools/out/_reloadtime.mjs`、`node tools/check.mjs`。（`_rigshot` 的 reload 步驟把彈藥設 5，狙擊槍彈匣 5 會卡住，狙擊槍不要用 reload。）

聲音清單（`tools/sfx_sf2.mjs` 參數，每加一把就更新）：
`m4a1 ak103 g36c m16a3 k2 scarh famas xm8 galil hk417 qbz97 mp5k k14 trg m40a1 cz700 cheytac awp barrett@Barret kar98k@Kar98k_new sr25 psg1 frf2 m14ebr aug@AUGA3 sg551@SIG551 type89 ump45 mp7 mg4 k3 hk23e remington870@M870 benelli_m4@Bnlli ksg saiga12 p226@SIGP226 deagle@DesertEagle glock18@Glock17 m1911@Colt911 cz75@CZ75 jericho@Jericho914 sw60@SW60 infinity@Infi g36c_eo=g36c+silence hk417_rs=hk417+silence scarl_eo=scarh+silence acr an94 arx160 fnf2000 k2c1 mrr sar21 madsenlar@MedsenLar`

## 佇列（由上往下做）
狀態：⬜ 未做 · 🔄 進行中 · ✅ 完成 · ⏸ 做不到（寫原因）

### A. 使用者指定的狙擊槍
- ✅ TRG-41（v64s）
- ✅ M40A1（v64t；`sni_m40a1`，鏡 `Cz700_Def_Scope` → `scope_cz700`，十字預設 `mic_ScopeView`＝`tex_scope_Crosshair_Diffuse`＋`_dot`）
- ✅ CZ700（v64v；`sni_cz700`，同 M40A1 的鏡和十字）
- ✅ CheyTac M200（v64w；`sni_cheytac`，`scope_cheytac`，預設十字；`WEAPON_DATABASE.cheytac_m200`）
- ✅ AWP（v64x；`sni_awp`，`scope_awp`，預設十字）

### B. 周邊
- ✅ 魔術迴路（CircuitFX）版（v64x）：AWP、CheyTac、CZ700、K14 各加一把 `<id>_circuit`（`camo: 'circuit'`，照 `g36c_circuit`）
- ⏸ 第三人稱：不做（v63h 使用者選速度優先，士兵手上用程式槍）

### C. 其他狙擊／射手步槍（倉庫已有，換成 SF2 原版）
- ⏸ SVD（`sni_dragunov`，`scope_dragunov`）：PSO 鏡是側掛的，接在槍身 `Scope` 插槽上時跑到右上方、而且大小不對（放正位移 13.7 cm），一般的接法不適用，要手動對位或找它真正的掛點。遊戲裡維持原本的 SVD。建模設定留在 `tools/sf2_rig_build.mjs svd`
- ✅ Barrett（v64y；`sni_barret`，十字 `mic_ScopeView_03`）
- ✅ Kar98k（v64z；`sni_kar98k`，`Common_Scope_Kar98k`）
- ✅ SR-25（v65a；腰射時鏡子離鏡頭偏近，待校腰射位置；`sni_sr-25`，`scope_sr25`）
- ✅ PSG1（v65b；腰射偏近，同 SR-25；`sni_psg-1`，`scope_psg-1`）
- ✅ FR-F2（v65c；`sni_frf2`，`Common_Scope_PM2` → `mic_ScopeView_01`）
- ✅ M14 EBR（v65d；SF2 是 EOTech 步槍，2D 鏡拿掉；`rif_m14ebr`）

### D. 步槍、衝鋒槍、機槍、散彈槍、手槍（倉庫已有，換成 SF2 原版；沒有 SF2 包的標 ⏸）
- ✅ AUG（v65e）・SG 551（v65e）・Type 89（v65e；開鏡時照門擋住部分視野，待查）
- ✅ UMP45（v65f）・MP7（v65f）
- ⏸ P90（`smg_p90`）：環形瞄具（`smg_p90_dot_a／_b`，綁在槍身骨架上）沒有可對準的標記，開鏡時鏡頭落在槍身裡；要手動量瞄具中心（`sightMarks`）。建模設定留著，遊戲裡維持原本的 P90
- ⏸ PP-2000（`smg_pp2000`）、vz.61（`smg_scorpion`）：SF2 裡是雙持（槍身插槽 `flame_L`／`flame_R`、`ShellOut_L／_R`），和單槍的綁法不同，要另做雙持
- ✅ MG4（v65g；照門用 `mg4_sight_bw`，SF2 這把只有這張）・K3（v65g）・HK23E（v65g）
- ⏸ M249（`mg_spw`）：腰射時槍朝左上 45°，照門貼圖缺（全白）
- ⏸ RPK（`mg_rpk74`）、L86A1（`mg_l86a1`，SUSAT 鏡）：開鏡時鏡頭落在槍身／瞄具裡（灰畫面），要手動量瞄準點
- ✅ Remington 870・Benelli M4・KSG・Saiga-12（v65h；三段換彈 ReloadStart／Loop／End）
- ⏸ AA-12（`sho_aa12`）：開鏡時鏡頭在槍身裡；零件叫 body_a 等（`fileMap` 已支援），要手動量瞄準點
- ✅ P226・Desert Eagle・Glock・M1911・CZ 75・Jericho・S&W 60・M92FS・Infinity（v65i；M92FS 沒有 SF2 聲音包，用原本的聲音）
- ⏸ 沒有 SF2 包：MP5（只有 MP5K）、KRISS Vector（SF2 有 KrissV 類別但沒找到包，再查一次）、Negev、PKM、MG42、M1014、USP、AK-47（SF2 只有 AK-103）

## 迴圈結束（2026-10-28）
佇列全部 ✅ 或 ⏸。完成 44 把（含 5 把魔術迴路），暫停 11 把（原因寫在各項）。

## ⏸ 需要使用者
（迴圈遇到需要使用者的事情記在這裡）
- SVD 側掛 PSO 鏡要手動對位（見 C）。
- 腰射位置只有 K14 對過 SF2 截圖；SR-25 的鏡子離鏡頭偏近，其他把也可能需要校——要使用者的 SF2 腰射截圖。
- SR-25 照 SF2 的 `FireInterval` 1.15 s，變成近似栓動的節奏（原本 0.3 s 半自動）。
