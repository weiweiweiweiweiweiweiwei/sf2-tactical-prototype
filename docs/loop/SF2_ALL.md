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
- 一把槍的做法照 `docs/loop/GUNS.md`「一把槍的做法」。**v65q 起新槍用一行指令**：`python tools/sf2_add_gun.py <id> <SF2 類別> <包名> [--name 顯示名]`（匯出、找零件／貼圖／照門、建模、數值、重量、定義、Bot、聲音、打包、建置），之後 `GUNID=<id> ONLY=hip,ads node tools/out/_rigshot.mjs` 看一眼。貼圖白色＝找不到預設貼圖：看 `<包>_texture` 或 `wp_*_<槍>` 包。

## 佇列
狀態：⬜ 未做 · 🔄 進行中 · ✅ 完成 · ⏸ 做不到（寫原因）

### G0. 先處理容量（`assets/guns/guns.js` 已 60.7 MB，再加槍會拖慢載入）
- ✅（v65j）槍模按需載入：`tools/guns/pack.mjs` 改成每把槍一個檔（`assets/guns/<id>.js`）＋索引；遊戲只載入目前配裝、Bot 手上、倉庫正在看的槍（倉庫縮圖可用預先畫好的圖）。驗證：首次進對戰的下載量、`check.mjs`、倉庫縮圖、`_fileplay`。
- ✅（v65k）變體在遊戲裡組裝：底槍的 rig＋配件零件（瞄具、消音器）各一個小 GLB，執行時掛到槍身插槽（`Scope`／`Sight`／`Silencer`），不再每個變體一個完整 rig。把現有的 `g36c_eo`、`hk417_rs`、`scarl_eo` 改成這種方式驗證。

### G1. 槍枝清單
- ✅（v65l）從 `docs/research/sf2/client-data/weapons.json`、`SFCItem_*` 的 `DefaultItemClassNames`（`tools/sf2_props.py`）、SF2 的武器名稱表整理出：**每把底槍**＋**型態**（標準、EO、Reflex、ACOG、Silencer、Max／改、其他配件組合），排除塗裝（CircuitFX、Blaster、活動造型等）和特殊模式武器。輸出 `docs/research/sf2/gun-inventory.md`（底槍、型態、類別名、包名、遊戲裡有沒有）。依這份清單展開下面 G2–G4 的項目。

### G2. 補完暫停的 11 把（`docs/loop/GUNS.md` 的 ⏸）
- ⏸ SVD、P90、PP-2000／vz.61（雙持）、M249、RPK、L86A1、AA-12：都要手動量瞄準點／做雙持，上一輪各試過，等 G4 做完再回頭（規則：細節最多 2 次）。
- ✅ 再找包名（v65m）：Vector＝`smg_ksv`（併入 G3 的 KrissV）；MP5（完整版）、Negev、PKM、MG42、M1014、USP、AK-47 在安裝檔裡沒有包，維持原本的槍。

### M1. 地圖清單
- ✅（v65m）列出 SF2 安裝檔裡的地圖包（`D:/SpecialForce2/SFGame/CookedPCConsole`），排除殭屍／PVE／活動等特殊模式；記下各圖的包名、主要的子關卡（streaming levels）、大小。輸出 `docs/research/sf2/map-inventory.md`。

### M2. 地圖匯出可行性
- ✅（v65o）用 Alcatraz 試成功。**每張圖的做法（M3 照這個）**：
  1. `python tools/sf2_unlzo.py <圖>`（解壓到 `tools/out/sf2/<圖>_dec.upk`）
  2. `tools/out/umodel_win32/umodel_64.exe -game=sf2 -path=D:/SpecialForce2/SFGame/CookedPCConsole -export -gltf -png -nooverwrite -out=tools/out/sf2/maps/<圖> <圖>`（地圖引用別的包的網格時，那些包也要匯出到同一資料夾）
  3. `python tools/sf2_map_dump.py <圖>`、`python tools/sf2_map_bsp.py <圖>`、`node tools/sf2_map_build.mjs <圖>` → `assets/maps/sf2-<圖小寫>/map.js`
  4. `src/07x_sf2maps.js` 加一個 `MAPS.push(sf2TriMap({ id: 'sf2_<圖小寫>', name, en, desc, slogan, indoor, shot, thumb, objectives }))`（bounds、killY、出生點、導航層自動）
  5. `node tools/_mapthumbs.mjs sf2_<圖小寫>`；`node tools/check.mjs --map <編號>`（CHECK_OK）；`MAP=<編號> ONLY=hip node tools/out/_rigshot.mjs` 看玩家視角

