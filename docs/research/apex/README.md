# Apex 槍枝完整數值（`weapons-full.json`）

由 `python tools/apex_weapon_data.py` 產生（同時重寫本頁的 TTK 表）。29 把基礎武器，含 Bocek 弓；不含投擲物、傳奇技能武器和活動變體。

## 來源（每個欄位都標了來源，見 `current_src`）

| 標記 | 內容 | 版本 | 用在哪裡 |
|---|---|---|---|
| `official` | EA 官方 patch notes（`weapons-2026-10-27.json` 的 `official_override`） | 現役 | Hemlok 21、30-30 51、RE-45 16／紫彈匣 24 |
| `s30.1` | [`weapons-2026-10-27.json`](weapons-2026-10-27.md)（apex.source.gs 從遊戲檔產生） | S30.1 build 11630615 | 傷害（身體、頭、腿）、RPM、各級彈匣、換彈、初速、開鏡時間、連發、上膛、蓄力 |
| `s14` | 遊戲原始武器腳本 `gamefiles-s14/`（[metafysika/ApexWeaponData](https://github.com/metafysika/ApexWeaponData) 的 `14.0` 資料夾；後座彈道表取自同庫的 `13.1`，因為 `14.0` 沒有這個檔） | S14（2022-08） | S30.1 沒有的欄位：散布、後座、彈道下墜、拔槍／收槍、衝刺後開火、開鏡移速、頭部倍率生效距離、配件效果 |
| `derived` | 由上面的值算出 | — | 頭部倍率＝S30 頭／身；官方改了身體傷害時，頭、腿用 S30 的倍率重算 |

**優先順序**：`current` = `official` > `s30.1` > `s14`。`s14` 的平衡數值（傷害、射速）是 2022 年的，只在 S30.1 沒有資料時才會用上。每把槍的 `s14` 和 `s30_1` 原始區塊都完整保留在 JSON 裡。

## 欄位

- **`current`**：合併後的數值，扣血模式接線用這一層。
  - `body` / `head` / `leg`：單發（霰彈槍是單顆彈丸）的傷害；`pellets`：彈丸數；`head_scale`、`leg_scale`：倍率
  - `headshot_max_m`：超過這個距離，爆頭不再加倍（腳本的 `headshot_distance`）
  - `rpm`；`burst_count`、`burst_delay_s`：連發顆數、連發之間的間隔；`rechamber_s`：上膛；`charge_s`：蓄力；`rate_max_hz`、`rate_speedup_s`：Devotion 的加速
  - `mag`、`mag_l1`…`mag_l4`：無、白、藍、紫、金彈匣
  - `reload_tactical_s` / `reload_empty_s`、`deploy_s`（拔槍）、`deployfirst_s`（第一次拔槍）、`holster_s`（收槍）、`raise_s`（衝刺後開火的延遲）、`lower_s`（放下）、`ads_s`（開鏡）
  - `speed_mps`：子彈初速；`gravity_scale`：重力倍率（乘遊戲重力 750 hu/s²）；`drag`：空氣阻力
  - `spread_*`：散布半角（度）：站、跑、衝刺、蹲、空中、開鏡
  - `ads_move_speed_scale`：開鏡時的移動速度倍率
- **`s14.recoil`**：`viewkick_*`（基礎／隨機上跳和左右、軟／硬比例、回正）、`viewdrift_*`（開鏡晃動）、`pattern`（每發後座表 `bullets[i] = [左右, 上下, …]`，`loop_offset` 是打完表後從第幾發重來）
- **`s14.mods`**：每個配件、Hop-up 改了什麼。`"*0.85"` 表示乘 0.85，數字表示直接替換。例如：
  - `stock_tactical_l3`：開鏡、拔槍時間 ×0.75，換彈 ×0.9
  - `barrel_stabilizer_l3`：垂直後座 ×0.85，垂直隨機 ×0.7
- **`s14.damage.blast_pattern`**：霰彈槍、Triple Take 的彈丸分布（遊戲的 `blast_patterns.txt`）
- **`ttk`**：每級護盾的擊殺所需發數和時間（見下）
- **`gaps`**：缺少的欄位

## 換算

- 長度：1 hammer unit（hu）＝ 1 英吋 ＝ 0.0254 m（例：R-301 的 29000 hu/s → 736.6 m/s，和 S30.1 的 737 m/s 一致）。
- RPM ＝ `fire_rate` × 60。

## 護甲（S24 起；[Shield Core](https://apexlegends.wiki.gg/wiki/Shield_Core)、[Season 24 patch notes](https://www.sportskeeda.com/esports/apex-legends-season-24-patch-notes-ash-rework-armor-changes-major-gameplay-updates)）

- Evo 等級：白 50（起始）、藍 75（450 Evo）、紫 100（1,700 Evo）。S24 起升級最高到紫，紅甲不能再靠 Evo 取得。
- 金頭盔：護甲設為 100（不管等級）；神話頭盔（Mythic Armor Upgrade Helmet）設為 125（紅）。
- 本專案的 `APEX`（`src/01_core.js`）用 50／75／100、Evo 門檻 0／150／500。門檻比官方低，是為了短局的節奏，見 `docs/DECISIONS.md`。
- Fortified（Gibraltar 等角色受傷 −15%）：只找到舊資料，S30 還有沒有不確定，列在缺漏清單。TTK 表沒有計入。

## TTK 表（`current` 數值，對 100 HP 加上該級護盾，全部打身體）

計算方式：
- 擊殺發數：`ceil((100 + 盾) / (身體傷害 × 彈丸數))`，打破護盾後多出來的傷害直接扣血（本專案 `APEX` 的規則）。
- 時間：從第一發算到最後一發，不含蓄力、換彈。
- 連發槍照 `burst_delay_s` 算連發之間的間隔；Devotion 的射速線性加到 `rate_max_hz`。
- 上膛武器（Kraber、Sentinel、Peacekeeper、30-30）每發間隔＝`60/RPM + rechamber_s`。這是推定的，見 DECISIONS。

<!-- ttk:begin -->
| 武器 | 每發躯幹 | RPM | 0 盾 | 50 盾 | 75 盾 | 100 盾 | 125 盾 |
|---|---:|---:|---:|---:|---:|---:|---:|
| HAVOC Rifle | 20 | 672 | 5 發 0.36 s | 8 發 0.62 s | 9 發 0.71 s | 10 發 0.80 s | 12 發 0.98 s |
| Hemlok Burst AR | 21 | 930 | 5 發 0.44 s | 8 發 0.82 s | 9 發 0.89 s | 10 發 1.14 s | 11 發 1.20 s |
| Nemesis Burst AR | 17 | 1080 | 6 發 0.43 s | 9 發 0.75 s | 11 發 0.86 s | 12 發 0.92 s | 14 發 1.19 s |
| R-301 Carbine | 15 | 810 | 7 發 0.44 s | 10 發 0.67 s | 12 發 0.81 s | 14 發 0.96 s | 15 發 1.04 s |
| VK-47 Flatline | 20 | 600 | 5 發 0.40 s | 8 發 0.70 s | 9 發 0.80 s | 10 發 0.90 s | 12 發 1.10 s |
| Alternator SMG | 18 | 600 | 6 發 0.50 s | 9 發 0.80 s | 10 發 0.90 s | 12 發 1.10 s | 13 發 1.20 s |
| C.A.R. SMG | 14 | 930 | 8 發 0.45 s | 11 發 0.65 s | 13 發 0.77 s | 15 發 0.90 s | 17 發 1.03 s |
| Prowler Burst PDW | 16 | 1260 | 7 發 0.47 s | 10 發 0.61 s | 11 發 0.84 s | 13 發 0.94 s | 15 發 1.03 s |
| R-99 SMG | 12 | 1080 | 9 發 0.44 s | 13 發 0.67 s | 15 發 0.78 s | 17 發 0.89 s | 19 發 1.00 s |
| Volt SMG | 16 | 720 | 7 發 0.50 s | 10 發 0.75 s | 11 發 0.83 s | 13 發 1.00 s | 15 發 1.17 s |
| Devotion LMG | 16 | 300 | 7 發 0.85 s | 10 發 1.14 s | 11 發 1.23 s | 13 發 1.39 s | 15 發 1.54 s |
| L-STAR EMG | 19 | 600 | 6 發 0.50 s | 8 發 0.70 s | 10 發 0.90 s | 11 發 1.00 s | 12 發 1.10 s |
| M600 Spitfire | 21 | 540 | 5 發 0.44 s | 8 發 0.78 s | 9 發 0.89 s | 10 發 1.00 s | 11 發 1.11 s |
| Rampage LMG | 29 | 300 | 4 發 0.60 s | 6 發 1.00 s | 7 發 1.20 s | 7 發 1.20 s | 8 發 1.40 s |
| 30-30 Repeater | 51 | 231 | 2 發 0.94 s | 3 發 1.89 s | 4 發 2.83 s | 4 發 2.83 s | 5 發 3.78 s |
| Bocek Compound Bow | 35 | 150 | 3 發 0.80 s | 5 發 1.60 s | 5 發 1.60 s | 6 發 2.00 s | 7 發 2.40 s |
| G7 Scout | 33 | 246 | 4 發 0.73 s | 5 發 0.98 s | 6 發 1.22 s | 7 發 1.46 s | 7 發 1.46 s |
| Triple Take | 22×3 | 90 | 2 發 0.67 s | 3 發 1.33 s | 3 發 1.33 s | 4 發 2.00 s | 4 發 2.00 s |
| Charge Rifle | 75 | 78 | 2 發 0.77 s | 2 發 0.77 s | 3 發 1.54 s | 3 發 1.54 s | 3 發 1.54 s |
| Kraber .50-Cal Sniper | 150 | 72 | 1 發 0.00 s | 1 發 0.00 s | 2 發 2.43 s | 2 發 2.43 s | 2 發 2.43 s |
| Longbow DMR | 60 | 78 | 2 發 0.77 s | 3 發 1.54 s | 3 發 1.54 s | 4 發 2.31 s | 4 發 2.31 s |
| Sentinel | 70 | 186 | 2 發 1.92 s | 3 發 3.85 s | 3 發 3.85 s | 3 發 3.85 s | 4 發 5.77 s |
| EVA-8 Auto | 7×8 | 168 | 2 發 0.36 s | 3 發 0.71 s | 4 發 1.07 s | 4 發 1.07 s | 5 發 1.43 s |
| Mastiff Shotgun | 19×5 | 66 | 2 發 0.91 s | 2 發 0.91 s | 2 發 0.91 s | 3 發 1.82 s | 3 發 1.82 s |
| Mozambique Shotgun | 17×3 | 168 | 2 發 0.36 s | 3 發 0.71 s | 4 發 1.07 s | 4 發 1.07 s | 5 發 1.43 s |
| Peacekeeper | 11×9 | 240 | 2 發 1.35 s | 2 發 1.35 s | 2 發 1.35 s | 3 發 2.70 s | 3 發 2.70 s |
| P2020 | 24 | 420 | 5 發 0.57 s | 7 發 0.86 s | 8 發 1.00 s | 9 發 1.14 s | 10 發 1.29 s |
| RE-45 Auto | 16 | 780 | 7 發 0.46 s | 10 發 0.69 s | 11 發 0.77 s | 13 發 0.92 s | 15 發 1.08 s |
| Wingman | 50 | 168 | 2 發 0.36 s | 3 發 0.71 s | 4 發 1.07 s | 4 發 1.07 s | 5 發 1.43 s |
<!-- ttk:end -->

## 缺漏清單（`gaps`）

- **Nemesis**：S16 才加入，S14 檔案裡沒有。缺腿部倍率以外的 S14 欄位：爆頭距離、重力、拔槍、收槍、衝刺後開火、散布、開鏡移速、後座表。
- **後座表**：單發和霰彈武器（Bocek、Triple Take、Charge Rifle、Kraber、Longbow、Sentinel、EVA-8、Mastiff、Mozambique、Peacekeeper、P2020、Wingman）在遊戲裡沒有 `viewkick_pattern`。它們只用 `viewkick_*` 的隨機上跳，這不算缺資料。
- **S14 → S30 的平衡差異**：散布、後座、拔槍時間這 8 年間可能被改過；S30.1 的資料只有本頁上面列的欄位。
- **配件的 S30 現況**：S30 的配件組合（例如雷射瞄準器、Hop-up 輪替）和 S14 不同；可裝的配件以 `s30_1.attachments` 為準，效果數值用 S14 的。
- **Fortified**、**頭盔減傷**：S24 頭盔改版後的實際規則未核實。
- **對照用的公開 TTK 表**：這個環境的網路政策擋住 wiki 和數據站，還沒有比對。待辦已列在 `docs/TODO.md`。
