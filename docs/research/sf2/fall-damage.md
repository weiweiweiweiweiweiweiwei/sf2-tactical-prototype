# SF2 跌落傷害（2026-11-05，從使用者安裝檔的 SFGame.upk 反編譯）

工具：`python tools/sf2_decompile.py SFPawn.TakeFallingDamage`、`SFPawn.CalcFallingDamage`、`SFPawn.Landed`；預設值 `python tools/sf2_props.py --pkg tools/out/sf2/SFGame_dec.upk Default__SFPawn`。

## 數值（`Default__SFPawn`，1 UU = 1 cm）
- `MaxFallSpeed` 1250 UU/s（12.5 m/s；引擎 Pawn 預設 1200，SF2 改成 1250）
- `FollingDamageDecrement` 1.0（減傷倍率，程式裡夾在 0.1–1；預設不減）
- `FallingDownDamagePct` 5.0（踩到別人頭上時給對方的倍數，見下）
- `JumpZ` 500、世界重力 `DefaultGravityZ` −970 UU/s²（9.7 m/s²）
- `AIMaxFallSpeedFactor` 1.1（電腦玩家找路時可接受的落差，不影響傷害）

## 公式（`SFPawn.TakeFallingDamage`）
落地時的垂直速度 V（向下為負）：
1. V 比 −0.5 × MaxFallSpeed（−6.25 m/s）還快：發出落地噪音（敵人聽得到）。
2. V 比 −MaxFallSpeed（−12.5 m/s）還快才扣血。在水裡 V 先加 100（減 1 m/s）。
3. **傷害 = int( −100 × (V + MaxFallSpeed) / MaxFallSpeed × FollingDamageDecrement )**
   = 100 × (落地速度 − 12.5) / 12.5，**照速度線性，不是照高度**。速度 25 m/s 時 100 傷害（必死）。
4. 傷害類型 `SFDmgType_Fell`，走一般的 `TakeDamage`（防具照算）。

沒扣血時：V < −1.4 × JumpZ（−7 m/s）大噪音、V < −0.8 × JumpZ（−4 m/s）小噪音。

## 換成高度（SF2 的重力 9.7 m/s²，h = V² / 2g）
| 落差 | 傷害 |
|---|---|
| 8.05 m 以下 | 0 |
| 10 m | 11 |
| 12 m | 22 |
| 15 m | 36 |
| 20 m | 57 |
| 25 m | 76 |
| 32.2 m | 100（必死） |

## 踩頭（`SFPawn.Landed`）
落在別的玩家身上時，自己不扣血，被踩的人受到 **5 × 跌落傷害**（類型 `SFDmgType_CrashStep`）。友軍要開友傷才算。
也就是說，要從 8 m 以上掉下來才會踩傷人；從 10 m 踩下去，對方扣 55。

## 遊戲裡（v66u 起照官方，`src/12_player.js`）
- 已套用：官方公式（照高度換算速度）＋踩頭 5 倍。以下是改之前的比較。

## 改之前的比較（v34–v66t 的 FALL_SAFE / FALL_LETHAL）
- 我們：3.5 m 以下不扣，11 m 以上必死，中間照高度線性（當時查不到官方值，照 CS／UE 的做法）。
- SF2：8.05 m 以下不扣，32.2 m 才必死，中間照速度線性。官方寬鬆很多。
- 注意：v66q 起我們的重力是 20 m/s²（不是 SF2 的 9.7），所以要照「高度」換算，不能直接拿速度 12.5 / 25 m/s 套用。
- 保留意見：重力是引擎預設值，個別 SF2 地圖若自己改了重力（WorldInfo），實際門檻會不同；地圖檔沒有逐一查。
