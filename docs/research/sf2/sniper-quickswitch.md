# SF2 狙擊槍「開槍後切槍」能不能更快開下一槍（2026-10-30 研究）

結論：**能。** SF2 改過 UE3 的切槍規則，在開槍間隔（拉栓）期間切槍，剩下的間隔會被直接取消。

## 依據（SFGame.upk 腳本反組譯，`tools/out/_us_dis.py`）

- `SFWeapon.WeaponFiring.TryPutDown`：如果 `RefireCheckTimer`（開槍間隔計時器）還在跑，就 `ClearTimer(RefireCheckTimer)`，然後呼叫全域 `TryPutDown()`。
- `SFWeapon.TryPutDown`（全域）：`bWeaponPutDown = true` 之後**立刻** `PutDownWeapon()`，同時清掉補彈、換彈計時器。
  - UE3 原版只設旗標，要等目前動作（開槍間隔、拔槍）結束才收槍。SF2 改成立刻收。
  - 拔槍中（WeaponEquipping）沒有覆寫 TryPutDown，所以拔到一半的手槍也能馬上再收起來。
- `SFWeapon.TimeWeaponPutDown`：收槍時間＝`PutDownTime`（擴充收槍 `IsExtensionPutDown()` 在 SFWeapon 永遠回傳 false）。
- `SFWeapon.TimeWeaponEquipping`：拔槍時間＝
  - 上一把是「緊急武器」（`WeaponClassPrev` 是 `SFWeap_Exigency` 的子類，近戰快速攻擊那類）時用 `EquipUpExTime`；
  - 其他情況用 `GetEquipTime()` ＝ `EquipTime ×（1 + 角色的 EquipSpeed 加成）`；
  - 非用戶端（`NetMode != 3`）再減 0.1 秒（最少 0.01）。

## 數值（SFGameContent 預設）

| | 開槍間隔 FireInterval | 拔槍 EquipTime | 收槍 PutDownTime |
|---|---|---|---|
| 狙擊槍基底 SniperBase | — | — | 0.2（EquipUpExTime 0.6） |
| 手槍基底 PistolBase | — | — | 0.2（EquipUpExTime 0.4） |
| AWP | 1.4 | 0.65 | 0.2 |
| CheyTac | 1.6 | 0.95 | 0.2 |
| TRG-41 | 1.2 | 0.7 | 0.2 |
| M40A1 | 1.3 | 0.7 | 0.2 |
| CZ700 | 1.3 | 0.8 | 0.2 |
| K14 | 1.2 | 0.8 | 0.2 |
| Barrett | 1.3 | 1.3 | 0.2 |
| Kar98k | 1.4 | 0.9 | 0.2 |
| MSR | 1.25 | 0.82 | 0.2 |
| P226 | — | 0.38 | 0.2 |

## 估算：AWP 開槍 → 切手槍 → 立刻切回 AWP

收 AWP 0.2 ＋（手槍拔到一半就收）收手槍 0.2 ＋ 拔 AWP 0.65（伺服器端 −0.1）≈ **0.95–1.05 秒**，比等滿 1.4 秒快約 0.35–0.45 秒。

- 手槍按下就收（不等它拔完），才是最快的做法。
- CheyTac：0.2 + 0.2 + 0.95 ≈ 1.35，跟 1.6 比只快 0.25。
- Barrett：0.2 + 0.2 + 1.3 ≈ 1.7，**比 1.3 慢**，切槍沒有好處。
- 角色的拔槍速度加成（EquipSpeed）會再縮短拔槍時間。

## 待確認

- 拔槍狀態（`WeaponEquipping.BeginFire`）按住開火會不會排隊、拔完立刻開火——反組譯器在 `WeaponEquipping.BeginState` 中途解不下去（未知指令），還沒讀完。
- 我們遊戲目前的切槍規則還沒照這個改（`src/11_weaponsystem.js`），要不要做是使用者決定。
