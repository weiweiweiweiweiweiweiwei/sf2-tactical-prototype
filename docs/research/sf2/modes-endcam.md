# SF2 結束運鏡、殭屍模式、玻璃模式（2026-11-18 調查）

資料來源：`tools/out/sf2/SFGame_dec.upk`。反組譯用 `tools/sf2_decompile.py`，預設值用 `tools/sf2_props.py`。

## 1. 分出勝負後的運鏡

1. `SFPlayerController.MatchEndCutscene(bWinnerCutScene)` 先決定贏的隊（`WinningTeam`）。
2. 再呼叫 `SFGameReplicationInfo.MatchEndSequence`。
3. 這個函式發出地圖 Kismet 的 `SFSeqEvent_Mission` 事件：
   - 團隊戰依「你是紅／藍隊 × 贏／輸」選 0–3 號事件；
   - 個人戰用 `GetSingleMatchEventIndex`。
4. 地圖自己的 Matinee（過場動畫）接手播放：
   - 每張地圖各自做好一段攝影機路線，就是使用者說的「環繞地圖運鏡」；
   - `GetMatineeMeshChangingTeam`（原生函式）把動畫裡的角色換成贏方的隊伍外觀。

**結論**

- 程式只負責「發事件」，運鏡路線是每張地圖手工做的，存在各地圖的 Kismet／Matinee 裡，不在程式中。
- 要在我們的遊戲做，需要自己幫每張地圖設計鏡頭路線，或寫一個通用的自動環繞鏡頭：以地圖中心為圓心、半徑取地圖範圍、高度 20–30 m、繞一圈約 8 秒。

**同一時間的設定**

- 結束 BGM：`MatchEndBGM_WIN`／`_LOSE`，淡入 0.5 s、淡出 2 s、長度 7 s。
- `SFPawn.ThirdPersonCameraScaleAtMatchIsOver` 3.0：結束時第三人稱鏡頭的距離倍率。

## 2. 殭屍模式（合作打電腦）

SF2 有三種相關模式：

| 類別 | 是什麼 |
|---|---|
| `SFSurvivalGame`（PvE 生存） | 玩家同隊，對抗一波一波的 AI 怪物 |
| `SFZombieSurvivalGame` | 生存模式的殭屍版：玩家用 `SFCPawn_ZombiePlayer`，配發固定武器 |
| `SFZombieHideSeekGame` | 殭屍躲貓貓：人類對殭屍玩家，**不是合作** |

使用者要的「組隊一起挑戰」，對應的是生存／殭屍生存。

### 生存模式的規則（`SFSurvivalGame`、`SFSurvivalGameReplicationInfo`）

- **波次**：
  - `SetMaxWaves`、`CheckWaveEnd`、`SetCurrentWave`；
  - 波次內容由地圖的 `SFTrigger_PvEWaveInfo`／Kismet `SFSeqAct_PvEWaveInfo` 決定；
  - 打完一波後 2 秒內可以觸發下一波（`AllowedTimeToUseNextWaveTrigger` 2.0）；
  - `MaxWaveCounterToPass` 5。
- **倒地（DBNO）與救援**：
  - 被打倒先倒地，不是直接死，隊友可以救（`bUseDBNO`、`NotifyDBNO`、`GetMemberRevivalCount`）；
  - 真的死掉要等 20 秒才重生（`RespawnDelayForRIP` 20）。
- **勝負**：
  - 全隊都倒地或死亡就輸（`CheckSurvivor`）；
  - 敵人清光算過關（`CheckExtermination`）。
- **金錢與商店**：
  - 殺怪拿錢（`CalculatePVEMoney`、`AddWallet`），對戰中可以開商店（`bUseInGameStore`）；
  - 殭屍版有「仇恨倍率」：賺到 60 元時怪物仇恨 × 2。
- **經驗值**：

| 模式 | 殺一隻 AI | 救人 | 過一波 | 難度倍率 |
|---|---|---|---|---|
| 生存 | 20 | 75 | 300 | 0.075／0.1／0.15／0.3 |
| 殭屍 | 30 | 100 | 75 | 0.03／0.06／0.1／0.15 |

- **其他**：信標道具（`SFItem_Weap_Beacon`）、魔王出場時插播一段 BGM、`bUseAI`。

### 我們的遊戲已經有的、可以沿用的

- Bot 的 AI 和導航
- 房間連線（房主模擬所有 AI）
- 回合制規則框架（`RULES`）
- Apex 的護盾和回血

### 要新做的

- 波次產生器
- 近戰型敵人（新的 AI 行為：衝向最近的玩家、抓咬）
- 倒地與救援（按住 E 救人）
- 全滅判定
- 金錢與商店（可以放到第二階段）
- 敵人模型：要原創，或用現有士兵換顏色＋姿勢，不用 SF2 的殭屍模型

## 3. 玻璃模式（`SFGlassGame`）

- 每人只有 1 條命（`MaxLives` 1），死了就等下一回合。
- 時間到時，由第 8 隊（`TimeOverWinningTeam` 8，推測是「平手／無勝方」）獲勝。
- 出生點會移動（`SFGamePlayerStartMovable_Area`）。
- 地圖上有會碎的玻璃（`SFBreakableGlassActor`／`SFBreakableGlassSyncActor`）：
  - 打破玻璃後掉下去會死，是這個模式的核心；
  - 碎裂狀態同步給所有人（`SFBreakableGlassSyncState`）。
- 武器有無限彈藥群組（`InfiniteAmmoWeaponGroup`）。
- 有自己的 HUD、計分、擊殺訊息，背景音樂一直播放；1 對 1 時插播一段專屬音樂。

### 要在我們的遊戲做

- 一張新的原創地圖：懸空的玻璃地板、平台、底下是深淵。
- 可破壞的玻璃板：被打幾發或被手榴彈炸就碎，掉下去即死；碎裂要經由連線同步。
- 「一條命、回合制」規則：沿用現有的回合制規則。
