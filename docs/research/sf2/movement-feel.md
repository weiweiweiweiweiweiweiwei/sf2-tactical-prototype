# SF2 走路／奔跑的畫面晃動、持槍晃動、腳步聲（2026-11-01，只讀資料）

使用者 11-01：「官方走路和快速奔跑，畫面是否會搖晃？持槍時的搖晃動畫速度？一般走路和快速奔跑的腳步聲？」

來源：`SFGame.upk`（`tools/sf2_unlzo.py SFGame` 解壓後用 `tools/sf2_props.py` 讀預設值、`tools/sf2_decompile.py` 反組譯）、`SFGameContent.upk`、`SFPhysicalMaterial.upk`、`Sound_FootSteps.upk`。實際套用這些數值的程式（`SFHandActor.UpdateMeshState`、`UpdateMeshPosition`）寫在 `sf2.exe` 裡，而 `sf2.exe` 有加殼保護，只讀得到參數，讀不到公式。

## 1. 畫面（鏡頭）會不會晃
- `SFPawn_Player.BobValue` 是 0.01，非常小。腳本裡沒有任何地方用它（只有原生程式碼會用），推測走路、奔跑時鏡頭幾乎不晃。
- 鏡頭的晃動參數（`CameraShakeMax` 5、`CameraShakeYawRatio` 0.5、`CameraRestoreRate` 10、`ShakeChanceByBodyParts`）都是「被打中時」用的（`SFCameraModifier_ShakeByDamage`），跟走路無關。
- 落地：`LandEyeHeightDamping` 0.25（落地時眼高下沉後回彈的阻尼）。

## 2. 持槍晃動（槍模，不是鏡頭）
`SFWeapon` 基底值和兩把例子：

| 參數 | 基底 | M4A1 | AWP | 意思（推測） |
|---|---|---|---|---|
| fBobSpeedMux | 8.0 | 8.7 | 8.0 | 晃動速度倍率（跟移動速度相乘） |
| fBobWidth | 1.0 | 0.8 | 0.8 | 左右幅度（cm） |
| fBobHeight | 0.5 | 0.2 | 0.3 | 上下幅度（cm） |
| BobDamping | — | 0.4 | 0.4 | 晃動的阻尼 |
| ZoomBobDamping | — | 0.4 | 0.15 | 開鏡時的阻尼 |
| fBobDecRateForZoom／Z | 1.0／1.0（子彈槍 0.2／0.5） | 0.5／0.7 | 0.1／0.1 | 開鏡時左右／上下幅度的倍率 |
| DashAnimSpeed | 1.0 | 0.0 | 0.0 | 衝刺動畫（dash 片段）速度 |
| fStartSprintTime／fEndSprintTime | — | 0.25／0.25 | 0.333／0.333 | 進入、離開衝刺姿勢的時間（秒） |
| vLagMaxDegree | (0,10,10) | (0,20,20) | (0,20,20) | 轉視角時槍模落後的最大角度 |
| vLagRotSpeed | (0,5,5) | (0,10,10) | (0,12,12) | 落後回正的速度 |
| fWeaponSteadyLength／Walk／Fire | 1.0／0.5／1.0 | 2.6／—／0.2 | 2.0／—／0.2 | 停下來後槍「穩住」的時間 |

- 衝刺時的晃動是動畫本身（dash 片段），`DashAnimSpeed` 0 推測表示依移動速度播放，公式在 `sf2.exe` 裡。
- 遊戲目前是：走路 sin 晃動，頻率 = 移動速度 × 1.85，衝刺 × 2.1 × 0.6；dash 片段以 0.6 倍速播放（v63e 使用者覺得太快）。

## 3. 腳步聲
- 由角色動畫的落腳事件觸發（`SFPawn.PlayFootStepSound` → `SFPawnFX.ActuallyPlayFootSound`），依腳下的物理材質選音效，每 0.1 秒最多重查一次材質。
- **一般走（跑）和衝刺是兩組不同的音效**：每種地面都有 `FootStepSound`（`Cue_Run_<地面>`）和 `FootStepSoundDash`（`Cue_Dash_<地面>`），落地另有 `Cue_Land_<地面>`。地面有 Concrete、Metal、Metalgrate、Wood、Woodpanel、Tile、Glass、Bgglass、Grass、Soil、Sand、Mud、Snow、Water、DeepWater、Slosh、Fabric、Chain（`Sound_FootSteps.upk`）。
- 衝刺狀態另有 `Sprint.PlayFootStepSound`：兩次腳步聲最少間隔 `SprintStepSoundInterval`。
- **連續衝刺超過 3 秒，會加上喘氣聲**（`Breath[0]`／`[1]` 左右交替），音量 = clamp((衝刺秒數 − 3) ÷ 5, 0, 1) × clamp(速度 ÷ 200, 0, 1)。也就是第 3～8 秒漸漸變大。
- 別人的腳步聲在 3937 單位（約 39 m）內才播；同時播衣物摩擦聲（`PlayRustleSound`）。
- 靜步（Shift 走）有沒有腳步聲：腳本看不出來（落腳事件來自動畫）。
- 遊戲目前是：走 2.1 m、衝刺 2.5 m 響一聲，用 CC0 錄音（`assets/sfx.js`），沒有分走路和衝刺兩組，也沒有喘氣聲。
