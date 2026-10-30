# Blender 槍模標準流程（v49 起）

第一把是 M4A1（`tools/blender/m4a1_build.py`）。之後的 M200、P90 等照同樣步驟做。

**素材規則**：模型全部原創，以 CC0 釋出。只能參考真槍照片和尺寸，不能用任何遊戲拆包的素材。

## 0. 前置
- Blender 5.2：`C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`（下面寫成 `blender`）。
- 腳本都在專案根目錄執行。

## 1. 建模腳本 `tools/blender/<id>_build.py`
- 開頭：
  ```python
  import os, sys
  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  from gunlib import *
  OUT = out_path('tools/guns/<id>.glb')
  ```
- **座標（槍的座標系）**：
  - X 是左右（正值是右邊），Y 是 u（正值是槍口方向），Z 是 v（正值是上方）。
  - 單位是公尺，比例用真槍 ×1.0。
  - 槍膛軸線放在 v = 0。
  - **手槍握把中心放在 u −0.078、v −0.082**：程序化的手會抓在這裡。
- **建模函式**（`gunlib.py`）：

| 函式 | 用途 |
|---|---|
| `prof(name, pts, width, ...)` | 側面輪廓擠出（u, v 點），可帶 `holes` 挖洞 |
| `box(name, x0, x1, u0, u1, v0, v1)` | 方塊（自動倒角） |
| `cyl(...)`、`lathe(...)`、`torus(...)` | 圓柱、旋轉體、圓環 |
| `rail(u0, u1, base, face='up' / 'down' / 'right' / 'left')` | 皮卡汀尼導軌 |
| `screw(u, v, x)` | 螺絲 |

- **每個零件都要指定 `node` 和 `mat`**：
  - `node`：
    - `body`：不會動的部分。
    - `mag`：換彈時掉出去的彈匣。
    - `charge`：換彈時往後拉的拉柄。
    - 其他名稱：可以切換的部件，例如 G36C 的 `supp`（消音器）和 `hider`（消焰器）。
  - `mat`：`black`、`steel`、`bright`、`polymer`、`rubber`、`magBlack`、`brass`、`gold`、`goldDark`、`suppressor`、`dotW`、`dotR`。這些名稱直接對應遊戲裡的槍枝材質（`src/09_models.js` 的 `fromGLB` 裡的 `MAT`）。
- **Empty 標記**（遊戲會讀取）：

| 名稱 | 位置 |
|---|---|
| `SIGHT` | 瞄具窗中心（瞄準軸） |
| `HOOD` | 瞄具罩的後緣（眼睛距離從這裡算） |
| `MUZZLE` | 槍口（另一個槍口用 `MUZZLE_S`） |
| `GRIP` | 握把（右手） |
| `SUPPORT` | 護木下方，左手托的位置 |
| `MAGPIV`、`CHARGEPIV` | 彈匣、拉柄動畫的旋轉中心 |

- 最後呼叫 `export(OUT)`：依「部件 × 材質」合併網格、投影 UV、平滑化，用 **Draco 壓縮**輸出 GLB（M4A1 是 140 KB）。

## 2. 建模、預覽、修改
```bash
blender -b --factory-startup -P tools/blender/<id>_build.py -- tools/guns/<id>.glb
```
```bash
blender -b --factory-startup -P tools/blender/gun_preview.py -- tools/guns/<id>.glb tools/out/<id>_preview
```
- 預覽圖會自動取景整把槍：`_side`、`_left`、`_34`、`_rear34`、`_top`。
- 拿照片比對比例。第一人稱主要看得到槍的**後半部**（拉柄、瞄具、導軌、機匣），這部分要做最細。

## 3. 打包進遊戲
```bash
node tools/guns/pack.mjs
```
- 會把 `tools/guns/*.glb` 全部打包成 `assets/guns/guns.js`。
- 舊的、沒有壓縮的 GLB，可以用 `tools/blender/glb_draco.py` 重新壓縮。

## 4. 接上第一人稱模型（`src/09_models.js`）
在這把槍的 builder 開頭加一行，原本的程序化模型保留成載入失敗時的備用：
```js
m4() { return this.fromGLB('m4a1', { eye: 0.2, eyeRelief: 0.03 }) || this.m4Proc(); }
```
`fromGLB(id, o)` 的參數：

| 參數 | 用途 |
|---|---|
| `skip(node)` | 不顯示某個部件 |
| `muzzle` | 用哪個槍口標記 |
| `hip` | 腰射位置 |
| `eye` | 開鏡時眼睛在瞄具罩後方多遠 |
| `flash` | 槍口火光大小 |
| `reticleScale` | 準心大小 |
| `eyeRelief` | 開鏡時最近物體的最小距離 |

- 槍枝數值（`WEAPON_DATABASE`）不用改。

## 5. 驗證
```bash
sh src/build.sh
```
```bash
node tools/_gunshot.mjs <weapon id>
```
```bash
node tools/_gunreload.mjs <weapon id>
```
```bash
node tools/check.mjs --map 0 --gpu intel
```
- `_gunshot`：腰射和開鏡截圖。開鏡時準心要在窗中央，框架不能擋住大半畫面。
- `_gunreload`：換彈三個階段的截圖。彈匣、拉柄要跟著動，不能有零件脫落。
- `check.mjs`：效能和錯誤檢查。
- 最後在 `PROGRESS.md` 記一段。

