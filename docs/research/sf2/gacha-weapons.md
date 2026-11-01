# SF2 的抽獎（轉蛋／扭蛋／隨機箱）槍枝調查（2026-11-01，只讀資料，沒改任何東西）

使用者 11-01：「調查 sf2 官方是否有用於抽獎的槍枝資料，先不談烤漆，列出所有調查到的。」

## 資料來源與可信度
| 來源 | 讀到什麼 | 限制 |
|---|---|---|
| `SFGameContent.upk`（安裝檔，未壓縮，`tools/sf2_props.py`） | 抽獎類道具的類別與預設屬性（Big5 字串） | 每個扭蛋「會抽到哪些槍」不在客戶端，是伺服器端的資料 |
| `Imgset_GachaSelect_BigItem.upk`、`Imgset_GachaSelect_LeftImg.upk`（扭蛋選擇畫面的圖集） | 1604 張獎品圖示的名稱 | 只有圖名，沒有寫屬於哪一個扭蛋；九成以上是塗裝 |
| `rif_arx160_gacha.upk` | 一把扭蛋專屬的槍模（ARX160 TargetSeeker） | — |
| `Localization/TWN/SFGameItem.twn`（11 MB，物品名稱／編號表） | — | 加密，位元組分布均勻（不是單純 XOR），要逆向 `sf2.exe` 才能解，這次沒做 |
| 官方網站 sf2.mangot5.com | 一則 2020-06-17 公告列出 8 個轉蛋名稱 | 內容物頁面是 JavaScript 動態載入，抓不到 |
| 日文維基 sf2.swiki.jp「全武器早見表」 | — | 抓到的頁面主體是空的 |

## 1. 客戶端裡的抽獎道具（類別名，SFGameContent.upk）
- **扭蛋（Gacha）**：AllStarWeaponGacha（全明星武器，33／55／110 抽）、AllstarAssultRifleGacha（突擊步槍）、AllstarSniperRifleGacha（狙擊槍）、AllstarSWGacha（副武器）、AllstarPMCGacha（角色）、AllstarCamoGacha（塗裝）、AllstarGacha2～5／33／55／110、2020_NewYearGacha30／50、2022VacancesGacha、WinterGacha33／55、M67Gacha33／55（手榴彈）、YuriUndercoverGacha（角色）、LeoGacha10、Infinity_Run_Sweetiegacha20、HK417_Skull_Deserteagle_AIOGacha20ea、Shuriken_MarineGacha20ea，以及星座塗裝系列（Aries／Gemini／Crab／Leo／Virgo／Aquarius／Pisces FX）與 CamoGacha8～11。
- **隨機箱（RandomBox）**：Box A～E、Box_9th／12th（週年）、AllStar 系列各箱、Army23～38Gacha、Halloween、Chuseok（中秋）、Autumn、Mooncake、Rice、Zongye（粽子）、NormalSupply／PremiumSupply、RangerWeapon／RangerPMC、GoldenAge、Mythical、Novelty、Knife；需要搭配鑰匙 Key A～I、KeySpecial、Key12th、Key_Halloween 等（`RequiredKeyCount`）。
- **固定槍型的隨機箱**（名字就是箱子裡的槍，抽的是期限或配件）：ACR Reflex Silencer、AUG Reflex Silencer、G36C EOTech Silencer Laserpoint、G36C Reflex Silencer Laserpoint、M40A1 MK5、M4A1 Fullparts、MP40 RW Silencer、Madsen LAR EOTech、P90 MK3 Opendot、SCAR-L MOD2A Reflex、STG44 Reflex Silencer Laserpoint、AR_Super、SR_Super、FEMME_FATALE_Super（角色）。
- **膠囊（Capsule）禮包**：AUGA3_Cullet_SAIGA12_Capsule10／50、K3NAGA_Sig551Iron_Capsule50、SR25_Scorpion_Whiteday_VenomCapsule10、VIP_Capsule。
- **抽獎券**：GashaCoupon1／6／12（Springbox、Summerbox）。

