# 待辦清單（大方向 → 細項）

> ✅ 完成 · 🔄 進行中 · ⬜ 未開始 · ❓ 等使用者決定。大方向底下全部完成就整段刪掉（細節留在 `docs/CHANGELOG.md`）。
> 順序：使用者回報的問題 → 要使用者選的，先把選項備好 → 大功能。

## 0. 使用者 10-27 回饋（優先）
- ✅ 刪除「Apex 訓練場・測試區」地圖
- ✅ 手榴彈、煙霧彈丟出去後都變成手榴彈的模型
- ✅ M4A1 開鏡：改用原版 A2 照門，覘孔與綠點置中
- ✅ M4A1 開槍：照 SF2 原版 ZoomFire 動畫數值改（開鏡只平移後退、不旋轉）
- ✅ 槍枝材質：改成霧面、非金屬（陽極處理／磷化／聚合物）
- ✅ 載入畫面一開始就顯示地圖圖片
- ✅ Skull Town 選圖縮圖和載入畫面：用使用者 Blender 截圖的視角（v61c）
- ✅ 訓練場的選圖縮圖和載入畫面：用使用者 Blender 截圖的視角（v62b）
- ✅ M4A1 原版動畫（使用者選 A，v62）：原版手臂（`c_comm_skelet` 的 `com_1starm_b01`＋`com_1stglove_b01`，Delta Force 迷彩袖）和槍綁同一副骨架，拔槍、待機、開鏡、射擊、換彈、衝刺都播原版動畫（`tools/sf2_rig_build.mjs`、`src/09c_sf2rig.js`）
  - ⬜ 等使用者實際玩過的意見：腰射位置（v62f 起是 SF2 的鏡頭：眼在頭部、槍模水平 90°）、拔槍 0.8 s、開槍時槍口火光照亮槍模的程度
  - ⬜ 還沒用到的片段：`PutDown`（收槍）、`Steady`、`CloseCombt_equip`（近戰）、`IdleToDash`／`DashToIdle`／`Idletozoom`／`zoomtoIdle`（目前用權重混合代替）
  - ✅ 倉庫槍卡縮圖在槍模載入前先畫成備用槍：載入後自動重畫（v62b）
- ✅ M4A1 照門外形（v62o）：改用 SF2 預設的 A2 提把（`rif_m4a1_handle_a`＋自己的貼圖 `handle_d`），環高出護翼、下方有「0-2」；眼距、前準星距離照 SF2 截圖量

## 1. SF2 原版槍枝素材（UModel，`D:\SpecialForce2`）
- ✅ M4A1 原版槍模、貼圖、槍聲（v61）
- ⬜ 材質照原版著色方式：SF2 是 Phong（`weapon_shader_base` 的 `gun_base`：高光貼圖 `_s`、SPPowerLow 100／High 30、SpecularIntensity 10、RimLight Power 3、cubemap 反射）。把 `_s` 高光貼圖換算成霧面／反光分布（roughness），再看要不要加邊緣光
- ⏸ 本機（HANDOFF H3）：M4A1 第三人稱槍模（`_3rd` 零件，別人手上看到的）
- 🔄 流程推廣到其他槍（每把對零件、貼圖、瞄具，檢查開鏡畫面）
  - ✅ AK-103、G36C（v62h）：原版模型、手臂動畫、槍聲、射速／換彈／拔槍時間、後座力參數；瞄具照 SF2 插槽放、開鏡鏡頭和前準星尖端等高
  - ✅ 步槍第二批（v62i）：K2、SCAR-L、SCAR-H、FAMAS、XM8、GALIL、HK417 換成 SF2 原版（模型、動畫、槍聲、時間、後座力；`src/01_core.js` 的 SF2_WEAPONS 表由 `tools/sf2_weapon_table.py` 產生）
  - ⏸ 本機（HANDOFF H3）：M16A3：平頂機匣，SF2 類別預設只有翻轉式前準星，照門／瞄具由別的零件提供，還沒找到
  - ⏸ 本機（HANDOFF H3）：QBZ-97：提把上的瞄準線還沒找對（眼睛落在照門本體上）
  - ⬜ 其他類別（衝鋒槍、狙擊、機槍、手槍、霰彈）照使用者指定
  - ⏸ 使用者（HANDOFF H6）：AK-103、G36C 開鏡畫面還沒有 SF2 正版截圖可以對（M4A1 有）
- ⏸ 本機（HANDOFF H3）：補 MP5K

- ✅ 槍口火光改用 SF2 正版特效（v62m）：SF2 原版槍（rig）腰射 4 層、開鏡前方火光＋煙
  - ⬜ 等使用者實際看過的意見（大小目前是 SF2 數值的一半）；其他槍和 Bot／別的玩家看到的火光還是我們遊戲目前的星芒

## 2. Apex 地圖
- ⬜ 畫質：牆面地面的法線貼圖（凹凸細節）、門和窗的玻璃材質
- 🔄 載入時間（使用者選 C）
  - ✅ 房間預載地圖、碰撞網格重用、背景編譯著色器（v62x）：在房間等過後 Skull Town 9.7 → 3.4 s、訓練場 3.9 s
  - ✅ 碰撞資料 10.4 → 2.3 MB（v62y）：包 Skull Town 50 → 39 MB、訓練場 39 → 30 MB
  - ⬜ 下載大小還能再減：模型 23 MB（Draco 幾何 ≈ 15 MB＋WebP 貼圖 8.6 MB）
  - ❓ 「即將部署」地圖預覽固定 1.6–1.7 秒，要不要縮短
- ⬜ 依遊玩回饋繼續修（卡點、亮度、碰撞）