### G3. 遊戲裡還沒有的 SF2 底槍（`docs/research/sf2/gun-inventory.md`；SF2 包名用 `umodel -list` 找 `rif_`／`smg_`／`sni_`／`mg_`／`sho_`／`pis_` 開頭）
- ✅ ACR（突擊步槍，v65p）
- ✅ AK104（v65q：SF2 沒有獨立模型，用 AK-103 的模型和聲音、AK104 自己的數值）
- ✅ AN94（v65q）
- ✅ ARX160（v65r；⏸ 開鏡：照門擋住視野，眼距待調）
- ✅ CM901（v65r；⏸ 開鏡：鏡頭在槍身裡——沒有獨立照門零件，瞄準點待量）
- ✅ FNF2000（v65r；⏸ 開鏡：鏡頭在槍身裡——內建瞄具，瞄準點待量）
- ✅ FNFS2000（v65s：沒有獨立模型，F2000 外觀＋自己的數值；⏸ 開鏡同 F2000）
- ✅ K2C1（v65s；⏸ 開鏡：照門擋住）
- ⏸ L85A1：安裝檔裡沒有模型包
- ✅ MadsenLar（v65s；⏸ 槍身貼圖白色：預設貼圖在別的包）
- ✅ MRR（v65s）
- ✅ SAR21（v65s；⏸ 開鏡：鏡頭在槍身裡）
- ✅ SCARHDMR（v65s：SCAR-H 外觀＋自己的數值，半自動）
- ✅ STG44（突擊步槍）
- ✅ T65K1（突擊步槍）
- ✅ T65K2（突擊步槍）
- ✅ T91（突擊步槍）
- ✅ TAR21（突擊步槍）
- ✅ Bizon（衝鋒槍）
- ✅ CSLS06（衝鋒槍）
- ✅ CZ3A1（衝鋒槍）
- ✅ K1（衝鋒槍）
- ✅ KrissV（衝鋒槍）
- ⏸ MAC10（衝鋒槍；SF2 是雙持，跟 G2 雙持槍一起做）
- ✅ MP40（衝鋒槍）
- ✅ Mx4Storm（衝鋒槍）
- ⏸ P90（衝鋒槍；見 G2）
- ⏸ PP2000（衝鋒槍；見 G2）
- ⏸ Scorpion（衝鋒槍；見 G2）
- ✅ SIGMPX（衝鋒槍）
- ✅ UziPro（衝鋒槍）
- ✅ XM8CompactCarbine（衝鋒槍；沿用 XM8 外觀）
- ⏸ DragunovSVD（狙擊槍；見 G2）
- ✅ FNAR（狙擊槍；開鏡待接）
- ⏸ HS50M1（狙擊槍；安裝檔沒有模型包）
- ✅ MSR（狙擊槍；開鏡待接）
- ⏸ Springfield（狙擊槍；安裝檔沒有模型包）
- ✅ SVCh（狙擊槍；開鏡待接）
- ✅ FNMAG（機槍；持槍／開鏡待量）
- ⏸ L86A1（機槍；見 G2）
- ✅ MinimiSPW（機槍；持槍／開鏡待量）
- ⏸ RPK74（機槍；見 G2）
- ✅ Ultimax（機槍）
- ✅ XM8AutomaticRifle（機槍；沿用 XM8 外觀）
- ⏸ AA12（霰彈槍；見 G2）
- ✅ USAS12（霰彈槍）
- ✅ 44Magnum（手槍）
- ✅ K5（手槍）
- ✅ LUGER（手槍）
- ✅ Maxim9（手槍）
- ⏸ P7M13（手槍；SF2 是雙持）
- ✅ StrikeOne（手槍）
- ✅ Wildey（手槍）

