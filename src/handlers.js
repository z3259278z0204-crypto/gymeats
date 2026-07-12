// 決策中心：收到一則訊息，決定要記餐 / 記體重 / 回總覽 / 給說明
const {
  getOrCreateUser,
  insertFood,
  insertBody,
  insertWorkout,
  setUserTarget,
  getTodaySummary,
  insertExpense,
  getSpending,
  todayStartMs,
  weekStartMs,
  monthStartMs,
} = require('./db');
const { parseMessage } = require('./parser');
const { estimateNutrition } = require('./ai');
const { buildOverviewFlex, buildSpendingFlex, mealQuickReply, fmt } = require('./flex');
const { config } = require('./config');

// 圖文選單按鈕送出的關鍵字 → 對應的引導或佔位回覆
const MENU_HINTS = {
  記一餐: '記一餐直接打：餐別 品項 金額\n例：午餐 雞胸便當 120（金額可省略）',
  量體重: '量體重直接打數字就好\n例：72.3（也可加體脂：72.3 15）',
  快速補記: '快速補記：直接打品項即可，例「地瓜」\n沒打餐別和金額也能記',
  記訓練: '記訓練：打「運動＋時間」，例：\n・慢跑 30\n・重訓 45\n・游泳（沒打時間預設 30 分鐘）\n會自動算消耗熱量',
  拍照記: '拍照記功能開發中，很快就來 📷',
  加照片: '拍照記功能開發中，很快就來 📷',
  熱量估不準: '之後會開放手動修正數字，先幫你記著這個需求 🙏',
};

// 純文字回覆的小工具
function text(t, quickReply) {
  const msg = { type: 'text', text: t };
  if (quickReply) msg.quickReply = quickReply;
  return msg;
}

// 處理一個 LINE event，回傳「要回覆的訊息陣列」（或 null 表示不回）
async function handleEvent(event) {
  // 只處理文字訊息；其他型別（貼圖、圖片等）先給簡單引導
  if (event.type !== 'message') return null;
  const lineUid = event.source.userId;
  const user = getOrCreateUser(lineUid);

  if (event.message.type !== 'text') {
    return [text('目前先支援文字記錄喔～試試打「午餐 雞胸便當 120」')];
  }

  const content = event.message.text.trim();

  // ---- 圖文選單按鈕 / 特殊關鍵字（優先攔截，避免被當成餐點）----
  if (MENU_HINTS[content]) {
    return [text(MENU_HINTS[content])];
  }

  const intent = parseMessage(content);

  // ---- 今日總覽 ----
  if (intent.type === 'overview') {
    const summary = getTodaySummary(user.id);
    const target = user.cal_target ?? config.calTargetDefault;
    return [buildOverviewFlex(summary, target)];
  }

  // ---- 設定每日目標 ----
  if (intent.type === 'setTarget') {
    setUserTarget(user.id, intent.target);
    return [text(`✅ 已把每日熱量目標設為 ${fmt(intent.target)} 大卡\n打「總覽」就會看到淨熱量對目標`)];
  }

  // ---- 通用記帳：記一筆支出 ----
  if (intent.type === 'expense') {
    insertExpense({
      userId: user.id,
      category: intent.category,
      name: intent.name,
      amount: intent.amount,
    });
    const nameLine = intent.name && intent.name !== intent.category ? `・${intent.name}` : '';
    return [
      text(
        `✅ 已記帳：${intent.category}${nameLine}　$${fmt(intent.amount)}\n打「本月花費」看統計`
      ),
    ];
  }

  // ---- 查花費統計（今日／本週／本月）----
  if (intent.type === 'expenseReport') {
    const startMap = {
      today: [todayStartMs, '今日花費'],
      week: [weekStartMs, '本週花費'],
      month: [monthStartMs, '本月花費'],
    };
    const [startFn, title] = startMap[intent.period] || startMap.month;
    const report = getSpending(user.id, startFn());
    return [buildSpendingFlex(title, report)];
  }

  // ---- 記訓練（含消耗熱量）----
  if (intent.type === 'workout') {
    insertWorkout({
      userId: user.id,
      name: intent.activity,
      duration: intent.minutes,
      kcal: intent.kcal,
    });
    return [
      text(
        `✅ ${intent.activity} ${intent.minutes} 分鐘\n消耗約 ${fmt(intent.kcal)} 大卡`,
        mealQuickReply
      ),
    ];
  }

  // ---- 體重 ----
  if (intent.type === 'weight') {
    insertBody({ userId: user.id, weight: intent.weight, bodyfat: intent.bodyfat });
    const bf = intent.bodyfat ? `，體脂 ${intent.bodyfat}%` : '';
    return [text(`已記錄體重 ${intent.weight} kg${bf}`)];
  }

  // ---- 記一餐 ----
  if (intent.type === 'food') {
    const nutrition = await estimateNutrition(
      intent.meal ? `${intent.meal} ${intent.name}` : intent.name
    );
    insertFood({
      userId: user.id,
      name: intent.name,
      ...nutrition,
      price: intent.price,
    });

    const mealLabel = intent.meal ? `${intent.meal}・` : '';
    const priceLine = intent.price !== null ? `　花費 $${fmt(intent.price)}` : '';
    const body =
      nutrition.kcal !== null
        ? `${fmt(nutrition.kcal)} 大卡（蛋白 ${fmt(nutrition.protein)}g／碳 ${fmt(
            nutrition.carb
          )}g／脂 ${fmt(nutrition.fat)}g）`
        : '（熱量暫時估不出來，先幫你記下品項）';

    return [text(`✅ ${mealLabel}${intent.name}\n${body}${priceLine}`, mealQuickReply)];
  }

  // ---- 看不懂 ----
  return [
    text(
      '我還看不懂這句 🤔\n' +
        '・記一餐：午餐 雞胸便當 120（金額可省略）\n' +
        '・記帳：房租 15000、交通 捷運 50、娛樂 電影 320\n' +
        '・查花費：本月花費 / 本週花費 / 今日花費\n' +
        '・記訓練：慢跑 30、重訓 45\n' +
        '・記體重：直接打數字，如 72.3\n' +
        '・設目標：目標 2600\n' +
        '・看今日：打「總覽」'
    ),
  ];
}

module.exports = { handleEvent };
