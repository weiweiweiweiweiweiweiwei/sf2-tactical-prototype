# SF2 的 AI 機器人（2026-11-24，從 `SFGame.upk` 腳本讀出）

工具：`tools/sf2_decompile.py`（函式）、`tools/sf2_props.py --pkg tools/out/sf2/SFGame_dec.upk`（預設值）。名稱清單 `tools/out/_sf2ai_names.txt`。

## 架構

- 練習模式（「訓練用 AI 敵軍」）＝ `SFAITeamDeathGame`：每隊預設 5 個 AI，預設武器 `SFCItem_M4A1`，`bUseRandomAIWeaponSystem` 隨機配槍。AI 類別有 `SFAIController_Rifleman`、`_Sniper`、`_Shotguner`、`_SPW`（機槍），都繼承 `SFAIController_Human` → `SFAIController_Solider`。
- 行為由「指令」組成（`AICmd_*`）：攻擊（遠程、近戰、丟手榴彈）、移動（巡邏 Roaming、遊走 Wandering、戰術走位 Tactic、壓制目標 SuppressiveTarget）、閃手榴彈 `AICmd_EvadeGrenade`、側步 `AICmd_StepAside`。
- 觸發用「反應條件」（`AIReactCond_*`）：看到敵人、新敵人、敵人靠近又看得到、被瞄準、受到傷害、血量門檻、手榴彈、敵人移動、敵人跑出射程。
- `SFAIController_Solider` 的狀態：`Idle` → `Roaming`（巡邏找人）→ `Combat`（交戰）→ `Dead`。

## 難度：4 級（`BattleLevel` 0–3）

每個 AI 的 `BattleLevel` 取自房間的 AI 難度（`SFAITeamDeathGame.AITeamDifficulty`，**兩隊可以設不同難度**）。下列表格都用這個等級當索引。

| 項目（類別．屬性） | 0 | 1 | 2 | 3 | 意思 |
|---|---|---|---|---|---|
| `Human.SpreadAdjust` | 2.0 | 1.2 | 0.7 | 0.3 | 開槍散布倍率（越小越準）；對真人玩家再 × `vsAIspread`（狙擊 1.5，其他 1.0） |
| `SFAggroSystem.AwaitDefList` 遠／中／近 | 1.0／0.8／0.6 | 0.8／0.6／0.4 | 0.6／0.4／0.2 | 0.4／0.2／0.1 | 發現目標到開火的等待秒數（反應時間），依距離 |
| `SFAggroSystem.AggroChaseTime` | 7 | 10 | 14 | 18 | 失去目標後持續追擊的秒數 |
| `SFAggroSystem.AINoiseLevelList` | 0.8 | 1.0 | 1.2 | 1.5 | 聽力倍率（腳步、槍聲聽得多遠） |
| `Human.BattleRotationRate` | 1 | 2 | 4 | 8 | 戰鬥時轉身速度倍率 |
| `Human.TacticMoveDelays` | 1.0±0.5 | 0.2±0.1 | 0.1±0.1 | 0 | 交戰中走位前的停頓秒數 |
| `Human.TacticMoveDirs` | −0.7±0.3 | 0±1.0 | 0.5±0.7 | 0.7±0.3 | 走位方向（負＝後退、正＝前壓） |
| `Human.SpreadTargetMeter` | 3 | 5 | 8 | 10 | （推測）目標周圍的散布距離 m |
| `Human.BackupChance` | 0.1 | 0.3 | 0.6 | 0.8 | 支援隊友的機率 |
| `Human.SniperAvoidChance` | 0.1 | 0.4 | 0.7 | 0.9 | 閃避狙擊手的機率 |
| `Human.PassSpecialBomb` | 0 | 0.1 | 0.3 | 0.5 | 避開特殊炸彈效果的機率 |
| `Solider.EvadeChance` | 0 | 0.5 | 0.8 | 1.0 | 閃避機率 |
| `Solider.CampingRatio` | 0 | 0.3 | 0.6 | 0.8 | 蹲點的比例（狙擊 `SniperCampingRatio` 0／0.3／0.6／1.0） |
| `Solider.PointCampingStay` | 1.0 | 2.0±0.5 | 3.5±1.0 | 4.0±2.0 | 蹲點停留秒數 |
| `Solider.PointCampingDist` | 0 | 400±50 | 200±50 | 0 | 蹲點離目標點的距離（UU，100＝1 m） |

「±」是隨機變化（`VariationTacticTime`：基準 ± 亂數 × 變化量）。

## 其他固定數值（`SFAIController` 預設）

- 對敵距離分級：近 650、中 1400、遠 3600 UU（6.5／14／36 m）。推測就是反應時間表的近／中／遠分界，因為 `GetWaitTime` 寫在 sf2.exe 裡，讀不到公式。
- 發現敵人後至少 0.5 秒才反應（`Response_MinEnemySeenTime`）；聽到 0.25 秒、受傷 0.25 秒；20 秒沒看到就放棄（`Response_EnemyTooLongNoSeeTime`）。
- 辨識半徑 `RecognizeRadius` 1000 UU（10 m）；目標移動超過 512 UU 就重新找路。
- 閃手榴彈：跑開到爆炸半徑 × 1.5（`GrenadeEvadeAwayRatio`），`Solider.ChanceToEvadeGrenade` 1.0。
- 噪音距離（`AINoiseDefList`，× 聽力倍率）：跑步 10、衝刺 15、消音開槍 10、開槍 25（單位應為 m）。
- 瞄準（`GetAdjustedAimFor`）：瞄目標位置往上半個眼高；跟自己面向差太多（夾角 cos < 0.7）就不轉槍、照原方向射。
- 開火節奏：`ResetFireWait` 用上面的反應時間設定開火計時器，`AutoAttackStart`／`AutoAttackEnd` 交替（連射、停頓）。
- 走路／衝刺（`ShouldWalk`）：沒在開槍又往前移動時衝刺。
- 推薦交戰距離：各武器的 `GetAIRecommRange()`。

## 讀不到的部分

- `SFAggroSystem.GetWaitTime`、`AggrDists` 的距離分界是原生程式碼（sf2.exe），只能從上表推測。
- 選單上 4 個等級的中文名稱沒有在腳本裡。
