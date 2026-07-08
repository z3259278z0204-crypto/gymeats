// 把 .env 檔裡的金鑰讀進程式，並整理成一包好用的設定
require('dotenv').config();

const config = {
  line: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
  },
  port: Number(process.env.PORT) || 3000,
};

// 啟動時檢查必填金鑰有沒有漏，漏了就提前提醒，不要跑到一半才壞
function assertConfig() {
  const missing = [];
  if (!config.line.channelAccessToken) missing.push('LINE_CHANNEL_ACCESS_TOKEN');
  if (!config.line.channelSecret) missing.push('LINE_CHANNEL_SECRET');
  if (!config.anthropic.apiKey) missing.push('ANTHROPIC_API_KEY');
  if (missing.length > 0) {
    console.warn('⚠️  .env 還沒填這些金鑰：', missing.join(', '));
    console.warn('    請照 .env.example 填好，機器人才能正常運作。');
  }
}

module.exports = { config, assertConfig };
