# SF2 公開資料整理（2026-10-04）

用途：之後新增地圖、槍枝、音效、擊殺徽章時的參考。

原則：**只參考公開資訊來自己重做**，不放入從遊戲拆出來的模型、貼圖、音效檔。遊戲公開放在 GitHub Pages 上，用拆包素材等於散布 Dragonfly 的著作物。

## 來源
- EU 版 Fandom wiki（CC-BY-SA）：https://skill-special-force-2.fandom.com/wiki/S.K.I.L.L._Special_Force_2_Wiki
  - [Weapons](https://skill-special-force-2.fandom.com/wiki/Weapons)、[Maps](https://skill-special-force-2.fandom.com/wiki/Maps)、[Killstreak Emblems](https://skill-special-force-2.fandom.com/wiki/Killstreak_Emblems)
  - WebFetch 會被擋（HTTP 402），要用內建瀏覽器讀。
- 韓國 namu.wiki（CC BY-NC-SA 2.0 KR）：
  - [맵](https://namu.wiki/w/%EC%8A%A4%ED%8E%98%EC%85%9C%ED%8F%AC%EC%8A%A42/%EB%A7%B5)、[섬멸전맵](https://namu.wiki/w/%EC%8A%A4%ED%8E%98%EC%85%9C%ED%8F%AC%EC%8A%A42/%EC%84%AC%EB%A9%B8%EC%A0%84%EB%A7%B5)（團隊死鬥地圖）、[돌격소총](https://namu.wiki/w/%EC%8A%A4%ED%8E%98%EC%85%9C%ED%8F%AC%EC%8A%A42/%EB%8F%8C%EA%B2%A9%EC%86%8C%EC%B4%9D)（每把槍的特性與改版歷史）
  - 用 fetch 會被 Cloudflare 擋，要直接用瀏覽器開頁面。
- [Inven：SF2 地圖介紹](https://www.inven.co.kr/webzine/news/?news=37607)

## 地圖（EU 版 39 張）
Anaconda: Sector 7 · Biolab · Building Site（+Night）· Cannon · Cathedral · Checkmate · Cold Poison · Convoy · Dam · Defense · Desert Camp · Drone · Embassy · Factory · Farmhouse · Ghost Town · Hangar · Hero Valley · Hexa · Hospital · Kings Temple · Lost Temple · Missile · Mogadishu · Night Shot: Training · Peacehawk · Power Station · Prison · Riverside Village · Russian Factory · Ryokan · Safe House · Satellite · Shanghai · Skyline · Station · Survival · Workshop

**能拿來參考的圖片很少**：
- Fandom 上只有 5 張地圖各有 6 張遊戲截圖：Anaconda: Sector 7、Biolab、Building Site、Building Site: Night、Cannon。
- 只有 **Satellite** 有俯視平面圖：彎曲的走廊加上房間，藍方在上、紅方在下，完全不是矩形。
- 其他地圖都只有封面圖；「Tactical Map」欄位全是 Coming Soon。

**namu.wiki 的文字描述可以拿來設計動線**（團隊死鬥）：
- **Hangar（격납고）**：牆幾乎都是鋼板，打不穿。兩側有小路，是狙擊手埋伏的地方，也可以用霰彈槍或衝鋒槍從小路突襲。
- **Farmhouse（팜하우스）**：波蘭農莊，牆大多是木頭和乾草，可以穿牆射擊。中央有一台被炸毀的多管火箭車，民宅旁有水塔，還有兩座有梯子的乾草倉（狙擊點）。地形開闊。
- **Lost Temple（로스트템플）**：印度核武庫，幾乎所有地方都能穿牆。中央有卡車，雙方出生點前各有一台悍馬（打不穿）。
- **Dam（댐）**：左右不對稱。攻方從左下往上推，守方從右上往下。中間有一條小路，佔住小路就能穿牆打敵方陣地。守方起點有玻璃窗，可以看到一顆大岩石；中間有上坡，坡頂被岩石蓋住，防止手榴彈丟過去。
- **Mogadishu（모가디슈）**：平衡度好。雙方狙擊手互相看得到，突擊手走小路繞後。
- **White Night（백야）**：適合從側翼突破包抄，掩體很多，適合衝鋒槍。
- **Castle（캐슬）**：可以潛入對方建築，大部分牆擋不住機槍子彈。
- **Heavy Rain（헤비레인，佔領戰）**：南沙群島叢林，可以進到水裡，木橋上要小心狙擊。
- **Skywalker（狙擊）**：左右各有一台纜車，中央有可以操作的橋。
- **Bridge（돌파）**：攻方要連續突破 3 道封鎖線。

## 槍枝：SF2 有、我們還沒有的（約 27 把）
- **突擊步槍**：M16A3、XM8、QBZ-97、M14 EBR、SG 551、Howa Type 89、K2、HK417、SCAR-H、GALIL。AK-103 對應我們的 AK-47。
- **衝鋒槍**：PP2000、Scorpion vz61（我們的 MP5 對應 MP5K）。
- **狙擊槍**：FR-F2、SR-25、PSG1、CZ 700、M40A1。
- **機槍**：MG4、K3、L86A1、HK23E。
- **霰彈槍**：AA-12。
- **手槍**：S&W Model 60、Jericho 941、Beretta M92FS、CZ 75BD、Infinity。

namu.wiki 對每把槍有手感描述，可以用來決定數值的相對高低。例如 AK103：傷害高、開鏡精準、反動比衝鋒槍還小，改版後削弱了開鏡精準度。

## 擊殺徽章（24 種，名稱來自 wiki 圖檔）
| 徽章 | 條件 |
|---|---|
| Kill | 擊殺 1 人 |
| Headshot | 爆頭擊殺 |
| First Kill | 本回合／本場第一殺 |
| Revenge | 殺掉上一個殺你的人 |
| Last One Shot | 用彈匣最後一發擊殺 |
| Long Shot | 遠距離擊殺 |
| Grenade | 手榴彈擊殺 |
| Love Shot | 和敵人同時互殺 |
| Assist | 助攻 |
| Piercing Shot | 穿過人體（隊友或敵人）擊殺 |
| Wall Shot | 穿牆擊殺 |
| Strike | 投擲物在爆炸前直接砸中致死 |
| Splash | 引爆炸藥桶或炸彈波及致死 |
| Welcome Back | 連續陣亡後的第一殺 |
| Man on a Stick | 十字弓／複合弓擊殺 |
| Chop Axe | 戰斧擊殺 |
| Slash | 背刺（從背後 90° 內的近戰） |
| Throwing Knife | 廓爾喀刀擊殺 |
| Super Mario | 從上方踩頭擊殺 |
| Fast Zoom | 快速開鏡擊殺 |
| Double Kill / Multi Kill / Specialist / Special Force | 連殺 2 / 3 / 4 / 5 人 |

**風格**：銀色軍功章（星芒外框，加藍紅色光芒），中央是主題圖示。例如 Headshot 是有彈孔的骷髏，Revenge 是拳頭，Special Force 是金龍加五顆星，Wall Shot 是子彈穿牆。我們用自己畫的 SVG／Canvas 做同風格的徽章。

## 音效（目前全部是程式合成的，換成真實錄音是最大的提升）
- **[The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library)**：**CC0**（不需署名，可商用），194 MB（.7z），涵蓋步槍（含 AK47）、自動和半自動武器、霰彈槍（泵動）、栓動、卡賓槍、手槍、左輪。只取需要的槍，壓縮成每把約數十 KB 的 OGG。
- **[Sonniss GDC Game Audio Bundle](https://gdc.sonniss.com/)**：可免費用在遊戲裡、不需署名，但不能單獨轉賣，也不能拿去訓練 AI。適合拿腳步、衣服摩擦（Foley）和環境音。
- **Kenney.nl（CC0）**：腳步聲（水泥、草地、木頭、雪、地毯）、撞擊聲。
- **freesound.org 的 CC0 錄音**：衣服摩擦、裝備晃動、工廠或機械環境音、鳥叫、遠方槍聲。
- **不要用**：GameBanana 的 [Special Force 2 Gun Sounds](https://gamebanana.com/sounds/34049)，以及用 UModel 拆出來的音效，兩者都是遊戲原檔，有著作權。
