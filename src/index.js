// 主程式：開伺服器、驗證 LINE 簽章、把訊息交給決策中心
const express = require('express');
const line = require('@line/bot-sdk');
const { config, assertConfig } = require('./config');
const { handleEvent } = require('./handlers');

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
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    const results = await Promise.all(
      req.body.events.map(async (event) => {
        const messages = await handleEvent(event);
        if (messages && event.replyToken) {
          // 用「回覆」而非「推播」，符合 MVP 需求且不耗推播額度（v11 用物件參數）
          await client.replyMessage({ replyToken: event.replyToken, messages });
        }
      })
    );
    res.json(results);
  } catch (err) {
    console.error('處理 webhook 出錯：', err);
    res.status(500).end();
  }
});

app.listen(config.port, () => {
  console.log(`🚀 GymEats 已啟動，正在監聽 http://localhost:${config.port}`);
  console.log('   下一步：用 ngrok 對外，並把網址填到 LINE 後台的 Webhook URL');
});
