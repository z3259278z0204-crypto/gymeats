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
  // Apple 捷徑連動用的密碼（環境變數 APPLE_TOKEN）。捷徑送資料時要帶上這串當通行證
  apple: {
    token: process.env.APPLE_TOKEN || '',
  },
  // 每日熱量目標預設值（環境變數 CAL_TARGET）。使用者若用「目標 XXXX」設定會覆蓋這個
  calTargetDefault: Number(process.env.CAL_TARGET) || null,
  // 每日喝水目標（環境變數 WATER_TARGET，毫升）。沒設就依最新體重×30ml 自動算，再沒有就 2000
  waterTargetDefault: Number(process.env.WATER_TARGET) || null,
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
