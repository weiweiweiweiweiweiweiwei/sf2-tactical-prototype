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

## 反編譯出來的腳本（v62d，`tools/sf2_decompile.py`）
UE3 的 UnrealScript 位元組碼在 `SFGame.upk` 裡，沒有加密。`python tools/sf2_decompile.py SFWeapon.AddSpreadEx` 會印出還原的程式。原生函式（旗標 0x400）只有空殼，本體在加殼的 `sf2.exe`，**沒有去破解加殼**。

| 函式 | 是什麼 | 結果 |
|---|---|---|
| `SFWeapon.AddSpreadEx` | 散射（第三人稱鏡頭、AI 用） | `SpreadNow = SpreadMin + (SpreadMax − SpreadMin) × SpreadRateNow`；方向 = 準心 + RandY·SpreadNow·右 + RandZ·SpreadNow·上，RandY = FRand−0.5、RandZ = √(0.5−RandY²)·(FRand−0.5) |
| `SFWeapon.UpdateLastFiredTime` | 每發開火 | `SpreadRateNow += clamp(FireInterval / SpreadIncRate, 0, 1)`，上限 1 |
| `SFWeapon.FireEndTrace` | 子彈打到哪 | 第一人稱：子彈方向 = **`StartRecoil()` 的回傳值**（原生）；第三人稱鏡頭才用 `AddSpreadEx` |
| `SFWeapon.StartRecoil`、`DecayPunchAngle`、`KickBack` | 後座力本體 | **原生**，讀不到 |
| `SFItem_WeapOption.ApplyItemProperty` | 武器配件 | 後座力配件 `nextCrossVert −= 0.03×等級`；精準度配件 `domInc −= 0.025×等級`；射速配件 `FireInterval −= 0.0013×等級`；傷害 `+0.6×等級` |
| `SFItem_Weap.ApplyItemToWeapByPenalty` | 懲罰 | `nextCrossVert`、`maxCrossVert`、`domDefault`、`domZoomDefault`、`domInc`、`domMax`、`CrossHairSpreadRatio` 各加 `RecoilDurationModifier`（1.5）→ 這些都是「越大越難控」 |
| `SFPlayerController.UpdateRotation` / `TurnBack` | 鏡頭 | 後座進行中（`RecoilResult.recoilState ≠ 0`）時另走一條 `ProcessViewRotation`（原生） |

- 執行時有兩份：`Recoil = RecoilDefault`、`RecoilZoom = RecoilZoomDefault`。只有 44 把槍（FAMAS 等）有獨立的開鏡值；M4A1 沒有，開鏡時用 `Recoil × RecoilZoomModifier`（0.6）。
- 測試用路徑 `bTestRecoil` 呼叫 `KickBack(Spread, Up_Base, Lateral_Base, Up_Modifier, Lateral_Modifier, Up_Max, Lateral_Max, Direction_Change)`——和 Counter-Strike 的 KickBack 同一組參數，看得出設計參考。
- 執行時的後座狀態 `S_RECOIL_RESULT`（`SFPawn_Player.RecoilResult`）：`recoilState`、`currentCrossVert`、`expectCrossVert`、`crossDecreasValue`、`oldrCrossVert`、`crossIncline`、`decline`、`forceDir`、`currentDomValue`、`movingValue`、`movingValueForCrossHair`、`spiny`、`spinz`、`impactIncreaseEye`／`impactDecline`／`impactSpinY`／`impactSpinZ`（中彈晃動）。

## 重建的後座力模型（欄位意義有腳本佐證，動態是依狀態欄位名稱推的）
1. **上跳**：每發 `expectCrossVert += nextCrossVert`，上限 `maxCrossVert`；`currentCrossVert` 以 `vertInc`（旋轉單位/秒，65536 = 360°，M4A1 ≈ 49°/s）追上 `expectCrossVert`。單位是度（`PunchAngleRatio` = 182.04 = 65536/360）。
2. **偏移**：上跳時往 `forceDir`（左或右）偏 `incline` 的比例（`crossIncline`），`forceCorrection`（50）是換邊的機率（%）。
3. **回正**：停火後以 `vertDec`（度/秒）回落，回落速度每秒再加 `crossDecreasInc`。
4. **散布**（`currentDomValue`，度）：起始 `domDefault`（開鏡 `domZoomDefault`），每發 `+domInc`，上限 `domMax`、下限 `domMin`，停火後每秒 `−domDec`。
5. **移動**：`movingValue` 在移動時以 `movingValueInc` 增加到 `maxMovingValue`、停下以 `movingValueDec` 減少，再乘走／跑／跳的 `mulValueWalk`／`Run`／`Jump`。
6. 開鏡：整組 × `RecoilZoomModifier`；蹲下 × `RecoilCrouchModifier`。

對照：我們目前 M4A1 每發上跳 0.69°（`recoilPitch` 0.012 rad），原版腰射 1.26°、開鏡 0.76°，數量級一致。

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
