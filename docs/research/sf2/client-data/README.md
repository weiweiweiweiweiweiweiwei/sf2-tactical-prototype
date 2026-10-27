# SF2 原版武器數值（從使用者的安裝檔讀出，2026-10-27）

`weapons.json`：805 把槍（`SFCWeapon*` 類別）的客戶端預設值，已依繼承關係合併（子類別蓋過父類別；結構欄位也逐欄合併，因為打包時結構只存和父類別不同的欄位）。

## 怎麼產生
```bash
python tools/sf2_unlzo.py SFGame
```
```bash
python tools/sf2_weapon_dump.py
```
- `SFGameContent.upk`（各槍類別，未壓縮）和 `SFGame.upk`（基底類別 `SFWeapon` 等，LZO 壓縮，`sf2_unlzo.py` 純 Python 解壓）。
- `tools/sf2_props.py`：UE3（版本 904／授權 14）資料包的屬性標籤解析器，UModel 讀不了 SF2 自訂類別，所以自己讀。單看一個物件：`python tools/sf2_props.py Default__SFCWeaponM4A1`。

## 讀得到、讀不到
- ✅ **數值**：射速 `FireInterval`、傷害 `InstantHitDamage`／`InstantHitDamageMin`、距離 `WeaponRangeDamageMax`／`Min`（單位 1/39.37 m：1574.8 = 40 m）、彈匣、換彈 `ReloadTimes`、拔槍 `EquipTime`、開鏡 `ZoomingInTime`／`fZoomedFOV`／`fZoomedMeshFOV`、散射 `SpreadMin`／`Max`／`IncRate`／`DecRate`、後座力 `RecoilDefault`（`S_RECOIL`）、`RecoilZoomModifier`、`RecoilCrouchModifier`、部位倍率 `DmgScaleBodyParts`、晃動 `fBob*`／`vLag*`。
- ❌ **後座力公式**：`StartRecoil`、`DecayPunchAngle`、`GetRecoilModifyRatioByZoom` 等都是原生函式（腳本裡只有 65–90 位元組的空殼），實際運算在 `sf2.exe` 裡，而 `sf2.exe` 有商業加殼保護（亂碼區段名、熵值 ≈ 8），讀不到。散射的 `AddSpreadEx`（610 位元組）是腳本，之後可以反編譯。
- ❌ **加密設定檔** `SFGame/Config/*.ini`（含 `SFWeapon.ini`）：檔頭 `FD 00`＋4 位元組長度，內容是 8 位元組區塊加密＋CFB 回饋（前 8 位元組的奇數位置在 46 個檔案裡相同，分歧都在 8 的倍數）。金鑰和演算法在加殼的 exe 裡，沒有再追。

## `S_RECOIL` 欄位（M4A1，括號是推測，未驗證）
| 欄位 | M4A1 | 推測 |
|---|---|---|
| nextCrossVert | 1.26 | 每發往上跳（度） |
| maxCrossVert | 14 | 累計上跳上限（度） |
| vertInc / vertDec | 9000 / 12 | 上跳套用速度（旋轉單位/秒，65536 = 360°）／回復速度 |
| incline | 0.5 | 左右偏向 |
| domDefault / domInc / domMax / domMin / domDec | 0.25 / 0.13 / 2.0 / 0.1 / 6 | 左右飄移：起始、每發增加、上限、下限、回復 |
| domZoomDefault | 0 | 開鏡時的起始左右飄移 |
| crossDecreasInc / forceCorrection | 9 / 50 | 停火後回正 |
| maxMovingValue / movingValueInc / Dec | 0.7 / 100 / 30 | 移動時的額外散射 |
| mulValueWalk / Run / Jump | 0.05 / 0.8 / 6 | 走、跑、跳的倍率 |
| CrossHairSpreadRatio | 3.5 | 準星張開倍率 |

其他 M4A1：射速 0.096 s、傷害 35（最低 26.88）、40 m 起衰減到 70 m、換彈 2.3 s、拔槍 0.8 s、開鏡 0.25 s、開鏡視角 55°、開鏡槍模視角 35°、開鏡後座 ×0.6、蹲下 ×0.9、`PunchAngleSpringConstant` 40／`Damping` 18。