## 3. Apex 槍枝（資料：`docs/research/apex/weapons-full.json`，說明 `docs/research/apex/README.md`）
- 🔄 29 把槍的數值接進 Apex 扣血模式
  - ✅ 完整數值（v62t）：S30.1＋官方 patch notes＋S14 原始武器腳本（散布、後座表、彈道、拔槍、配件效果），逐欄標來源；TTK 表（`tools/apex_weapon_data.py`）
  - ✅ 扣血接線（v62u）：每把槍對應一把同類、射速最接近的 Apex 槍，用它的傷害、頭／腿倍率、爆頭生效距離（自選，見 DECISIONS D6）
  - ✅ 清掉 `APEX.head`／`legs`／`leg`／`scale`（v62v）
  - ⬜ 新增 Apex 原版槍當成獨立武器（需要模型：HANDOFF H5 的 RSX 匯出），讓連發、蓄力、加速類（Hemlok、Nemesis、Prowler、Charge Rifle、Triple Take、Bocek、Devotion、L-STAR、Kraber）也能用
  - ✅ 每發傷害、頭／腿倍率、爆頭距離和對應的 Apex 槍一致：`tools/_dmgmodel.mjs`（v62u）
  - ✅ 和 wiki 的擊殺發數／TTK 比對（v62z，本機 H2 抓回的表）：21／28 一致，8 把差在每發傷害，採用較新的 S30.1（自選，見 DECISIONS D9；清單在 `docs/research/apex/README.md`）
  - ✅ S30.1 完整頁面（本機 H1）接進數值資料當 `s30.1-full` 層（v62z）
  - ✅ 散布、後座不套 Apex 的（自選，見 DECISIONS D7）：留給「新增 Apex 原版槍」用
  - ✅ Nemesis 的散布、拔槍、彈道（v62z，`s30.1-full`）；只缺每發後座表
- ⬜ 配件系統（瞄具、彈匣、槍托、槍管、Hop-up）
- ⏸ 本機（HANDOFF H5）：用 RSX 從 Apex 安裝檔匯出原版槍模和音效

## 4. 數值稽核
- ✅ 讀出 SF2 原版 805 把槍的數值（射速、傷害、距離、換彈、開鏡、散射、後座力參數）→ `docs/research/sf2/client-data/`（v62c）
- 🔄 後座力公式（v62d）：反編譯 UnrealScript（`tools/sf2_decompile.py`）確認了欄位意義（`nextCrossVert` = 每發上跳、`domInc` = 每發散布增加）、散射公式和執行時狀態欄位；後座本體 `StartRecoil` 是原生、在加殼的 exe 裡，沒有破解。重建的模型見 `docs/research/sf2/client-data/README.md`
  - ✅ 重建的模型套到 M4A1（使用者選 1A，v62e，`def.sf2Recoil`）
  - ✅ 左右飄移照使用者給的 SF2 開鏡掃射截圖重新擬合（v62g）：開鏡不壓槍時彈孔幾乎一直線往上，左右只 ±0.3°；開鏡散布不再每發變大
  - ✅ 上跳不再有上限（v62j，使用者實測 SF2 是兩倍以上、整個彈匣持續上升）
  - ⬜ 腰射上跳也沒上限（M4A1 25 發 33°、AK-103 20 發 43°）：等使用者決定要不要另外設上限
  - ⬜ 使用者試手感
  - ⬜ 手感確認後推廣到其他槍（805 把的參數都在 `weapons.json`）
- ✅ M4A1 原版時間（使用者選 3A，v62d）：射速 0.096 s、換彈 2.3 s、拔槍 0.8 s（拔完才能開槍）、開鏡 0.25 s；傷害維持平衡規則
- ✅ 開鏡比例（使用者 10-27 給 SF2 正版開鏡截圖，v62f）：UE3 的 FOV 是水平的，之前把 35° 當垂直用。改成眼在頭部骨頭＋槍模水平 35°（開鏡）／90°（腰射），照門環內徑 267 px 和截圖一致；前準星往後移 6.6 cm、往下 1.4 mm，大小和綠點位置也對上
- ⬜ 照門外形：SF2 截圖的照門環高出兩側護翼、外框很厚、下方有「0-2」字樣；我們的環和護翼一樣高。查模型是不是翻轉片的狀態不同
- ✅ 開鏡時的世界視角（v62w）：SF2 原版槍的 `fZoomedFOV` 55 當水平角換算（16:9 垂直 32.6°，原本當垂直 55° 用）（自選，見 DECISIONS D8）
- ✅ 反編譯散射腳本 `SFWeapon.AddSpreadEx`（v62d）
- ⬜ 開鏡時間（0.15–0.35 s）、每槍前 10 發彈道、散佈倍率（移動 ×2、跳 ×4、蹲 ×0.7）
- ⬜ 用 SF2 日服評分和彈匣／備彈核對各槍相對強弱（`docs/research/sf2/handoff-2026-10-27/weapons.json`）
- ⬜ Bot：反應時間（700 / 450 / 300 ms）、橫移 ≥ 2.5 m/s、低血量撤退
- ❓ 狙擊屏息 3 秒：Shift 已是衝刺，要選別的鍵
- ❓ AI 除錯顯示：F1–F3 已是配裝卡片，要選別的鍵

## 5. 連線
- ⬜ 客戶端完整回溯重播修正
- ⬜ 房主驗證速度與射速（防作弊）

## 7. 其他
- ⬜ 更多地形地圖
- ⬜ 音效：其他槍的原版音效隨第 1 項一起處理
- ⬜ 等使用者實際遊玩後的意見
