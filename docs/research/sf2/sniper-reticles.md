# SF2 狙擊鏡十字（2026-10-28，從使用者安裝檔讀出）

十字不在槍的類別上，而在**鏡子零件**上。一把槍的零件清單是 `SFCItem_<槍>` 的 `DefaultItemClassNames`；鏡子零件 `SFCItem_*_Scope` 的 `SightCrosshair` 指向 `common_sight` 包裡的材質，沒有指定就用類別預設 `SFItem_WeapOption_Scope.SightCrosshair` ＝ `common_sight.mic_ScopeView`。

| 槍 | 鏡子零件 | SightType | 十字材質 | 貼圖 |
|---|---|---|---|---|
| TRG-41 | `Common_Scope_Zeiess` | 18 | `ScopeView_Reticle_03` | `scope_Reticle_03`：細紅十字貫穿、中心小點 |
| M40A1 | `Cz700_Def_Scope` | — | 預設 `mic_ScopeView` | `tex_scope_Crosshair_Diffuse`＋`_dot`：外側粗桿、中間細線、中心斷開＋紅點、下方測距刻度 |
| CZ700 | `Cz700_Def_Scope` | — | 預設 `mic_ScopeView` | 同上 |
| CheyTac M200 | `CheyTac_Def_Scope` | 11 | 預設 `mic_ScopeView` | 同上 |
| AWP | `AWP_Def_Scope` | 21 | 預設 `mic_ScopeView` | 同上 |
| K14 | `Common_Scope_Bender` | 12 | `ScopeView_Reticle_06` | `scope_Reticle_06`：中心圓、帶刻度橫桿、下方粗柱和測距線（和 v64f 照使用者截圖量的一致） |
| Barrett | `Barret_Def_Scope` | — | `mic_ScopeView_03` | `tex_scope2_Crosshair_Diffuse`＋`tex_scope_Crosshair_dot` |

- 其他鏡子：Dragunov 13、K14 winter 14、Kar98k 15、PM2 16（`mic_ScopeView_01`）、PM50 17（`_03`）。
- 匯出：UModel `-export -png common_sight` 匯出到 `tools/out/sf2/reticle/common_sight/`。對照圖在 `tools/out/sniper_reticles.png`。
- 尚未查明：`SightType` 編號（12、18、21…）可能決定鏡筒外框或倍率，還沒找到用它的程式碼。
