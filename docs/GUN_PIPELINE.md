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

## 下一批
- **CheyTac M200**：`m200()`。開鏡用 2D 狙擊鏡畫面，所以 `SIGHT` 可以放在鏡管中心。要另外加 `bolt` 部件，供拉栓動畫使用（目前 `fromGLB` 只處理 `mag` 和 `charge`，這部分需要擴充）。
- **P90**：`p90()`。頂置透明彈匣放在 `mag` 部件，換彈的移動方向要另外設定 `magMove`。
