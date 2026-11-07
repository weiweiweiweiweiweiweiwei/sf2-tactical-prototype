# SF2 大廳／房間介面（調查，2026-11-07）

使用者 11-07：想先做遊戲的初始介面（大廳、房間），還原 SF2 官方風格，倉庫、好友等按鈕和原作一樣。

## 資料在哪
- `D:/SpecialForce2/SFGame/CookedPCConsole/SFUI_Lobby.upk`（34 MB，未壓縮）：189 個 Scaleform（Flash）介面 + 296 張打包貼圖。
  - `gfx_navi` 上方導覽列（商店、倉庫、好友…的圖示按鈕）、`gfx_channel_list` 頻道、`gfx_server_browser` 房間列表、`gfx_waitroom_new`（及 16vs16／AITDM／zombie…）房間、`gfx_makeroom_dialog` 建房、`gfx_inven` 倉庫、`gfx_messenger` 好友、`gfx_login`、`gfx_shop`、`gfx_comm_asset*` 共用素材、`gfxfontlib` 字型。
  - 舞台 1024×768；腳本是 AS2（Scaleform CLIK 元件 `gfx.controls.*`、`com.scaleform.udk.*`）。
- `SFFrontEnd_new.upk`（LZO，`tools/sf2_unlzo.py` 解開）：大廳背後的 3D 場景（粒子、Matinee）。`Background*.upk`：背景圖。

## 工具（v67f 起）
- `python tools/sf2_ui_extract.py` → `tools/out/sf2/ui/swf/<名>.swf`（SwfMovie 的 RawData：GFX／CFX 檔頭改成 FWS）。
- UModel 匯出貼圖：`umodel_64.exe -game=ue3 -path=… -export -png -out=tools/out/sf2/ui/tex SFUI_Lobby.upk`（296 張，命名 `<介面>_I<編號>`，都是 512 px 圖集）。
- `python tools/sf2_swf_flatten.py [介面…]` → `tools/out/sf2/ui/flat/`：Scaleform 的 DefineExternalImage2（1009：圖集）／DefineSubImage（1008：圖集裡的一塊，`字元編號, 圖集編號, x1, y1, x2, y2`）換成一般 Flash 的 DefineBitsLossless2，讓 Flash 播放器看得懂。
- `python tools/sf2_swf_place.py <介面> <元件名>[@x,y[,縮放]] …`：把匯出的元件放到根時間軸（`#<編號>` 可放未匯出的元件）。
- `node tools/out/ruffle/shot.mjs <檔名…>`：Ruffle 0.7.1（npm `@ruffle-rs/ruffle`，裝在 `tools/out/ruffle/`）在無頭 Chrome 畫出來 → `tools/out/sf2/ui/shots/`。

## 發現
- 整頁畫面不是靜態排好的：每個介面的根時間軸只有一個空的 `container`，大廳／房間是 AS2 程式在執行時依遊戲資料 `attachMovie` 組起來的，所以直接播放全黑。
- 單一元件可以畫：`gfx_navi` 的 91 個元件總覽（`tools/out/sf2/ui/shots/navi_components.png`）——導覽列圖示按鈕（商店、說明、排行、統計、改裝、倉庫、武器、準星…）、按鈕三態、日曆、箭頭等都出來了。
- `gfx_waitroom_new`、`gfx_server_browser` 的元件總覽全黑：有元件讓整個 Flash 停止繪製；Ruffle 也報「字元編號重複」（引入共用素材 `gfx_comm_asset` 時編號撞到）。
- 版面（每個按鈕在畫面的位置）要嘛寫在程式裡、要嘛在執行時才決定：沒有原作的截圖很難排得和原作一樣。
