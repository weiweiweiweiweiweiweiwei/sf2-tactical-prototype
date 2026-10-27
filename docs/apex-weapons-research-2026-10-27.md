# Apex Legends 枪械公开资料整理

检索日期：2026-10-27。覆盖29种基础武器，含Bocek弓；不含投掷物、传奇技能武器和所有活动变体。

## 数据来源与可信度

- [逐枪数值与配件页](https://apex.source.gs/weapons/)：站点自述从游戏文件生成，标注S30.1、build 11630615、提取日期2026-10-07。以下表格为这些页面的**基础配置摘录**，并非已经验证的当前实战数据库。
- [EA赛季补丁](https://www.ea.com/games/apex-legends/apex-legends/news/marked-patch-notes)、[EA季中补丁](https://www.ea.com/games/apex-legends/apex-legends/news/marked-midseason-patch-notes)：用于核对现役版本、轮换及数值变化；优先于发生冲突的第三方基础页。
- [Apex Wiki武器总览](https://apexlegends.wiki.gg/wiki/Weapons)、[配件总览](https://apexlegends.wiki.gg/wiki/Attachments)：补充查询入口；本次直读遇到403，未将其旧表混入下表。

**发现的明确冲突**：Hemlok基础页为Burst版20伤害，官方现役Breach版21；30-30基础页43，官方空投版51并加入Shattercaps；RE-45基础页14、紫弹匣26且标轻弹，官方补丁为16、紫弹匣24并涉及能量武器系统。JSON保留来源原值和独立的official_override，避免将不同变体拼成一个未经验证的配置。

## 全武器基础数值

伤害为躯干；霰弹/Triple Take写成“每弹丸×数量=整发全中”。头、腿伤害和距离分段见JSON。弹匣为基础/白/蓝/紫，—代表该字段未提供或不适用。换弹为来源的战术/空仓字段，单位秒，逐发装填武器不能理解为填满耗时。

| 类别 | 武器及原始页 | 躯干伤害（基础配置） | 配置RPM | 弹匣 基础/白/蓝/紫 | 换弹字段 秒 | 需注意 |
|---|---|---|---:|---|---|---|
| 突击步枪 | [HAVOC Rifle](https://apex.source.gs/weapons/havoc-rifle/) | 20 | 672 | 18/21/25/29 | 3.2 s/3.2 s | 基础状态 |
| 突击步枪 | [Hemlok Burst AR](https://apex.source.gs/weapons/hemlok-burst-ar/) | 20 | 930 | 21/24/27/30 | 2.4 s/2.85 s | 官方现役21；变体冲突 |
| 突击步枪 | [Nemesis Burst AR](https://apex.source.gs/weapons/nemesis-burst-ar/) | 17 | 1,080 | 20/24/28/32 | 2.7 s/3 s | 计入连发间隔 |
| 突击步枪 | [R-301 Carbine](https://apex.source.gs/weapons/r-301-carbine/) | 15 | 810 | 21/23/28/31 | 2.4 s/3.2 s | 基础状态 |
| 突击步枪 | [VK-47 Flatline](https://apex.source.gs/weapons/vk-47-flatline/) | 20 | 600 | 19/23/27/29 | 2.4 s/3.1 s | 基础状态 |
| 冲锋枪 | [Alternator SMG](https://apex.source.gs/weapons/alternator-smg/) | 18 | 600 | 18/20/22/26 | 1.9 s/2.23 s | 基础状态 |
| 冲锋枪 | [C.A.R. SMG](https://apex.source.gs/weapons/c-a-r-smg/) | 14 | 930 | 20/23/26/30 | 1.7 s/2.13 s | 基础状态 |
| 冲锋枪 | [Prowler Burst PDW](https://apex.source.gs/weapons/prowler-burst-pdw/) | 16 | 1,260 | 20/25/30/35 | 2 s/2.6 s | 计入连发间隔 |
| 冲锋枪 | [R-99 SMG](https://apex.source.gs/weapons/r-99-smg/) | 12 | 1,080 | 18/21/24/27 | 1.8 s/2.45 s | 基础状态 |
| 冲锋枪 | [Volt SMG](https://apex.source.gs/weapons/volt-smg/) | 16 | 720 | 20/22/24/27 | 2 s/2.5 s | 基础状态 |
| 轻机枪 | [Devotion LMG](https://apex.source.gs/weapons/devotion-lmg/) | 16 | 300 | 36/40/44/48 | 3.2 s/4.1 s | 起始射速 |
| 轻机枪 | [L-STAR EMG](https://apex.source.gs/weapons/l-star-emg/) | 19 | 600 | —/—/—/— | 3.26 s/3.26 s | 过热机制 |
| 轻机枪 | [M600 Spitfire](https://apex.source.gs/weapons/m600-spitfire/) | 21 | 540 | 35/40/45/50 | 3.4 s/4.2 s | 基础状态 |
| 轻机枪 | [Rampage LMG](https://apex.source.gs/weapons/rampage-lmg/) | 29 | 300 | 28/32/34/40 | 3.1 s/4 s | 基础状态 |
| 精确射手武器 | [30-30 Repeater](https://apex.source.gs/weapons/30-30-repeater/) | 43 | 231 | 6/7/8/10 | 0.33 s/0.75 s | 官方现役51；变体冲突 |
| 精确射手武器 | [Bocek Compound Bow](https://apex.source.gs/weapons/bocek-compound-bow/) | 35 | 150 | —/—/—/— | 2.15 s/3 s | 蓄力/模式另计；弓，无常规弹匣 |
| 精确射手武器 | [G7 Scout](https://apex.source.gs/weapons/g7-scout/) | 33 | 246 | 10/12/14/16 | 2.4 s/3 s | 基础状态 |
| 精确射手武器 | [Triple Take](https://apex.source.gs/weapons/triple-take/) | 22×3=66 | 90 | 6/7/9/10 | 2.6 s/3.4 s | 蓄力/模式另计 |
| 狙击步枪 | [Charge Rifle](https://apex.source.gs/weapons/charge-rifle/) | 75→110（随距离） | 78 | 6/7/8/9 | 3.5 s/4.6 s | 蓄力/模式另计 |
| 狙击步枪 | [Kraber .50-Cal Sniper](https://apex.source.gs/weapons/kraber-50-cal-sniper/) | 150 | 72 | 4/—/—/— | 3.2 s/4.3 s | 计入上膛 |
| 狙击步枪 | [Longbow DMR](https://apex.source.gs/weapons/longbow-dmr/) | 60 | 78 | 6/8/10/12 | 2.66 s/3.66 s | 基础状态 |
| 狙击步枪 | [Sentinel](https://apex.source.gs/weapons/sentinel/) | 70 | 186 | 4/5/6/7 | 3 s/4 s | 计入上膛；蓄力/模式另计 |
| 霰弹枪 | [EVA-8 Auto](https://apex.source.gs/weapons/eva-8-auto/) | 7×8=56 | 168 | 8/—/—/— | 2.3 s/2.5 s | 基础状态 |
| 霰弹枪 | [Mastiff Shotgun](https://apex.source.gs/weapons/mastiff-shotgun/) | 19×5=95 | 66 | 5/—/—/— | 0.9 s/1.6 s | 逐发装填 |
| 霰弹枪 | [Mozambique Shotgun](https://apex.source.gs/weapons/mozambique-shotgun/) | 17×3=51 | 168 | 5/—/—/— | 1.9 s/2.3 s | 单持 |
| 霰弹枪 | [Peacekeeper](https://apex.source.gs/weapons/peacekeeper/) | 11×9=99 | 240 | 5/—/—/— | 2.5 s/3.5 s | 计入上膛 |
| 手枪 | [P2020](https://apex.source.gs/weapons/p2020/) | 24 | 420 | 9/10/11/12 | 1.25 s/1.25 s | 单持 |
| 手枪 | [RE-45 Auto](https://apex.source.gs/weapons/re-45-auto/) | 14 | 780 | 20/21/23/26 | 1.5 s/1.95 s | 官方现役16；变体冲突 |
| 手枪 | [Wingman](https://apex.source.gs/weapons/wingman/) | 50 | 168 | 5/6/7/8 | 2.1 s/2.1 s | 基础状态 |

**读数限制**：例如Peacekeeper的配置RPM为240，但同页另有1.1秒上膛；Sentinel配置RPM186，另有1.6秒上膛。因此没有把这些数字直接换成实战DPS。Devotion只摘录起始配置值，未记录加速曲线。头部伤害为来源乘倍率后的小数，不能当作游戏最终显示整数。

## 每把武器可装备配件

以下按来源配置页记录，包含普通配件与Hop-up。当前模式是否掉落、是否预装/需解锁应查[EA武器指南](https://help.ea.com/en/articles/apex-legends/guns-and-weapons/)。空投、双持等变体可能限制装配。

瞄具组：近距＝1x HCOG CLASSIC、2x HCOG BRUISER、1x-2x VARIABLE HOLO；中距＝3x HCOG RANGER、2x-4x VARIABLE AOG；狙击＝6x SNIPER、4x-8x VARIABLE SNIPER、4x-10x DIGITAL SNIPER THREAT。配置表未列出1x HOLO，不能据此断言游戏不存在或不能使用。

| 武器 | 来源列出的瞄具组 | 弹匣、枪管/激光、枪托/枪栓 | 来源列出的Hop-up |
|---|---|---|---|
| HAVOC Rifle | 近距＋中距 | 能量弹匣、标准枪托 | Turbocharger、Accelerator |
| Hemlok Burst AR | 近距＋中距 | 重型弹匣、枪管稳定器、标准枪托 | Accelerator |
| Nemesis Burst AR | 近距＋中距 | 能量弹匣、枪管稳定器、标准枪托 | Turbocharger、Accelerator |
| R-301 Carbine | 近距＋中距 | 轻型弹匣、枪管稳定器、标准枪托 | Accelerator |
| VK-47 Flatline | 近距＋中距 | 重型弹匣、标准枪托 | Accelerator、Graffiti Mod |
| Alternator SMG | 近距 | 轻型弹匣、激光瞄准器、标准枪托 | Double Tap Trigger、Accelerator |
| C.A.R. SMG | 近距 | 轻型弹匣、重型弹匣、激光瞄准器、标准枪托 | Accelerator |
| Prowler Burst PDW | 近距 | 重型弹匣、激光瞄准器、标准枪托 | Selectfire Receiver、Accelerator |
| R-99 SMG | 近距 | 轻型弹匣、激光瞄准器、标准枪托 | Accelerator |
| Volt SMG | 近距 | 能量弹匣、激光瞄准器、标准枪托 | Accelerator、Graffiti Mod |
| Devotion LMG | 近距＋中距 | 能量弹匣、枪管稳定器、标准枪托 | Turbocharger、Accelerator |
| L-STAR EMG | 近距＋中距 | 能量弹匣、标准枪托 | Accelerator |
| M600 Spitfire | 近距＋中距 | 轻型弹匣、枪管稳定器、标准枪托 | Accelerator |
| Rampage LMG | 近距＋中距 | 重型弹匣、枪管稳定器、标准枪托 | Accelerator |
| 30-30 Repeater | 近距＋中距 | 重型弹匣、狙击枪托 | Accelerator |
| Bocek Compound Bow | 近距＋中距 | 狙击枪托 | Accelerator |
| G7 Scout | 近距＋中距 | 轻型弹匣、枪管稳定器、狙击枪托 | Accelerator |
| Triple Take | 近距＋中距 | 能量弹匣、狙击枪托 | Accelerator |
| Charge Rifle | 近距＋中距＋狙击 | 狙击弹匣、狙击枪托 | Selectfire Receiver、Accelerator |
| Kraber .50-Cal Sniper | 固定瞄具/未列可替换项 | — | — |
| Longbow DMR | 近距＋中距＋狙击 | 狙击弹匣、狙击枪托 | Accelerator |
| Sentinel | 近距＋中距＋狙击 | 狙击弹匣、狙击枪托 | Accelerator |
| EVA-8 Auto | 近距 | 霰弹枪枪栓、标准枪托 | Double Tap Trigger、Accelerator |
| Mastiff Shotgun | 近距 | 霰弹枪枪栓、标准枪托 | Accelerator、Executioner |
| Mozambique Shotgun | 近距 | 霰弹枪枪栓 | Accelerator |
| Peacekeeper | 近距 | 霰弹枪枪栓、标准枪托 | Accelerator、Executioner |
| P2020 | 近距 | 轻型弹匣、激光瞄准器 | Hammerpoint Rounds、Accelerator |
| RE-45 Auto | 近距 | 轻型弹匣、激光瞄准器 | Accelerator |
| Wingman | 近距 | 狙击弹匣、激光瞄准器 | Accelerator |

**当前配件补充**：官方S30增加Overflowing Magazine、Headseeker Barrel、Tactical Laser、Agile Standard Stock、Rapid Sniper Stock五种腐化配件，每枪最多一个。来源基础兼容表未完整列出这套系统，所以不能将上表称为完整的当前配件矩阵。30-30、RE-45与Hemlok的变体冲突同样影响配件适用性。详见[官方赛季补丁](https://www.ea.com/games/apex-legends/apex-legends/news/marked-patch-notes)。

## 模型与音效公开来源

| 需求 | 来源 | 本次确认的范围 | 尚未验证 |
|---|---|---|---|
| 枪械3D模型参考/候选下载 | [Sketchfab：Apex武器集合](https://sketchfab.com/bockwya000/collections/apex-weapons-5f4f94f035434c1ea63d99baad261976) | 存在公开模型集合，模型来自不同作者 | 没有验证全29把覆盖、文件格式、骨骼、动画和各自下载许可 |
| 自制模型示例 | [Triple Take高模](https://sketchfab.com/3d-models/triple-take-from-apex-legends-high-poly-model-f23407e70bb54b9fb3fe7596d6091158) | 搜索索引标为Download Free；属于高模候选 | 页面直读403，实际下载及贴图/许可待核验 |
| 自制模型示例 | [R-301模型展示](https://sketchfab.com/3d-models/r-301-carbine-apex-legends-9137651332ad4557821a1ea6ea37a5d6) | 公开模型展示页 | 不能据展示页认定免费可下载、可商用 |
| 游戏资源解析工具 | [RSX项目](https://github.com/r-ex/rsx)、[2.4.0版本](https://github.com/r-ex/rsx/releases/tag/2.4.0) | 支持Respawn资源解析；2.4.0说明增加Titanfall 2/早期Apex的Bink音频导出和Opus格式 | 不等于已提供全枪模型/音效包；最新Apex音频兼容性需另验 |
| 旧模型/音频工具 | [Legion+](https://github.com/r-ex/LegionPlus) | README列出模型、动画、贴图和音频导出选项 | 项目已归档并明确被RSX取代，不能保证兼容当前版本 |
| 音频格式研究 | [MilesTools](https://github.com/CoDWaW/MilesTools) | 作者提供Apex/Titanfall 2音频档案分析工具 | 工具仓库并非逐枪WAV素材库 |
| 历史资产档案线索 | [Biast12](https://biast12.site/) | 旧档案链接目前重定向至biast12.com | 未验证现有目录与下载，不作为可用全量资源承诺 |

目前确认“模型/音频解析工具与零散模型公开存在”，未确认“包含全部29种武器且版本一致的模型、动画、贴图、开火/换弹音效完整下载包”。因此JSON中的模型/音效状态均明确为未逐枪核验，没有伪造文件URL。

公开展示或下载不自动等于可在另一款游戏中使用。参见[EA内容政策](https://help.ea.com/en/articles/security-and-rules/ea-content-policy/)：其对数据挖掘取得资源、内容再分发及衍生游戏作出限制。工具开源许可也不授予Apex素材许可；玩家自制模型仍需逐项核对作者许可与相关权利。

## 文件说明

- apex-weapons-research-2026-10-27.json：29种武器、原始页URL、伤害分段、基础及各级弹匣、换弹、配置射速/连发延迟/上膛、初速、开镜时间、配件名称及来源等级，以及冲突与未验证状态。
- 本文件只交付公开资料研究结果，没有修改现有游戏逻辑，也没有下载、转换或整合武器素材。

