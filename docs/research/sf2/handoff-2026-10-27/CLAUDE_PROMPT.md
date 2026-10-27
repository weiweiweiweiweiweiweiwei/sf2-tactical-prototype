# 可直接貼給 Claude 的提示

請接手《特種部隊2／Special Force 2》的武器資料研究。使用繁體中文，自主完成不需我介入的研究與文件整理。

在同一工作區時，交接包位於：
C:/Users/WEI/Desktop/Online Game/docs/research/sf2/handoff-2026-10-27/

若我是上傳ZIP，請先解壓並以其中的README.md為入口；不要依賴這台電腦的絕對路徑。

請依序讀取README.md、sources.json、weapons.json、package-catalog.json。若能存取原專案，再讀CLAUDE.md、docs/archive/COLLAB.md、docs/research/sf2/SF2_RESEARCH.md、docs/research/sf2/SF2_ASSET_INVENTORY.md、docs/research/sf2/evidence/README.md和sf2_params.json。不要覆寫既有研究紀錄，新增補充或變更紀錄。

本包已有35種槍械索引、27筆歷史日服評分快照、22筆舊逐槍證據精簡快照與366項候選封包檔名。請直接從這些結果繼續，不要重新從搜尋首頁開始。

請完成以下工作：

1. 為M4A1、AK-103、G36C、P90、Cheytac M200、M870各建一份待辦表，分別列模型/第一第三人稱/骨架/動畫/貼圖/音效/數值/配件變體的來源與缺口。
2. 優先追查原作者P5ykoOHD的量測表是否仍有可讀的公開版本；如失效，記錄失敗方式，不能捏造表格內容或把搜尋摘要當原文。
3. 確認循環RPM與包含換彈的持續RPM的定義。來源Steam指南明確採後者；舊資料中的rpm數字尚未確認，不能直接套60/rpm作開火間隔，也不要重新把回歸估算包裝成原作參數。
4. 對模型/槍聲包只把已讀取層級寫清楚：標題可讀、正文可讀、檔案可下載、壓縮包已驗、實際可用與權利可用是不同狀態。所有當前download_verified=false都必須維持，直到真的驗過。
5. 資料依KR2011、JP歷史、EU歷史、TW2024等版本分開；M4A1精準度、P90/MP5K評分與P90備彈存在差異，勿合併。傷害/射速UI評分不是HP或RPM。
6. 不要用AK-47替代AK-103、MP5替代MP5K，也不要把_sight封包當作已驗證可裝配道具。配件以明確變體名稱與來源記錄。
7. 本次請以研究資料、逐槍規格表和可追溯的JSON為交付。不要因為研究中發現模型/音效下載頁，就自動將原作素材導入或發佈到現有遊戲；依既有專案公開參考、自行重做原則處理。

每筆新數值至少記錄：weapon_id、variant、region、build_or_date、field、value、unit、source_id、source_location、access、status、measurement_definition。unknown用null，推估標estimated；confirmed_page僅代表讀到頁面，不表示參數/素材驗證成功。

最後請列出：新增確證、仍未知、發現衝突、實際改動檔案與驗證結果。遇到一個失效網址時繼續其他已授權研究，不要停在提案或等待我逐步指揮。

