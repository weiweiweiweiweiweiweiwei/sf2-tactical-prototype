# 自選決策紀錄

> loop 期間遇到要使用者決定的問題，我照推薦的選項直接做；每一筆都寫明怎麼改回去。最新的在最後面。
> loop 停止時，最上面會補一段總結。

## D1 · v62t · 2026-10-27 · Apex 數值的來源優先順序
- **問題**：網路上找得到的 Apex 完整遊戲腳本只到 S14（2022）；S30.1 的資料（`weapons-2026-10-27.json`）只有傷害、射速、彈匣、換彈、初速、開鏡時間這幾項。散布、後座、拔槍這類欄位要用哪一版？
- **選項**：A 官方 > S30.1 > S14，逐欄位標來源 · B 只用 S30.1，缺的欄位空著 · C 全部用 S14
- **採用 A**：S30.1 有的欄位都是現役值；S30.1 沒有的欄位用 S14 補，總比空著好，而且每個值都標了來源（`current_src`），之後找到新資料可以逐欄替換。
- **改回去**：`tools/apex_weapon_data.py` 的 `current()`：調整 `put()` 的呼叫順序，或刪掉 `if s14:` 那一段。

## D2 · v62t · 頭部、腿部倍率用 S30 算出來的
- **問題**：S14 腳本的 `damage_headshot_scale` 和 S30.1 的頭部傷害對不上（例：R-301 S14 是 1.75，S30.1 是 19.5 / 15 = 1.3；中間經過頭盔改版）。
- **採用**：倍率 = S30.1 頭部傷害 / 身體傷害；官方改了身體傷害（Hemlok 21、RE-45 16）時，頭、腿傷害用同一個倍率重算（Hemlok 頭 29.4、RE-45 頭 20）。
- **改回去**：`current()` 裡 `b = s30.get('body')` 那幾行。

## D3 · v62t · TTK 的上膛和連發怎麼算
- **問題**：腳本的 `rechamber_time`（Kraber、Sentinel、Peacekeeper、30-30）和 `burst_fire_delay`，是加在射速間隔上，還是取代它？資料沒有寫，能對照的 wiki 這個環境連不上。
- **選項**：A 上膛 = `60/RPM + rechamber`；連發之間的間隔 = `burst_delay` · B 上膛取兩者較大值
- **採用 A**：Sentinel 算出約 31 RPM、Peacekeeper 約 44 RPM，和印象中的公開數字接近；B 會讓 Kraber 的 RPM 停在 72，明顯太快。等能對照公開的 TTK 表時再確認。
- **改回去**：`tools/apex_weapon_data.py` 的 `shot_times()`。

## D4 · v62t · 「main」分支 = `master`
- **問題**：loop 規則寫的是「不要動 main」，但這個 repo 沒有 `main`，預設分支是 `master`。
- **採用**：規則裡的 main 一律當成 `master`。

## D5 · 2026-10-28 · loop 改用排程任務、雲端和本機分工
- **問題**：v62t 之後迴圈停了。原因：下一次喚醒（ScheduleWakeup）是 session 內部的計時器，容器閒置被回收後計時器跟著消失。
- **採用**：雲端改用每小時一次的排程任務（不受容器回收影響），一輪連續做多項、每項各自 push；本機的 Claude Code 只做雲端做不到的事，push 到 `local/assets`，透過 `docs/loop/HANDOFF.md` 交接。規則在 `docs/loop/`。
- **改回去**：停用排程任務；刪掉 `docs/loop/`。
