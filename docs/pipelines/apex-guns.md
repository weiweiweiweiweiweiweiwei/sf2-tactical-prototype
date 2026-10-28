# Apex 原版槍模與槍聲（RSX）

使用者自己電腦上的 Apex Legends（Steam：`C:/Program Files (x86)/Steam/steamapps/common/Apex Legends`），用 RSX 2.4.0（`tools/out/apex/rsx-2.4.0/rsx_nogui.exe`）匯出。第一把：R-301（loop H5，2026-10-28）。

## 1. 找資產
- 清單：`rsx_nogui.exe -nogui --list <out.csv> --listformat csv <檔…>`（CSV：類型, guid, 所在檔, 名稱）。
- 槍模在 `paks/Win64/common.rpak`：`mdl\techart\mshop\weapons\class\<類別>\<槍>\<槍>_base_v.rmdl`（第一人稱）、`_base_w.rmdl`（第三人稱／地上）。其他是造型（`_lgnd_v19_…`）。
- 材質：`material\art\mshop\weapons\class\<類別>\<槍>\base\<槍>_base_main_sknp`。
- 武器設定：`weapon\mp_weapon_<內部名>.rpak`（`wepn`）。R-301 的內部名是 `rspn101`，音效名是 `r101`。
- 槍聲在 Miles 音效庫：`audio/ship/general.mbnk`（＋`general_stream.mstr`），用 `--list` 讀它（235 萬個音源）。第一人稱用 `wpn_r101_1p_…`、換彈 `wpn_r101_reload_…`（`fr<格>` 是動畫的格數）、拔槍 `wpn_r101_firstdraw_…`、開鏡 `r101_1p_adsin_…`。

## 2. 匯出
```
A="C:/Program Files (x86)/Steam/steamapps/common/Apex Legends"
rsx_nogui.exe -nogui -export -exportdependencies -matltextures --exportthreads 8 --exportdir "../r301" --exporttypes mdl_ --exportfilter "r301_base_v,r301_base_w" "$A/paks/Win64/common.rpak"
rsx_nogui.exe -nogui -export -matltextures --exportthreads 8 --exportdir "../r301" --exporttypes matl --exportfilter "r301_base_main_sknp" "$A/paks/Win64/common.rpak" "$A/paks/Win64/common_mp.rpak"
rsx_nogui.exe -nogui -export --exportdir "../r301/audio" --exporttypes asrc --exportfilter "<音源名,…>" "$A/audio/ship/general.mbnk"
```
- 模型 → `tools/out/apex/r301/mdl/r301_base_v/r301_base_v_LOD0.cast`；貼圖 → `rsx-2.4.0/exported_files/material/r301_base_main_sknp/`（`_col` 顏色、`_nml` 法線、`_gls` 光澤、`_spc`、`_ao`、`_cav`）；音源 → `tools/out/apex/r301/audio/audio/*.wav`（32-bit float，部分 5.1 聲道）。

## 3. 轉成遊戲用的檔
- 模型：`python tools/blender/apex_gun_build.py r301`（系統 Python：貼圖縮到 1024、法線 DirectX → glTF 翻綠色、粗糙度 = 1 − 光澤）→ `blender -b -P tools/blender/apex_gun_build.py -- r301` → **`tools/guns/apex_r301.glb`**（335 KB）。只留機匣 `body_0`、預設彈匣 `r101_magazine_0`、機械瞄具 `sight_front_0`；所有瞄具、滅音器、雷射的網格都丟掉。座標維持模型空間（英寸 → 公尺；glTF y 朝上），還沒轉成 gunlib 的槍座標，也還沒有 MUZZLE／SIGHT 標記。
- 槍聲：`node tools/apex-sfx.mjs r301` → **`tools/guns/apex_r301_sfx/<用途>.wav`**（16-bit 立體聲，5.1 混成兩聲道；超過上限的整段縮小）：`fire_first`／`fire_loop`／`fire_tail`（Apex 全自動是「第一發＋循環＋尾音」）、`fire_single`（單發 0.09 s）、`magout`、`maggrab`、`magin`、`boltback`、`boltfwd`、`draw`、`adsin`。共 2.4 MB。

## 4. 還沒做（雲端）
- 槍座標：轉成 gunlib（X 右、Y 槍口、Z 上）、加 MUZZLE／SIGHT 等標記、接進 `src/09_models.js`。
- 槍聲：接進音效包（WAV 可以轉 OGG 再打包，像 `tools/sfx_sf2.mjs`）。
- 其他 28 把：同一套流程，`GUNS`／`ROLES` 各加一筆。