## SF2 原版槍＋原版動畫（v62 起，M4A1）
不用 Blender，`node tools/sf2_rig_build.mjs <id>` 直接合成 `tools/guns/<id>_sf2_rig.glb`（再跑 `tools/guns/pack.mjs`）。
1. UModel 匯出（`-game=sf2 -path=D:/SpecialForce2/SFGame/CookedPCConsole`，輸出到 `tools/out/sf2/`）：
   - 槍：`-export -gltf -png rif_<id>`、`rif_<id>_texture`、`rif_<id>_sight`、`weapon_common_part01`（照門）→ `tools/out/sf2/<id>/`
   - 動畫集：`-export -psk rif_<id>` → `tools/out/sf2/<id>_anim/rif_<id>/AnimSet/1st_anim_<id>.psa`
   - 手臂：`-export -gltf -png c_comm_skelet com_1starm_b01`、`com_1stglove_b01`，貼圖 `c_comm_1st_texture`、`c_comm_1sthand_texture`、`c_delta_1st_texture` → `tools/out/sf2/arms/`
2. 槍零件、袖子、手套的 glTF 用同一副骨架、同一個綁定姿勢（UModel：公尺、Y 朝上），所以直接按骨頭名稱合併蒙皮；照門和前準星的插槽沒匯出，照 `sf2_gun_build.py` 的規則放到導軌上，固定在 `weapon_root`。標記 `SIGHT`（覘孔後緣）、`POST`、`MUZZLE` 掛在 `weapon_root` 底下。
3. PSA 動畫寫在同樣的節點上：位置 (x, z, −y) ÷ 100；旋轉同樣換軸，根骨頭以外先取共軛（ActorX 的子骨頭旋轉是反的）。用骨盆、彈匣、Bip01 的靜止姿勢驗證過完全吻合。
4. 遊戲端 `src/09c_sf2rig.js`（`SF2Rig`）：鏡頭放在開鏡姿勢（`Zoom` 最後一格）的瞄準線上、覘孔後 3 cm（和原版開鏡截圖一樣大），整個 viewmodel 不再用程式移動，每幀依狀態混合動畫：`Idle`↔`Zoom`（開鏡程度）、`dash`（衝刺程度），上層 `Reload`（拉長到遊戲的換彈時間）、`Equip`（拔槍，1.6 倍速）、`Fire`／`ZoomFire`（每發）。權重加總永遠是 1。
5. 換彈音效的時間點要照動畫：M4A1 是第 5 格退彈匣、第 27 格插回、第 55 格拉槍機（共 75 格）→ `fromRig` 的 `reloadSounds`。
6. 檢查：`tools/out/rig/` 的渲染（腰射、開鏡、換彈、衝刺、拔槍、開槍），開鏡畫面要和舊版（照原版截圖調的）一樣大。
7. **加一把新槍（v62h）**：
   - UModel：`-export -gltf -png rif_<id>`、`-export -png rif_<id>_texture`、`-export -psk rif_<id>`（動畫集＋含插槽的 `.props.txt`）→ `tools/out/sf2/<id>/`、`<id>_anim/`；槍聲 `-export -sounds Sound_<ID>` → `node tools/sfx_sf2.mjs m4a1 ak103 g36c …`。
   - `tools/sf2_rig_build.mjs` 的 `G` 加一行 `gun('<id>', {...})`：瞄具零件（類別的 `SightOnMesh`）用 `socketSights` 放到 `SightBaseSocketName` 插槽（零件自己的根骨頭對齊插槽）；前準星有一整圈護圈的加 `hoodedPost`。槍口是 `flame` 插槽；`POST` 是槍管中線上最高點（護圈要跳過）。
   - `src/01_core.js` 加武器：時間、`sf2Recoil`、`vmHFov` 90／`vmAdsHFov`（`fZoomedMeshFOV`）、`sf2ZoomIn`（`vLocZoomIN`）、`sf2ReloadSounds`（量 Reload 片段裡 `weapon_magazine`／`weapon_cartridge` 動的格數）、`sf2`（槍聲 id）、`tp`；`src/09_models.js` 加 `<model>(def) { return this.fromRig('<id>_sf2_rig', this._rigOpts(def)) || 備用槍; }`。
   - 開鏡鏡頭：有 `SIGHT` 標記（M4A1）照截圖校正；其他槍眼睛和 `POST` 等高，深度 = 頭部骨頭 − 3 cm − `vLocZoomIN.x`。

8. **配件版（v64，本機 B）**：`gun('<id>', { optic: EOTECH | REFLEX, silencer: SIL('a'|'b'|'c') })`——瞄具放 `Scope` 插槽、瞄準點是瞄具的 `ZoomCrosshair`（`DOT` 標記，遊戲端眼睛對準它、準心貼圖在那裡）；消音器放 `Silencer` 插槽、槍口改成消音器的 `flame`。匯出：`-export -gltf -png weapon_common_part <mesh>`、`-export -psk`（插槽的 `.props.txt`）→ `tools/out/sf2/parts/`、`parts_props/`；貼圖 `-export -png weapon_common_part <tex>`。槍聲 `node tools/sfx_sf2.mjs … <id>=<槍>+silence`。

## 下一批
- **CheyTac M200**：`m200()`。開鏡用 2D 狙擊鏡畫面，所以 `SIGHT` 可以放在鏡管中心。要另外加 `bolt` 部件，供拉栓動畫使用（目前 `fromGLB` 只處理 `mag` 和 `charge`，這部分需要擴充）。
- **P90**：`p90()`。頂置透明彈匣放在 `mag` 部件，換彈的移動方向要另外設定 `magMove`。
