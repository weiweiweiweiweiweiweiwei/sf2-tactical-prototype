# 邊境要塞（SF2 `tower`）佔領模式：中央機台升起（2026-11-18，`tower.upk` 的 Kismet）

傾印：`tools/out/_tower_kismet.txt`。

- 升起的物件：`InterpActor_3`，模型 `TW_Satellite_Trigger_001`，位置 UE (−320, 768, 520)（據點 `SFCaptureVolume_0` 正下方，據點在 z 704），有碰撞（bBlockActors）。
- 時間：`SeqEvent_LevelLoaded`（主機端）→ `SeqAct_Delay_1` 119 秒 → `SeqAct_Interp_0` 播 `InterpData_0`：2.0 秒內往上 100 UU（約 1 m），曲線 AutoClamped（慢起慢停）。升完剛好是第 120 秒據點開放。
- 衛星天線（骨架模型，群組 TW / TW_mini，位置 (−322, 768, 1316)）：`InterpData_1`「Blue(Close)」播 `operate_end`、音效 `Cue_csatellite_attack_off`；`InterpData_2`「Red(Open)」播 `pre_operate`；各 5 秒，用戶端各自播放。由佔領事件（`SFSeqEvent_CaptureVolume` → `SFSeqAct_ModeState` RedOccupied / BlueOccupied）觸發。
- `InterpData_3`「Particle」5 秒，粒子＋`Cue_csatellite_attack_on`。另有 Delay 30 s、13 s 兩段。
- 我們的地圖：`TW_Satellite_Trigger_001` 已在 `tools/out/sf2/maps/tower.json`（placed[1]，actor InterpActor），目前和其他模型合併成靜態網格，停在降下的位置。
