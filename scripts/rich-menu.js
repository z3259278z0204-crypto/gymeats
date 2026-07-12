// 上傳圖文選單（Rich Menu）：2×3 六格，並設成所有好友的預設選單
// 執行方式：npm run menu
const fs = require('fs');
const path = require('path');
const line = require('@line/bot-sdk');
const { config } = require('../src/config');

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.line.channelAccessToken,
});
const blobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: config.line.channelAccessToken,
});

// 圖片尺寸固定 2500 × 1686（LINE 規定的大版尺寸）
const W = 2500;
const H = 1686;
const cw = W / 2; // 每格寬 1250
const ch = H / 3; // 每格高 562

// 一格點擊區：點下去就送出一段文字給機器人
function cell(col, row, text) {
  return {
    bounds: { x: col * cw, y: row * ch, width: cw, height: ch },
    action: { type: 'message', text },
  };
}

const richMenu = {
  size: { width: W, height: H },
  selected: true,
  name: 'GymEats 主選單',
  chatBarText: '打開選單',
  areas: [
    cell(0, 0, '記一餐'),      // 左上
    cell(1, 0, '記帳'),        // 右上 → 跳出分類按鈕
    cell(0, 1, '量體重'),      // 左中
    cell(1, 1, '記訓練'),      // 右中
    cell(0, 2, '本月花費'),    // 左下 → 查花費統計卡
    cell(1, 2, '總覽'),        // 右下 → 今日總覽
  ],
};

async function main() {
  const imgPath = path.join(__dirname, '..', 'assets', 'richmenu.png');
  if (!fs.existsSync(imgPath)) {
    console.error('❌ 找不到選單底圖：', imgPath);
    console.error('   請放一張 2500×1686 的 PNG 到 assets/richmenu.png 再重跑。');
    process.exit(1);
  }

  console.log('0/3 清掉舊選單（避免累積）…');
  try {
    const { richmenus } = await client.getRichMenuList();
    for (const rm of richmenus || []) {
      await client.deleteRichMenu(rm.richMenuId);
      console.log('    刪除舊選單', rm.richMenuId);
    }
  } catch (e) {
    console.log('    （沒有舊選單或略過）');
  }

  console.log('1/3 建立選單結構…');
  const { richMenuId } = await client.createRichMenu(richMenu);
  console.log('    完成，richMenuId =', richMenuId);

  console.log('2/3 上傳底圖…');
  const buffer = fs.readFileSync(imgPath);
  const blob = new Blob([buffer], { type: 'image/png' });
  await blobClient.setRichMenuImage(richMenuId, blob);
  console.log('    完成');

  console.log('3/3 設為預設選單…');
  await client.setDefaultRichMenu(richMenuId);
  console.log('    完成 ✅ 打開和機器人的聊天室就會看到選單');
}

main().catch((err) => {
  console.error('上傳選單失敗：', err.status || '', err.message);
  if (err.body) console.error(JSON.stringify(err.body, null, 2));
  process.exit(1);
});
