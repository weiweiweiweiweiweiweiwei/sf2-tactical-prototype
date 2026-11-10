# SF2 音效設計與手榴彈投擲（2026-11-10 調查）

資料來源都是使用者電腦裡的 SF2 安裝檔（`D:/SpecialForce2/SFGame/CookedPCConsole/`）：

- 先用 `tools/sf2_unlzo.py <包>` 解壓縮。
- 再用 `tools/sf2_sound_dump.py <包…>` 把 SoundCue、節點、SoundClass／SoundMode、SFSoundGroup 的屬性全部列出。
- 遊戲邏輯用 `tools/sf2_decompile.py <類別.函式>` 反組譯，類別預設值用 `tools/sf2_props.py`。

## 1. 命中音和擊殺音

| 事件 | SF2 用的東西 | 音量 | 其他 |
|---|---|---|---|
| 子彈打中人（自己聽） | `Sound_common` 的 `Hit.HitNormal_cue` → `bullet_hit_2d_03` | Cue 1.0 × 調變器 **1.5–2.0** | 音效類別 Weapon |
| 致命一擊 | `Hit.HitDead_cue` → `Bullet_flesh_01–05` 隨機一個 | 1.0 | 音高 0.8 |
| 擊殺回饋 | `SFKillMessage.GetKillFeedBackSound`，依這次擊殺最強的訊息分五級：`hud_kill_default`／`normal`／`special`／`rare`／`continuous` | 音檔原音量 | 五級的規則見 `src/16_match.js` `_killAnnounce` |
| 對照：M4A1 開槍 | `Cue_WeaponFire` | 0.81 × 1.4 = **1.13** | |
| 對照：AWP 開槍 | `Cue_WeaponFire` | 1.0 × 1.4 = **1.4** | |

**SF2 的設計**

- 命中音比自己的槍聲還大聲：1.5–2.0，對比 M4 槍聲 1.13、AWP 槍聲 1.4。
- UE3 沒有總線壓縮器，所以槍聲再大也不會把命中音壓下去。

**我們的問題（v67m 已修）**

- 命中音的音量只有槍聲的 0.7 倍，而且和槍聲一起經過總壓縮器。
- 開槍那一瞬間壓縮器會壓低 10–11 dB（`tools/out/_killsnd.mjs` 實測），命中音、擊殺音被自己的槍聲蓋掉。
- 狙擊槍槍聲最大、尾音最長，所以擊殺音幾乎聽不到。

**修法（v67m）**

- 命中音、擊殺音走獨立的「回饋總線」，不經過壓縮器，最後才和其他聲音合併，再經過只削峰值的限幅器（−1 dB）。
- 音量照 SF2 的比例：我們的近距離槍聲 0.95 對應 M4 的 1.13，
  - 命中音 1.5–2.0 × 0.84
  - 致命一擊 1.0 × 0.84
  - 擊殺回饋 1.0 × 0.84
- 閃光彈的悶耳效果，回饋總線也照樣套用。

**附帶發現**

- `kill3_New`（`cue_kill3_new`，Cue 音量 1.5）的音檔解出來是全靜音，SF2 實際上沒有用它。
- SoundUX 裡還有 `hit_target01`（`hud_kill_fx_3`，音量 8.0），是靶場打靶的命中音，不是對戰用的。

## 2. 其他音效

### 背景音樂（BGM）

- 大廳：`SFGFxLobby.GetLobbyBGM` 預設事件名 `BGM`，對應 SoundUX 的 `Cue_LobbyBGM`。
- 對戰中：`SFGameReplicationInfo.PlayInstantBGM(名稱)` 從 `InstantBGMList` 找到 BGM 後，用 `PlayBGM(路徑, 淡入, 淡出, 長度)` 播放。
- `Music_BGM_001` 的音檔：

| 音檔 | 長度 | 用途 |
|---|---|---|
| `Start01`、`Start02` | 11 s | 開場 |
| `TDM_Start` | 9.7 s | 團隊死鬥開場 |
| `Win01` | 13.8 s | 勝利 |
| `lose01` | 11.9 s | 失敗 |
| `Full` | 63 s | 整首 |
| `JinglBell01／02` | — | 聖誕節 |
| `Ya_Allah` | 520 s | 循環播放，中東地圖的環境音樂 |

- `BGM_001`：PVE 魔王開場／結束、大廳 PVE BGM、玻璃模式 BGM。
- 每張地圖有自己的 `<地圖>_Sound.upk`（例如 `Alcatraz_Sound`）放環境音。`Sound_Ambient_001` 只有一個測試 Cue。

### 成就／徽章／升級