## 2. 唯一寫在客戶端的機率表：「隨機武器」A／B／C
`SFCItem_Func_RandomWeaponA／B／C`：每項是 武器編號 : 機率（另有「機率提升」道具 `RandomWeaponProbabilityUp`：「使用之後有極高的機率可獲得強力特殊武器」，啟用時改用第二組機率；`RandomWeaponSetAmmo` 是每把的彈藥數）。看起來是對戰中拿到的隨機武器，不是商城扭蛋。
- A（20 項）：1030080、1030040、1030050、1030100、1030060、1030120、1030070、1050050、1050010、1060040、4060000、1020010、1020040、1040010、1040020 各 6 %；特殊武器 3010545、3010561、3010557 各 2 %，3010574、3010581 各 1 %（機率提升後特殊武器 10 %／5 %）。
- B（25 項）：一般武器各 4–5 %；特殊武器 3010545、3010561、3010557 各 2 %，3010551、3010549 各 1 %（提升後 15 %／10 %）。
- C（22 項）：4030169、1020020、1020010、1050050、1050020、1040040、1030030、1030051、1030010、1030020、4030083 各 7 %；1060020、3010561、3010557、3010574、3010581 各 3 %；3010572～3010576、3010549 各 2 %。
- 編號對應的槍名在加密的 `SFGameItem.twn` 裡，客戶端其他地方沒有。從禮包說明推得到的只有：1030570 = AUG A3、1040041 = K3、1060051 = SR-25（開頭 103 應是步槍、104 機槍、106 狙擊、102 衝鋒槍，推測）。

## 3. 扭蛋專屬的槍（不是塗裝）
- **TargetSeeker 瞄具版**：ARX160 TargetSeeker（有自己的槍模包 `rif_arx160_gacha.upk`、動畫 `1st_anim_arx160_gacha_tagetseecker`）。圖集裡另有 ACR、G36C、SIG MPX 的 TargetSeeker 版，但這幾個名字都帶塗裝（silencerblackpearl、sfwc、taiwan、moonrabbit）。
- **幸運手榴彈** M67 LuckyBomb（`SFCWeaponM67_LuckyBomb`、`gre_luckybomb.upk`），以及扭蛋圖集裡的 M67 Impact、M67 Gravity、M67 Catfood。

## 4. 扭蛋選擇畫面出現的「無塗裝」獎品圖示（原型槍、近戰、投擲）
判斷方式：圖名只有槍名（或槍名加瞄具、消音器等配件），沒有塗裝名（gold、chrome、skull、…fx、tiger2、proleague…）。
- 步槍：ACR、AN-94、FN F2000、Galil、G36C、K2、M16A3、M4A1、M4A1 GL（槍掛榴彈）、QBZ-97、SIG 551、STG44、XM8、K14（SFWC）
- 衝鋒槍：Bizon、MAC-10、MP40、PP-2000、Scorpion、UMP45、K5（手槍）
- 狙擊／精準：Barrett、Dragunov、FR-F2、Kar98k、M14 EBR EOTech、M40A1、SR-25、CSLS06
- 機槍：M249 SPW、MG4、RPK-74、K3
- 霰彈：SAIGA-12、USAS-12
- 其他：GL06（榴彈發射器）、RPG、十字弓、手裡劍、苦無（金色、冰柱）、武士刀、戰斧、鐵鎚、撬棍、球棒、警盾
完整圖名清單：`Imgset_GachaSelect_*` 的 Texture2D（1604 張）以 `tools/sf2_props.py` 讀出。

## 5. 官方網站（mangot5）能讀到的轉蛋名稱
2020-06-17 公告「儲值滿額自選槍 – 獎勵參考單」裡的轉蛋：All In One A、B、C、D，深紅內幕，秘林殺機，盛夏慶典，吸血蘿莉喵。內容物頁面讀不到。

## 還要更完整的話
- 解密 `SFGameItem.twn`（逆向 `sf2.exe` 的語系檔讀取）就能把所有編號對到槍名，並看到每個扭蛋的名稱與說明。
- 或是用瀏覽器開官方網站的轉蛋內容頁，人工抄清單。
