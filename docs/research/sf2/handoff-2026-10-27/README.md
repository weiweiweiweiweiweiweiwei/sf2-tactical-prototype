# SF2 給 Claude 的研究交接包

研究日期：2026-10-27。對象是 Dragonfly《Special Force 2／特種部隊2／S.K.I.L.L.／Soldier Front 2／風暴戰區》，排除SF一代、Special Forces Group 2、Strike Fighters 2及同名電影。

## 先讀的結論

已建立 **35種基礎槍械索引、27筆歷史日服數值快照、22筆既有逐槍證據的精簡快照、366項武器/貼圖/瞄具/音效候選封包檔名、21筆來源記錄**。這些數量各有不同含義，不是35套已下載素材。全部35種均能在專案既有文字清單中對到模型封包候選；本輪沒有開啟客戶端封包、下載模型/音效或修改遊戲程式。

目前仍缺：全版本全武器清冊、逐槍可再利用的模型/動畫/音效成品、完整HP傷害與距離/護甲公式、可信循環射速、完整後坐力曲線，以及可任意裝配的配件矩陣。找不到的值保持null，不能用真槍現實規格或別款遊戲補成SF2真值。

## 檔案與讀取順序

1. CLAUDE_PROMPT.md：可直接貼給Claude的任務提示。
2. README.md：本文件，研究結果與注意事項。
3. sources.json：21筆來源、讀取方式、結果、版本及待辦。
4. weapons.json：35種槍械、分版本資料、舊證據狀態、封包候選與未知欄位。
5. package-catalog.json：從既有清單選出的366項檔名；不是實際素材檔。

JSON使用UTF-8。來源以source_id互相連結；不要將confirmed_page解讀成confirmed_gameplay。ZIP內沒有遊戲資產。

## 本輪新增的重要證據

### 1. 模型、貼圖、動畫：有具體工具支援證據

