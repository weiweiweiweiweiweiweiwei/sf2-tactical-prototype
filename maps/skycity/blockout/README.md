# 天空之城 方塊草稿（blockout）

- `skycity_blockout.blend`：用 Blender 打開。每個物件是一個純色方塊，名稱為「代號＋中文」。
  - 顏色：灰＝平台、綠＝吊橋、紅＝纜車、紫＝控制器、藍＝箱子、橘＝小屋、棕＝捲揚機、金＝齒輪、白＝鐘樓、半透明藍＝出生區。
- 地上墊的是 SF2 雷達平面圖（`plan_ref.png`），1 格 = 1 公尺。按數字鍵 7 俯視，方向和雷達一樣：A 基地在上、B 基地在下。
- 編輯方式：移動（G）、縮放（S）、複製（Shift+D），或新增方塊並照同樣格式命名，例如 `CRATE_A7 箱子`，存檔即可。
  - 每個物件的 Object Properties → Custom Properties → `note` 裡有說明，可以改寫備註。
- 改完後執行下面這行，會輸出 `layout.json`，遊戲改版時依它擺放物件：
  `blender -b maps/skycity/blockout/skycity_blockout.blend -P tools/blender/sky_blockout_read.py`
- 重新產生草稿（會覆蓋你的修改，請先備份）：`tools/blender/sky_blockout.py`
