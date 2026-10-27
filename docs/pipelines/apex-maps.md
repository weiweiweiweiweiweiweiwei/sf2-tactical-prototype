# Apex 地圖流程（v60，Skull Town 與訓練場）

素材都來自使用者自己安裝的 Apex（Steam），用 RSX 2.4.0 匯出；原始匯出放在 `tools/out/apex/`（不進 git）。
地圖設定（中心、裁切範圍、可玩範圍）在 `tools/blender/apex_maps.py`，兩張圖用 `--map skulltown` / `--map range` 切換。

## 1. 從遊戲檔匯出（RSX，`tools/out/apex/rsx-2.4.0/rsx_nogui.exe`）
- 地圖 BSP：`--exporttypes wrap`（得到各 lump 和 `*.ent`）。
- 模型：`-exportdependencies -matltextures --exporttypes mdl_`（CAST 檔）。
- 材質貼圖：很多在 `common.rpak`，要和地圖包一起載入：`--exporttypes matl --exportfilter "名稱1,名稱2,…" 地圖.rpak common_mp.rpak common.rpak`。貼圖寫到 `rsx-2.4.0/exported_files/material/`。

## 2. 組場景：`blender -b -P tools/blender/skulltown_build.py -- --map <名稱>`
- 世界網格（Source 是順時針繞序，要反過來）、原始法線、物件依「三角形 × 擺放數」挑 LOD，另匯最粗 LOD 給碰撞。
- 排除 Arenas 外殼（穹頂 `live_fire_frame`、環、鋼樑、圍牆、圍網、反射探針盒）。
- 輸出 `tools/out/apex/<名稱>/<名稱>.blend`。

## 3. 烘焙與匯出：`blender -b -P tools/blender/skulltown_export.py -- --map <名稱> [--samples 256] [--collision-only]`
- 光照：Poly Haven 天空（`tools/out/apex/sky/`）＋地圖自己的燈，Cycles 烘到兩張光照貼圖（可玩範圍 4096²、外圍 2048²）；每個物件取樣它底下的烘焙亮度。
- 碰撞：世界三角形＋物件最粗 LOD（岩石減到 80 面、建築 400 面；矮又小的雜物不擋路）。
- 輸出 `tools/out/apex/<名稱>/export/`（glTF、光照貼圖、collision.bin、manifest.json）。256 次取樣在 GTX 1650 Ti 上每張圖約 40–60 分鐘；只改碰撞用 `--collision-only`。

## 4. 壓縮、打包、導航
1. `python tools/compress-apex-textures.py <名稱>`：貼圖轉 WebP、光照貼圖轉 JPEG。
2. `node tools/pack-apex-js.mjs <名稱>`：Draco 幾何、碰撞量化＋gzip、切成 `assets/maps/apex-*/pack/*.js`（雙擊 index.html 也能載入）。
3. `node tools/bake-apex-nav.mjs <地圖 id>`（`apex_skulltown` / `apex_full`），再跑一次第 2 步把導航包進去。

## 5. 檢查
- `node tools/check-apex-full.mjs <地圖 id>`：門、落地、不卡死、出界。
- `node tools/_walkprobe.mjs <地圖 id>`：導航路段實走（接縫、台階不用跳）。
- `node tools/_stuckprobe.mjs <地圖 id>`、`node tools/_apexbots.mjs 90 tdm <地圖 id>`、`MAP=<地圖 id> node tools/_nettest.mjs`。
- 截圖：`MAP=<地圖 id> node tools/_skullshot.mjs x,y,z,偏航,俯仰 …`。
