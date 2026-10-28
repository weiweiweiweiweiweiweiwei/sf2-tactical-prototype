# 併入前檢查清單

> 分支 `claude/intelligent-einstein-vgvrqy` 每輪一行。使用者確認後，才會開 PR 併入 `master`。

| 版本 | commit | 做了什麼 | 要你試玩或確認的地方 |
|---|---|---|---|
| v62t | 76b7812 | Apex 29 把槍完整數值＋TTK 表；check.mjs 可在雲端跑 | 無（只有資料，遊戲沒變）；可看 `docs/research/apex/README.md` 的 TTK 表和 `docs/DECISIONS.md` D1–D4 |
| v62u | 947fff4 | Apex 模式改用 Apex 原版傷害（每把槍對應一把同類、射速最接近的 Apex 槍） | 在房間把扣血機制設成 Apex 打一場，感覺 M4A1（→ Flatline 20 傷）、狙擊（M200 紫甲要 3 發）合不合適；對照表在 CHANGELOG v62u |
| v62v | 4afedc1 | 清掉舊的 Apex 類別係數；Apex 模式不套 Apex 散布、後座（D7） | 無（數值和 v62u 一樣）；D7 如果你想要 Apex 手感再告訴我 |
