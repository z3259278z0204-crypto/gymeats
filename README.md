# 練食記 GymEats 🍱

LINE 上的健身飲食記帳機器人。核心賣點：**一餐同時記「熱量」和「花費」**。

- 打「午餐 雞胸便當 120」→ 自動用 Claude 估熱量/蛋白/碳/脂，並記下花費
- 打純數字「72.3」→ 記體重
- 打「總覽」→ 回一張今日摘要卡（熱量、蛋白、花費、體重）

MVP 使用本機 SQLite 資料庫，適合先驗證想法。

---

## 技術棧

| 用途 | 工具 |
|------|------|
| 伺服器 | Node.js + Express |
| LINE 訊息 | @line/bot-sdk（v11） |
| 資料庫 | better-sqlite3（本機檔案） |
| 熱量估算 | Anthropic Claude API |
| 金鑰管理 | dotenv |
| 對外測試 | ngrok |

---

## 你需要準備的 3 個金鑰

### 1 & 2：LINE 的兩個金鑰
1. 到 <https://developers.line.biz/console/> 用 LINE 帳號登入
2. 建一個 **Provider**（隨便取名，例：GymEats）
3. 在該 Provider 下建立 **Messaging API channel**（這會同時產生一個 LINE 官方帳號）
4. 進入 channel：
   - **Basic settings** 分頁 → 複製 `Channel secret` → 填到 `.env` 的 `LINE_CHANNEL_SECRET`
   - **Messaging API** 分頁 → 最下方 `Channel access token` 按 **Issue** → 複製 → 填到 `LINE_CHANNEL_ACCESS_TOKEN`
5. 同一分頁把 **Auto-reply messages** 關掉、**Webhook** 打開（Webhook URL 稍後填）

### 3：Anthropic API key
1. 到 <https://console.anthropic.com/> 登入
2. 左側 **API Keys** → **Create Key** → 複製 → 填到 `.env` 的 `ANTHROPIC_API_KEY`
3. 需要在 **Billing** 儲值一點額度才能用（估一餐約幾分錢）

---

## 在 Mac 上從零跑起來

### 前置：確認有 Node
```bash
node -v      # 有版本號就 OK（建議 v18 以上）
```
沒有的話到 <https://nodejs.org/> 下載 LTS 版安裝。

### 步驟 1：安裝套件
```bash
cd ~/Developer/gymeats
npm install
```

### 步驟 2：填金鑰
```bash
cp .env.example .env      # 複製一份範本
open -e .env              # 用文字編輯器打開，把 3 個金鑰貼進去
```

### 步驟 3：啟動機器人
```bash
npm start
```
看到 `🚀 GymEats 已啟動` 就成功了。用瀏覽器打開 <http://localhost:3000/> 應該看到「運作中 ✅」。

### 步驟 4：用 ngrok 讓 LINE 找得到你
機器人現在只跑在你電腦裡，LINE 在網路上連不到，要用 ngrok 開一條臨時通道。

1. 安裝（擇一）：
   ```bash
   brew install ngrok            # 有 Homebrew 的話
   ```
   或到 <https://ngrok.com/download> 下載。
2. 免費註冊 <https://dashboard.ngrok.com/> → 複製 authtoken → 設定一次：
   ```bash
   ngrok config add-authtoken 你的authtoken
   ```
3. **另開一個終端機視窗**（原本那個要留著跑機器人），執行：
   ```bash
   ngrok http 3000
   ```
4. 複製畫面上的 `https://xxxx.ngrok-free.app` 網址。

### 步驟 5：把 Webhook 填回 LINE
1. 回 LINE Developers → 你的 channel → **Messaging API** 分頁
2. **Webhook URL** 填：`https://xxxx.ngrok-free.app/webhook`（記得結尾加 `/webhook`）
3. 按 **Verify** 應該回成功；把 **Use webhook** 打開。

### 步驟 6：加好友實測
1. 同分頁上方有一個加好友的 **QR code**，用手機 LINE 掃描加入
2. 傳「午餐 雞胸便當 120」試試！

---

## 上傳圖文選單（六格按鈕）

底圖已附在 `assets/richmenu.png`（想換自己設計的可直接覆蓋，尺寸需 2500×1686）。
填好金鑰後執行：
```bash
npm run menu
```
成功後打開和機器人的聊天室，下方就會出現選單。

---

## 專案結構

```
gymeats/
├── .env.example       金鑰範本（複製成 .env 後填寫）
├── package.json       套件與指令設定
├── data/              SQLite 資料庫（自動產生，不外傳）
├── assets/
│   ├── richmenu.png   圖文選單底圖
│   └── richmenu.svg   底圖原始版型（可改）
├── scripts/
│   └── rich-menu.js   上傳圖文選單（npm run menu）
└── src/
    ├── index.js       伺服器與 webhook 入口
    ├── config.js      讀取金鑰
    ├── db.js          資料庫與資料表
    ├── parser.js      判斷訊息是「餐/體重/總覽」
    ├── ai.js          用 Claude 估算營養
    ├── flex.js        今日總覽卡片 + Quick Reply
    └── handlers.js    收訊後的決策中心
```

## 資料表

- `users(id, line_uid, goal_mode, cal_target)`
- `food_logs(id, user, ts, name, kcal, protein, carb, fat, price)`
- `body_logs(id, user, ts, weight, bodyfat)`
- `workout_logs(...)` — 訓練紀錄，MVP 未使用，結構先預留

## 常見問題

- **改了程式碼沒生效？** 回跑 `npm start` 的終端機按 `Ctrl + C` 停掉，再 `npm start`。
- **ngrok 網址每次重開都變？** 免費版會變，變了要回 LINE 後台重填 Webhook URL。
- **Verify 失敗？** 確認機器人（`npm start`）和 ngrok 兩個視窗都還開著。
