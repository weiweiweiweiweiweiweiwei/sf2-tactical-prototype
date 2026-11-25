# SF2 Tactical 後端（自架，取代 Supabase）

Node.js 程式，Linux / Windows / macOS 都能跑，不需要資料庫。只有一個套件相依（`ws`）。

## 它負責什麼

對戰本身是玩家之間的 **WebRTC 點對點連線**，不經過這台伺服器。伺服器只做「介紹」和「記帳」：

| 功能 | 路徑 | 說明 |
|---|---|---|
| 大廳房間列表 | WebSocket `/ws`，頻道 `sf2:lobby` | 房主開房時登記，關掉分頁就自動消失 |
| 連線交握 | WebSocket `/ws`，頻道 `sf2:room:<6 位房號>` | 轉送 WebRTC 的 offer／answer／ICE，連上後就不再經過伺服器 |
| 好友通知 | WebSocket `/ws`，頻道 `sf2:inbox:<玩家 id>` | 有新邀請時「戳」對方立刻更新 |
| 好友系統 | `POST /api/rpc/sf2_*` | 好友代碼、好友邀請、在線狀態、房間邀請；存在 `data/friends.json` |
| TURN 中繼憑證 | `POST /api/turn` | 選用：給無法直連的玩家（嚴格 NAT、手機熱點） |
| 健康檢查 | `GET /healthz` | 回傳連線數、房間數、玩家數 |
| 遊戲網頁 | 其他 GET | 選用：設定 `STATIC_DIR` 後，這台伺服器也提供遊戲本身 |

流量很小：每個房間的交握只有幾 KB，好友輪詢每人每 5 秒一次小請求。小台 VPS（1 核 512 MB）就夠。

## 快速開始

需求：Node.js 18 以上（建議 22 LTS）。

```bash
cd server
npm ci                 # 安裝 ws
cp .env.example .env   # 依需要修改
npm test               # 自我測試，看到 TEST_OK 就代表正常
npm start              # 預設在 0.0.0.0:8787
```

## 部署（建議做法）

1. 把 `server/` 資料夾放到伺服器上，例如 `/opt/sf2/server`。
2. 建一個專用帳號，並讓它能寫入 `data/`：
   `sudo useradd -r -s /usr/sbin/nologin sf2 && sudo mkdir -p /opt/sf2/server/data && sudo chown -R sf2 /opt/sf2/server/data`
3. 用 systemd 常駐：參考 `sf2-backend.service`。
4. 前面放 nginx 或 Caddy 處理 HTTPS：參考 `nginx.conf.example`。
   **一定要 HTTPS／WSS。** 遊戲網頁是 https，瀏覽器不准它連 `ws://`。
5. 防火牆只需要開 443（以及 80 給憑證申請）。8787 只給本機的 nginx 連。

也可以用 Docker：

```bash
docker build -t sf2-backend .
docker run -d --name sf2 --restart unless-stopped -p 127.0.0.1:8787:8787 -v sf2data:/data sf2-backend
```

## 設定（`.env` 或環境變數）

完整說明見 `.env.example`。重點如下：

- **`ALLOWED_ORIGINS`**：哪些網站的遊戲頁面可以連進來。預設是 GitHub Pages 和 localhost。如果遊戲網頁換地方放，記得加上新網址。
- **`TRUST_PROXY=1`**：放在 nginx 後面時要開，限流才會看到真實 IP。
- **`STATIC_DIR`**：讓伺服器也提供遊戲網頁。要指向只有發佈檔案的資料夾（`index.html`、`assets/` 等），**不要指向整個專案**。
- **TURN**：三選一。
  - 自架 coturn：`TURN_URLS` 加 `TURN_SECRET`。coturn 那邊設 `use-auth-secret` 和同一個 `static-auth-secret`。
  - Metered。
  - Cloudflare。
  - 都不設也能玩，只是少數網路環境嚴格的玩家會連不上房主。

## 遊戲端怎麼連到這台伺服器

遊戲依下列順序決定後端網址：

1. 網址參數 `?server=https://sf2.example.com`（測試用，不用改程式）
2. `src/18b_online.js` 裡的 `const SERVER = ''`（正式上線時填這裡，然後重新 build）
3. 如果遊戲網頁就是由這台伺服器提供的（`STATIC_DIR`），自動使用同一個網址

## 安全設計

- **好友系統**：不需要帳號。每位玩家有一組 id 和隨機密碼（瀏覽器保存），伺服器只存密碼的 SHA-256。每次呼叫都要驗證，沒有人能冒充別人或看到別人的好友名單。
- **連線限制**：
  - 頻道名稱只接受固定格式；
  - 單則訊息最大 64 KB；
  - 每條連線最多 16 個頻道，每秒最多 120 則訊息；
  - 同一 IP 最多 50 條連線，每分鐘最多 600 次 API、20 次註冊。
- **來源檢查**：其他網站的網頁不能使用這台伺服器（檢查 `Origin`）。
- **靜態檔案**：不會提供 `.` 開頭的檔案（`.git`、`.env`），也不能用 `../` 跳出 `STATIC_DIR`。
- **好友資料**：每秒最多寫一次檔，先寫暫存檔再改名，不會寫壞。收到 SIGTERM（systemd stop）時會先存檔再結束。

## 備份

只有 `data/friends.json` 需要備份。房間列表和連線狀態都在記憶體裡，重啟後玩家會自動重連。