| 事件 | Cue | 音檔 | 音量 |
|---|---|---|---|
| 對戰中完成挑戰（徽章跳出） | `Cue_Challenge_InGamePopUp` | `Lobby_GachaBest06` | 2.0 |
| 對戰中升級 | `Cue_HUDLevelUp` | `hud_levelup02`（1.95 s） | UI 類別 |
| 大廳升級 | `Cue_LobbyLevelUP` | `lobby_levelup`（3.16 s） | — |
| 只剩最後一人 | `Cue_LastManStanding` | — | — |
| 「Good job」 | `hit_good` | `oper_kill_goodjob` | — |

- 另有 `hud_special01／01-3／02` 三個特殊提示音。

### 擊殺語音（播報員）

- `KillAnnounce`（男聲）和 `KillAnnounce_female`，各 24 句，由 `SFSoundGroup_Voice KillAnnounce` 依事件名稱挑選：
  - FirstBlood、DoubleKill、MultiKill、Specialist、Specialforce、SpecialForceKill
  - HeadShot、HeadshotKill、GrenadeKill、KnifeKill、Slash、BackAttack
  - Revenge、LastOneShot、PiercingShot、WallShot、WelcomeBack、Excellent、goodjob、Strike、Splash 等
- 模式播報：`MissionAnnounce`（111 句，另有台灣版 `_TWN`），`SoundGroupAnnounce` 依模式分組（爆破、佔點、護送、防守、逃脫、團隊……）。

### 無線電（對講機）

- 按鍵選單：`SFPlayerController.HandleRadioMessage(數字鍵)` → `SendRadioMessage`。
- 語音：`SFRadioMessage.AnnouncementSound` 依「訊息編號＋隊伍」從 `RadioVoice` 找音檔。
- 四組選單：`SoundGroupRadioMessage` 的 Auto（自動回報）／Command（指令）／Community（交流）／Mission（任務），各有男女版。
- 角色聲音包：`RadioMessage_Male`、`_Female`、`_Alice`、`_Cheerleader`、`_Sakura`、`_Sera`。男聲 99 句，例如：
  - 方位：`m_radio_near_<n>clock`
  - 交流：`m_radio_communicate_roger`／`negative`／`thanx`／`niceshot`
  - 任務：`m_radio_mission_plant`／`defuse`
  - 敵人兵種：`m_radio_near_Sniper`／`MG`／`RPG`
  - 投擲提醒：`m_radio_near_grenade`
  - 自動回報：`m_radio_auto_contact`
- 無線電音效類別 `VoiceRadioMessage`，爆炸、閃光彈、回合結束時，SoundMode 會把它和其他聲音一起壓低。

### 情境混音（SoundMode）

| 情境 | 效果 |
|---|---|
| 瀕死 | 環境、武器音量 × 0.05，音高 × 0.3 |
| 爆炸／閃光彈 | 一般音效 × 0.2，音高 × 0.3 |
| 回合結束 | 一般音效 × 0.1（淡入淡出 1 s） |
| 對戰結束 | 一般音效 × 0 |

## 3. 手榴彈、閃光彈、煙霧彈的投擲距離

三種投擲物的設定相同：

- `SFCProjectileM67`／`M84`／`M18`：`Speed` 1800、`MaxSpeed`／`TerminalVelocity` 1900 UU/s。
- `CustomGravityScaling` 0.7（世界重力 970 → 679 UU/s²）。
- 反彈 `fDampingValue` 0.6。
- `SFProjectile.Init`：
  - 速度 = 瞄準方向 × 1800，再往上加 `TossZ` 200 UU/s；
  - 再加上玩家自己的速度（`OwnerInertiaApplyRatio` (1, 0, 1)：只有前後和上下，左右不算）。
- **沒有蓄力**：左鍵、右鍵都用同一個投擲物，速度固定。只有道具效果會改 `SFPawn.ThrowSpeed`。
- 引信：閃光彈 `LifeSpan` 2.5 s；煙霧彈停下後 0.5 s 冒煙、持續 7 s；破片手榴彈約 2.5 s（同 M84；`SFProj_HandGrenade` 本身沒寫）。

**換算成公尺**（1 UU = 1 cm；從眼高 1.23 m 丟出，平地、不算反彈）：

| 仰角 | SF2（18 m/s，重力 6.8） | 我們目前：蓄滿力（21.6 m/s，重力 20） | 我們目前：輕點 |
|---|---|---|---|
| 0°（平丟） | 17 m，1.0 s | 11.5 m，0.6 s | 2.9 m |
| 15° | 37 m，2.1 s | 18 m，1.0 s | — |
| 30° | 52 m，3.3 s | 21.5 m，1.4 s | 3.5 m |
| 45° | 54 m，4.3 s | 21 m，1.7 s | 3.1 m |

**差異**：SF2 不用蓄力就丟得很遠，而且弧線慢、飛得久，最遠約 54 m。我們最遠約 21 m，而且要蓄力。主要差在重力：手榴彈的物理世界用舊的 20 m/s²，SF2 是 6.8 m/s²。