### G4. 各槍的型態（底槍做好後才做；配件看 `SFCItem_<槍>_<型態>` 的 `DefaultItemClassNames`；型態輸出成配件檔 `<id>_sf2_ovl`；MKn＝SF2 的強化版（「Max／改」），只差數值：照該 SFCWeapon<槍>_MKn 類別的數值、外觀同底槍）
- ⬜ M4A1（m4a1）：ACOG、AimPoint、EOTech、OpenDot、Reflex、Silencer、MK5
- ⬜ ACR：ACOG、AimPoint、EOTech、OpenDot、Reflex、MK3
- ⬜ AK103（ak103）：ACOG、AimPoint、EOTech、Reflex、Silencer、MK5
- ⬜ AK104：ACOG、EOTech
- ⬜ AN94：ACOG、AimPoint、EOTech、Reflex、MK3
- ⬜ ARX160：ACOG、EOTech、OpenDot、Reflex、Silencer
- ⬜ AUGA3（aug）：ACOG、AimPoint、EOTech、OpenDot、Reflex、MK5
- ⬜ CM901：ACOG、AimPoint、EOTech、OpenDot、Reflex
- ⬜ FAMAS（famas）：ACOG、AimPoint、EOTech、OpenDot、Reflex、Silencer、MK5
- ⬜ FNF2000：AimPoint、Scope、Silencer
- ⬜ FNFS2000：EOTech、OpenDot
- ⬜ G36C（g36c）：ACOG、AimPoint、EOTech、OpenDot、Reflex、Silencer、MK4
- ⬜ GALIL（galil）：ACOG、AimPoint、EOTech、OpenDot、Reflex、Silencer、MK2
- ⬜ HK417（hk417）：ACOG、AimPoint、EOTech、OpenDot、Reflex、Silencer、MK5
- ⬜ K2（k2）：ACOG、EOTech、OpenDot、Reflex、Silencer、MK5
- ⬜ K2C1：EOTech、Reflex
- ⬜ M14EBR（m14ebr）：ACOG、OpenDot、Reflex、Silencer、MK5
- ⬜ M16A3（m16a3）：ACOG、EOTech、Silencer
- ⬜ MadsenLar：EOTech、OpenDot
- ⬜ MRR：AimPoint、EOTech、OpenDot、Silencer
- ⬜ QBZ97（qbz97）：ACOG、AimPoint、EOTech、Reflex、MK2
- ⬜ SAR21：AimPoint、EOTech、OpenDot、Reflex
- ⬜ SCARH（scarh）：ACOG、EOTech、Reflex、MK5
- ⬜ SCARHDMR：Silencer
- ⬜ SCARL（scarl）：ACOG、AimPoint、EOTech、Reflex、MK3
- ⬜ SIG551（sg551）：ACOG、AimPoint、EOTech、OpenDot、Reflex、Silencer、MK3
- ⬜ STG44：EOTech、OpenDot、Reflex
- ⬜ T65K1：EOTech、Reflex
- ⬜ T65K2：ACOG、EOTech、OpenDot、Reflex
- ⬜ T91：EOTech、Reflex
- ⬜ TAR21：EOTech、OpenDot、Reflex
- ⬜ Type89（type89）：ACOG、EOTech、Reflex、Silencer、MK2
- ⬜ XM8（xm8）：ACOG、EOTech、OpenDot、Reflex、Silencer、MK3
- ⬜ Bizon：EOTech、OpenDot、Reflex、Silencer、MK3
- ⬜ CSLS06：EOTech、OpenDot、Silencer、MK3
- ⬜ CZ3A1：EOTech、OpenDot、Reflex、Silencer
- ⬜ K1：EOTech、OpenDot、Reflex、Silencer、MK2
- ⬜ KrissV：ACOG、EOTech、OpenDot、Reflex、Silencer、MK5
- ⬜ MP40：EOTech、OpenDot、Reflex、Silencer
- ⬜ MP5K（mp5k）：ACOG、OpenDot、Silencer、MK5
- ⬜ MP7A1（mp7）：ACOG、EOTech、OpenDot、Silencer、MK5
- ⬜ Mx4Storm：EOTech、Reflex
- ⬜ P90：EOTech、OpenDot、Silencer、MK5
- ⬜ PP2000：MK5
- ⬜ Scorpion：MK5
- ⬜ SIGMPX：EOTech、OpenDot、Reflex、Silencer、MK2
- ⬜ UMP45（ump45）：ACOG、AimPoint、EOTech、OpenDot、Reflex、Silencer、MK5
- ⬜ UziPro：EOTech、OpenDot、Silencer、MK2
- ⬜ AWP（awp）：Silencer、MK5
- ⬜ Barret（barrett）：MK2
- ⬜ CheyTac（cheytac_m200）：Silencer、MK5
- ⬜ CZ700（cz700）：Silencer、MK5
- ⬜ FNAR：Silencer
- ⬜ FRF2（frf2）：Silencer
- ⬜ K14（k14）：Silencer、MK2
- ⬜ Kar98k（kar98k）：Silencer
- ⬜ M40A1（m40a1）：Silencer、MK5
- ⬜ MSR：Silencer
- ⬜ PSG1（psg1）：ACOG、AimPoint、MK5
- ⬜ SR25（sr25）：ACOG、Silencer、MK5
- ⬜ SVCh：Silencer
- ⬜ TRG（trg）：Silencer
- ⬜ FNMAG：EOTech、Reflex
- ⬜ HK23E（hk23e）：ACOG、EOTech、OpenDot、Reflex、MK5
- ⬜ K3（k3）：EOTech、OpenDot、MK5
- ⬜ L86A1：EOTech、OpenDot、MK5
- ⬜ MG4（mg4）：EOTech、OpenDot、Reflex、MK2
- ⬜ MinimiSPW：ACOG、EOTech、OpenDot、Reflex、MK3
- ⬜ RPK74：ACOG、EOTech、OpenDot、MK5
- ⬜ Ultimax：EOTech、OpenDot、Reflex
- ⬜ AA12：EOTech、OpenDot、MK2
- ⬜ BNLLI（benelli_m4）：EOTech
- ⬜ M870（remington870）：EOTech、OpenDot、Reflex、MK5
- ⬜ SAIGA12（saiga12）：EOTech、OpenDot
- ⬜ USAS12：OpenDot
- ⬜ 44Magnum：ACOG、AimPoint
- ⬜ Colt1911（m1911）：Silencer
- ⬜ CZ75BD（cz75）：Silencer
- ⬜ INFINITY（infinity）：Silencer
- ⬜ K5：Silencer
- ⬜ M92FS（m92fs）：Silencer
- ⬜ P226（p226）：Silencer