[UModel作者相容表](https://www.gildor.org/projects/umodel/compat)列出Special Force 2 (Tornado Force)，Skel/Tex/Anim/Stat皆為Yes，格式904.14。這與舊的[本機資源盤點](../SF2_ASSET_INVENTORY.md)記錄的版本904、licensee14相符；只證明格式有相符線索，**尚未證明本機每個封包都能成功解析**。舊盤點說工具支援未確認，這一點現在已有公開來源補強。

[作者論壇原串](https://www.gildor.org/smf/index.php/topic,1094.0.html)中，Gildor於2012-05-22宣告支援；另一位使用者回報包含聲音的匯出成功。這是歷史版本回報，不能推成最新客戶端測試通過。

### 2. 音效：已找到專門槍聲包與較大歷史檔案的線索

- [GameBanana Special force 2 Gun Sounds](https://gamebanana.com/sounds/34049)：直接確認標題頁存在，正文需JS，未拿到檔案清單與完整覆蓋範圍。
- [AMK檔案貼文](https://www.amk-team.ru/forum/topic/13055-zvukovoy-arhiv/#findComment-1018839)：發文者列出約295 MB的SF2聲音分卷，連至[雲端目標](https://cloud.mail.ru/public/J98F/1NGAw8sKa)。雲端讀取未成功，貼文附近有刪除標記，屬歷史線索而非已驗證下載。
- [Cat Gun移植頁](https://gamebanana.com/mods/171940)：搜尋索引列出開火、換彈、拿取三種WAV事件，但正文僅標題可直讀；尚未下載或確認是否改編音效。

### 3. 模型下載候選：比上一輪多了可定位的槍械項目

- [M4A1 Laserdot](https://gamebanana.com/mods/224376)：CS1.6移植。索引列出RAR、P/W模型與Dragonfly模型/貼圖/動畫credits；原頁直讀僅標題，故詳細規格維持unverified。這不是已拿到的FBX/GLB，也不證明動畫是完整原版。
- [Smg ksv](https://3dassetcollection.com/product/smg-ksv/)：索引自述FBX、TGA、骨架、多段動畫及personal use only，原頁不可讀，保持未驗證。
- [GTA SA武器迷你包](https://www.gtainside.com/en/sanandreas/weapons/211706-special-force-2-weapons-minipack/)：索引有作者、2025-10-06日期與約1.93MB檔案，但沒有已驗證槍種清單，低優先。

### 4. 數據：找到原作者量測說明，但完整試算表仍未取得

[P5ykoOHD Steam指南](https://steamcommunity.com/sharedfiles/filedetails/?id=476200862)可以直接讀到2015年的量測方法，並連到[公開試算表](https://docs.google.com/spreadsheets/d/1k5Y8zi7rzrl-JJGPEIgUL1SIPUrBSIoN622LYnZZTVE/pubhtml)。試算表本輪讀取失敗；指南頁也帶移除提示，因此不能說已抓到全表。

**最重要的語義陷阱**：指南將RPM定義為 \(60 × 彈匣容量 ÷（清空彈匣秒數＋換彈秒數）\)，是包含換彈的持續射速。舊證據庫裡名叫rpm的529、580等值，是否來自同一定義尚未確定，應先隔離，不可直接套用成每發間隔。指南列出的DPS也採用作者自己的傷害欄，尚不能視為遊戲最終扣血公式。

區分：

- UI射速評分：73等相對評分，不是RPM。
- cyclic_rpm：持續扣扳機的循環射速，需要另有量測。
- sustained_rpm：包含換彈的長時間輸出，不能決定每發間隔。
- 若影片中N發有N−1個發射間隔，必須清楚標定起訖點才可換算；不要把舊Mag Dump公式與新方法混用。

本包verified_gameplay中的實戰傷害、循環RPM、換彈與ADS一律保留null；舊快照不是被否定，只是沒有在本輪升級成已核驗實戰真值。

## 逐槍摘要

日服欄依序為「UI傷害／反動控制／射速／精準」，不是HP、角度、RPM或命中機率。JP表是歷史版本，與KR2011、EU、台服末版分開保存；反動控制越高的語義也不能直接當作KR反動值。

| ID | 槍械 | 日服UI評分 | 日服彈匣/備彈 | 模型封包候選 | 音效封包候選 |
|---|---|---|---|---|---|
| m4a1 | M4A1 | 56/54/73/76 | 30/90 | rif_m4a1.upk | Sound_Alienware-m4a1.upk, Sound_M4A1.upk |
| ak103 | AK-103 | 70/29/61/66 | 30/90 | rif_ak103.upk | Sound_AK103.upk, Sound_AK47_103.upk |
| hk417 | HK417 | 61/45/67/67 | 30/90 | rif_hk417.upk | Sound_HK417.upk |
| g36c | G36C | —（見舊證據快照） | — | rif_g36c.upk | Sound_G36C.upk |
| sg551 | SG 551 | 57/82/72/72 | 30/90 | rif_sig551.upk | Sound_SIG551.upk |
| famas | FAMAS (G2) | 53/62/78/65 | 30/90 | rif_famas.upk | Sound_FAMAS_2.upk |
| m16a3 | M16A3 | —（見舊證據快照） | — | rif_m16a3.upk | Sound_M16A3.upk |
| xm8 | XM8 | —（見舊證據快照） | — | rif_xm8.upk | Sound_XM8.upk, Sound_XM8_AR.upk, Sound_XM8_CC.upk |
| scarl | SCAR-L | 62/31/67/79 | 30/90 | rif_scar_L.upk | Sound_Mk16.upk |
| type89 | Howa Type 89 | 60/79/66/73 | 30/90 | rif_type89.upk | Sound_Type89.upk |
| k2 | K2 | 54/79/70/67 | 30/90 | rif_K2.upk | Sound_K2_2.upk |
| m14ebr | M14EBR | —（見舊證據快照） | — | rif_m14ebr.upk | Sound_M14EBR.upk |
| p90 | P90 | 53/56/86/65 | 50/150 | smg_p90.upk | Sound_P90.upk, Sound_P90_Pixel.upk |
| mp5k | MP5K | 49/66/92/70 | 30/120 | smg_mp5k.upk | Sound_MP5K.upk |
| hk23e | HK23E | 57/61/67/28 | 75/225 | mg_hk23.upk | Sound_HK23E.upk |
| l86a1 | L86A1 | 60/56/64/50 | 75/225 | mg_l86a1.upk | Sound_L86A1.upk |
| psg1 | PSG-1 | 87/0/0/100 | 5/15 | sni_psg-1.upk | Sound_PSG1.upk |
| cz700 | CZ700 | 93/0/0/100 | 5/15 | sni_cz700.upk | Sound_CZ700.upk |
| m92fs | Beretta 92FS | —（見舊證據快照） | — | pis_m92f.upk | Sound_B92FS.upk |
| cz75bd | CZ75BD | —（見舊證據快照） | — | pis_cz75.upk | Sound_CZ75.upk |
| m870 | Remington M870 | —（見舊證據快照） | — | sho_m870.upk | Sound_M870.upk |
| benelli_m4 | Benelli M4 | —（見舊證據快照） | — | sho_bnill.upk | Sound_Bnlli.upk |
| scarh | SCAR-H | 67/31/67/79 | 25/75 | rif_scar-h.upk | Sound_SCARH.upk, Sound_SCARH_DMR.upk |
| aug | AUG A3 | 60/54/69/72 | 30/90 | rif_aug.upk | Sound_AUGA3.upk |
| awp | AWP | 95/0/0/100 | 5/15 | sni_awp.upk | Sound_AWP_2.upk |
| cheytac | Cheytac M200 | 97/0/0/100 | 7/21 | sni_cheytac.upk | Sound_Cheytac.upk, Sound_Cheytac_2.upk |
| sr25 | SR25 | 94/0/0/100 | 5/15 | sni_sr-25.upk | Sound_SR25.upk |
| dragunov | Dragunov SVD | 83/0/0/100 | 7/21 | sni_dragunov.upk | Sound_DragonovSVD.upk, Sound_DragunovSVD.upk |
| m249spw | M249 SPW | 47/48/82/44 | 75/225 | mg_spw.upk | Sound_SPW.upk |
| rpk74 | RPK-74 | 70/54/56/46 | 75/225 | mg_rpk74.upk | Sound_RPK-74.upk |
| k3 | K3 | 54/58/72/26 | 75/225 | mg_K3.upk | Sound_K3.upk |
| mp7 | MP7A1 | 48/51/93/77 | 40/120 | smg_mp7.upk | Sound_MP7.upk |
| kriss | KRISS Super V | 44/54/99/76 | 20/100 | smg_ksv.upk | Sound_KrissV_2.upk |
| ump45 | UMP45 | 55/62/78/73 | 30/120 | smg_ump45.upk | Sound_UMP45.upk |
| scorpion | Scorpion | 45/63/100/69 | 40/160 | smg_scorpion.upk | Sound_Scorpion.upk |

日服直接讀取來源：[突擊步槍](https://wikiwiki.jp/sf2e-sports/アサルトライフル)、[狙擊](https://wikiwiki.jp/sf2e-sports/スナイパーライフル)、[機槍](https://wikiwiki.jp/sf2e-sports/マシンガン)、[衝鋒槍](https://wikiwiki.jp/sf2e-sports/サブマシンガン)。頁面是歷史表，不代表2015之後或台服資料；首頁有2013凍結公告，而部分分類頁顯示2014–2015修改日期，兩者都保留，不猜測全站同一版本。

已知衝突：M4A1精準度KR73/JP76；P90傷害評分KR51/JP53；MP5K傷害評分KR48/JP49；P90日服同頁比較表備彈150而個別段落100。K3比較表有未實裝標記，RPK等有準備中標記。詳見weapons.json的notes與reserve_conflict。

## 封包名稱、配件與型號不可混淆

- 本輪清單有1647行，其中1646個唯一UPK/TFC檔名；空行不算檔案。選出366項槍械或Sound_候選，其中Sound_也包含環境音、腳步、UI，**不是366把槍**。
- 模型、_texture、_sight及Sound_對照是按名稱推測，沒有開啟封包。_sight可能是模型資源，不等於可自由裝配的道具。
- M4A1 EOTech/Laserdot等應當作變體研究，不假設所有槍都能自由加上相同配件。
- SCAR-L對Sound_Mk16屬低可信名稱推測，已特別註記。
- AK-103與AK-47、MP5K與MP5不是同一型號；舊project_id/modelMatch只是舊文件記錄，不是本輪核驗。

## 專案接手方式與下一步

現有工作區：C:/Users/WEI/Desktop/Online Game。Claude先讀根目錄CLAUDE.md、docs/archive/COLLAB.md，再讀docs/research/sf2/SF2_RESEARCH.md、docs/research/sf2/SF2_ASSET_INVENTORY.md與docs/research/sf2/evidence/README.md。這些既有檔案保持原樣，本輪只新增交接包。

1. 先產出來源/版本缺口清單與逐槍任務，不改遊戲數值。
2. 優先處理M4A1、AK-103、G36C、P90、Cheytac M200、M870這六把，涵蓋不同槍型；每把分別驗模型、骨架、動畫、貼圖、聲音事件與實戰數值。
3. 若後續要做客戶端資源研究，先確認該輪範圍與適用工具流程；本輪沒有安裝UModel或授權直接把素材發佈到專案。舊盤點所述D槽位置本輪未驗存活。
4. 維持既有專案「公開參考、自行重做」素材原則；來源頁的下載按鈕或移植者標示不等於Dragonfly的再散布許可。不要把研究候選自動複製進assets/。
5. 經授權的後續實裝才依COLLAB.md檔案歸屬進行，修改src/再跑該專案建置/檢查；本輪只有文件與JSON，不需跑遊戲測試。

## 交接驗收

- sources.json每筆有id、來源位置、access、status與限制。
- weapons.json內所有source_id可解析；35個id不重複；35個模型候選在既有檔名清單可找到。
- 27筆JP快照、22筆舊證據快照各自保留；未知值不是0，實戰欄不偷填UI評分。
- 所有model_download_verified/audio_download_verified為false，因為本輪沒有下載檔案。
- ZIP僅包含本資料夾五個文字/JSON檔，不含原作資產。

