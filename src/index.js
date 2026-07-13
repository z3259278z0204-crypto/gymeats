// 主程式：開伺服器、驗證 LINE 簽章、把訊息交給決策中心
const express = require('express');
const line = require('@line/bot-sdk');
const { config, assertConfig } = require('./config');
const { handleEvent } = require('./handlers');
const { getOrCreateUser, upsertAppleEnergy } = require('./db');

assertConfig(); // 啟動時提醒金鑰有沒有漏填

const lineConfig = {
  channelAccessToken: config.line.channelAccessToken,
  channelSecret: config.line.channelSecret,
};

// v11 SDK：用 messagingApi.MessagingApiClient 建立發訊客戶端
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.line.channelAccessToken,
});
const app = express();

// 健康檢查：用瀏覽器打開 http://localhost:3000/ 會看到 OK，確認伺服器活著
app.get('/', (req, res) => res.send('GymEats 機器人運作中 ✅'));

// LINE 的 webhook 入口。line.middleware 會自動驗證簽章（確認訊息真的來自 LINE）
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  // 先秒回 200 給 LINE，實際處理丟到背景，避免問 Claude、冷啟動太久
  // 導致 LINE webhook 逾時、變成「已讀不回」。
  res.status(200).end();

  const events = (req.body && req.body.events) || [];
  events.forEach(async (event) => {
    try {
      const messages = await handleEvent(event);
      if (messages && event.replyToken) {
        // 用「回覆」而非「推播」，符合 MVP 需求且不耗推播額度（v11 用物件參數）
        await client.replyMessage({ replyToken: event.replyToken, messages });
      }
    } catch (err) {
      console.error('處理事件出錯：', err);
    }
  });
});

// Apple 捷徑連動：iPhone 捷徑讀「今日活動能量」後 POST 到這裡，記進今天的運動消耗。
// 只在這條路由用 express.json()（不能放在 /webhook 前面，LINE 簽章需要原始 body）。
app.post('/apple', express.json(), (req, res) => {
  const { token, uid, kcal } = req.body || {};
  // 通行證檢查：沒設 APPLE_TOKEN 或對不上就擋掉
  if (!config.apple.token || token !== config.apple.token) {
    return res.status(403).json({ ok: false, error: '通行證錯誤' });
  }
  const energy = Number(kcal);
  if (!uid || !Number.isFinite(energy) || energy < 0) {
    return res.status(400).json({ ok: false, error: '資料格式錯誤（需要 uid 與 kcal）' });
  }
  const user = getOrCreateUser(uid);
  const rounded = Math.round(energy);
  upsertAppleEnergy({ userId: user.id, kcal: rounded });
  res.json({ ok: true, kcal: rounded });
});

app.listen(config.port, () => {
  console.log(`🚀 GymEats 已啟動，正在監聽 http://localhost:${config.port}`);
  console.log('   下一步：用 ngrok 對外，並把網址填到 LINE 後台的 Webhook URL');
});