### M3. 逐張還原（`docs/research/sf2/map-inventory.md`，由小到大；M2 成功後照它的做法）
- ⬜ Fog（2.5 MB）
- ⬜ island（5.5 MB）
- ⬜ Scrimmage（5.7 MB）
- ⬜ turbulence（6.9 MB）
- ⬜ FlowerBed（7.1 MB）
- ✅ Alcatraz（v65o）
- ⬜ Dam（7.2 MB）
- ⬜ WhiteNight（7.6 MB）
- ⬜ 13F（8.1 MB）
- ⬜ SupplyBase（8.1 MB）
- ⬜ ryokan（9.5 MB）
- ⬜ Bazaar（9.8 MB）
- ⬜ Burrow（9.9 MB）
- ⬜ Sunrise（10.2 MB）
- ⬜ Luxor（10.4 MB）
- ⬜ armory（10.6 MB）
- ⬜ cargoship（11.1 MB）
- ⬜ temple（11.1 MB）
- ⬜ WatersideVillage（11.3 MB）
- ⬜ SubmarineBase（11.6 MB）
- ⬜ Plaza（12.2 MB）
- ⬜ Village（12.3 MB）
- ⬜ Mansion（12.6 MB）
- ⬜ Embassy（13.1 MB）
- ⬜ SunYatSenHall（13.1 MB）
- ✅ DustCity（13.2 MB；v65t 沙漠之都，使用者 10-29 指定；⏸ 遠景大樓有幾棟浮空／傾斜、中央黑塔沒貼圖；渲染 CPU 平均 16.5 ms）
- ⬜ Mangrove（13.2 MB）
- ⬜ Satellite（13.7 MB）
- ⬜ tower（13.8 MB）
- ⬜ everland（14.1 MB）
- ⬜ Harbor（14.1 MB）
- ⬜ Base_camp（14.6 MB）
- ⬜ valley（15.4 MB）
- ⬜ BlackHawkDown（15.6 MB）
- ⬜ Pokhran（15.6 MB）
- ⬜ Strassebahn（15.8 MB）
- ⬜ greenhouse（15.9 MB）
- ⬜ Khalistan（16.0 MB）
- ⬜ RussianFactory（16.1 MB）
- ⬜ GhostTown（16.8 MB）
- ⬜ PalaceMuseum（16.9 MB）
- ⬜ Uhlan（17.9 MB）
- ⬜ hometown（18.0 MB）
- ⬜ MStreet（18.1 MB）
- ⬜ Sugarcane（18.1 MB）
- ⬜ SafeHouse（18.3 MB）
- ⬜ Factory（18.4 MB）
- ⬜ Guantanamo（18.7 MB）
- ⬜ Oldtrain（18.7 MB）
- 🔄 DesertCamp（19.6 MB）：v65x 形狀修好；光照交接見 `docs/loop/SF2_DESERTCAMP_LIGHT.md`
- ⬜ Rocket（20.0 MB）
- ⬜ colombiana（20.5 MB）
- ⬜ Shanghai（20.7 MB）
- ⬜ Bank（21.3 MB）
- ⬜ Vitoria（22.0 MB）
- ⬜ Mosque（22.2 MB）
- ⬜ Prison（22.4 MB）
- ⬜ Peacehawk（22.5 MB）
- ⬜ RepairCenter（22.6 MB）
- ⬜ NerveGas（22.7 MB）
- ⬜ Missile（22.9 MB）
- ⬜ solartower（24.1 MB）
- ⬜ Riverside（45.0 MB）

## 自動選擇紀錄
（迴圈中替使用者做的決定，一行一個，使用者可以回頭改）
- v65j：地上掉的槍若還沒載入，那一次先用簡易模型、背景載入，下一次才是精細模型（選 A：不讓掉槍時卡頓）。
- v65k：型態一律輸出成「配件檔」（`<id>_sf2_ovl.glb`，`node tools/sf2_rig_build.mjs <型態>`；要整把時加 `--full`），不再另存整把 rig。
- v65l：型態只做「標準＋每種瞄具＋消音＋最高 MK」，雷射、擴充彈匣、多配件組合不做（共 379 個）；活動造型槍（貓、海豚…）不算槍。
- v65l：佇列順序改成 G2 → 地圖清單與匯出可行性（M1、M2）→ G3 新槍 → G4 型態（M4A1 第一）→ M3 逐張地圖：先確定地圖做不做得出來。
- v65m：地圖只做 63 張常規對戰圖；節日造型版（萬聖節、聖誕、夏日、海盜）只做原版；捉迷藏、六角、殭屍、射擊、防守、教學、靶場不做。
- v65o：SF2 地圖的碰撞直接用模型的三角形（含小物件）、導航在載入時取樣、出生點圍繞 SF2 的 PlayerStart；梯子先只放導航點（還不能爬）。
- v65r：開鏡對不準的新槍照樣加進來（腰射可用），開鏡瞄準點統一記在 TODO 之後一次量。
- 10-29 MAC-10 是雙持 → A：暫停，跟 G2 雙持槍一起做；Bizon／CZ3A1 塗裝貼圖 → A：先上、記 TODO
- 10-29 FNAR／MSR／SVCh 狙擊鏡開鏡沒接好 → A：先上（腰射可用），開鏡記 TODO；HS50M1／Springfield 沒模型包 → A：暫停
- 10-29 P7M13 是雙持 → A：暫停；FN MAG／Minimi SPW 持槍開鏡歪 → A：先上、記 TODO；44Magnum 用 pis_blackhawk 模型
