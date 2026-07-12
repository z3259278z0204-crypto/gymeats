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
  insertLift,
  getLiftMax,
  getLiftProgress,
  todayStartMs,
  weekStartMs,
  monthStartMs,
} = require('./db');
const { parseMessage } = require('./parser');
const { estimateNutrition } = require('./ai');
const {
  buildOverviewFlex,
  buildSpendingFlex,
  buildWorkoutFlex,
  mealQuickReply,
  categoryQuickReply,
  mealPickerQuickReply,
  spendingQuickReply,
  workoutPickerQuickReply,
  cancelQuickReply,
  fmt,
} = require('./flex');
const { config } = require('./config');

// 「用點的」暫存：點了分類/餐別後，記住這位使用者接下來要記什麼，等他輸入內容。
// 放記憶體即可（短暫流程，Render 重啟清空可接受）。
const pendingExpense = new Map(); // lineUid -> 分類名稱
const pendingMeal = new Map(); // lineUid -> 餐別名稱

// 圖文選單按鈕送出的關鍵字 → 對應的引導或佔位回覆
const MENU_HINTS = {
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

  // ---- 取消：中斷任何進行中的點選流程 ----
  if (content === '取消') {
    const hadExpense = pendingExpense.delete(lineUid);
    const hadMeal = pendingMeal.delete(lineUid);
    return [text(hadExpense || hadMeal ? '已取消 👌' : '目前沒有進行中的記錄')];
  }

  // ---- 今日課表：點部位 → 出當天課表 ----
  if (content === '今日課表') {
    return [text('今天練哪個部位？👇', workoutPickerQuickReply)];
  }
  if (content.startsWith('課表:')) {
    const key = content.slice(3).trim();
    const card = buildWorkoutFlex(key);
    if (card) {
      card.quickReply = workoutPickerQuickReply; // 卡片下面可再切別的部位
      return [card];
    }
    return [text('找不到這個部位，點「今日課表」重新選 💪')];
  }

  // ---- 記一餐「用點的」流程 ----
  // 點「記一餐」→ 跳出餐別按鈕，不用打字選餐別
  if (content === '記一餐') {
    pendingExpense.delete(lineUid);
    pendingMeal.delete(lineUid);
    return [text('吃了哪一餐？點下面選 👇', mealPickerQuickReply)];
  }
  // 點某個餐別 → 記住這餐是哪一餐，等使用者輸入品項＋金額
  if (content.startsWith('餐別:')) {
    const meal = content.slice(3).trim();
    pendingExpense.delete(lineUid);
    pendingMeal.set(lineUid, meal);
    return [
      text(
        `好，${meal}吃了什麼？🍽️\n打「品項 金額」，例：雞胸便當 120\n（金額可省略）`,
        cancelQuickReply
      ),
    ];
  }
  // 正在等這位使用者輸入這餐內容：有品項就記餐，否則放棄流程照常處理
  if (pendingMeal.has(lineUid)) {
    const meal = pendingMeal.get(lineUid);
    const toks = content.split(/\s+/);
    let price = null;
    if (toks.length > 1 && /^\d{1,7}(\.\d{1,2})?$/.test(toks[toks.length - 1])) {
      price = Number(toks.pop());
    }
    const name = toks.join(' ').trim();
    if (name) {
      pendingMeal.delete(lineUid);
      return [await recordMeal(user.id, meal, name, price)];
    }
    pendingMeal.delete(lineUid); // 沒品項，放棄流程往下照常處理
  }

  // ---- 記帳「用點的」流程（優先於其他判斷）----
  // 1) 點「記帳」→ 跳出分類按鈕，不用打字選類別
  if (content === '記帳') {
    pendingExpense.delete(lineUid);
    pendingMeal.delete(lineUid);
    return [text('要記哪一類？點下面選 👇', categoryQuickReply)];
  }
  // 2) 點某個分類 → 記住這位使用者要記哪一類，等他輸入金額
  if (content.startsWith('分類:')) {
    const cat = content.slice(3).trim();
    pendingMeal.delete(lineUid);
    pendingExpense.set(lineUid, cat);
    return [
      text(
        `好，輸入「${cat}」的金額 💰\n直接打數字即可，例：50\n也可加說明，例：捷運 50`,
        cancelQuickReply
      ),
    ];
  }
  // 3) 若正在等這位使用者輸入金額：像金額就記帳，否則放棄流程照常處理
  if (pendingExpense.has(lineUid)) {
    const cat = pendingExpense.get(lineUid);
    const m = content.match(/^(.*?)\s*(\d{1,7}(?:\.\d{1,2})?)$/);
    if (m) {
      pendingExpense.delete(lineUid);
      const name = (m[1] || '').trim() || cat;
      const amount = Number(m[2]);
      insertExpense({ userId: user.id, category: cat, name, amount });
      const nameLine = name !== cat ? `・${name}` : '';
      return [text(`✅ 已記帳：${cat}${nameLine}　$${fmt(amount)}`, spendingQuickReply)];
    }
    pendingExpense.delete(lineUid); // 不像金額，取消記帳、往下照常處理
  }

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
    const card = buildSpendingFlex(title, report);
    card.quickReply = spendingQuickReply; // 卡片下面附今日/本週/本月快捷鈕
    return [card];
  }

  // ---- 重訓記錄（動作＋重量＋次數），並判斷是否破紀錄 ----
  if (intent.type === 'lift') {
    const prevMax = getLiftMax(user.id, intent.name);
    insertLift({
      userId: user.id,
      name: intent.name,
      weight: intent.weight,
      reps: intent.reps,
    });
    const pr = prevMax === null || intent.weight > prevMax;
    const prLine = pr
      ? '\n🎉 新高！'
      : `（目前最佳 ${fmt(prevMax, 1)} kg）`;
    return [
      text(
        `✅ ${intent.name} ${fmt(intent.weight, 1)}kg × ${intent.reps}${prLine}\n查進步：看 ${intent.name}`
      ),
    ];
  }

  // ---- 查某動作進步趨勢 ----
  if (intent.type === 'liftHistory') {
    const rows = getLiftProgress(user.id, intent.name);
    if (!rows.length) {
      return [
        text(`還沒有「${intent.name}」的紀錄 🤔\n練完打「${intent.name} 60 8」記一下（動作 重量 次數）`),
      ];
    }
    let prev = null;
    const lines = rows.map((r) => {
      const md = r.day.slice(5).replace('-', '/'); // 07-13 -> 07/13
      const up = prev !== null && r.topWeight > prev ? ' 🔺' : '';
      prev = r.topWeight;
      return `${md}　${fmt(r.topWeight, 1)} kg${up}`;
    });
    const best = Math.max(...rows.map((r) => r.topWeight));
    return [
      text(`📈 ${intent.name} 進步\n${lines.join('\n')}\n—\n最佳 ${fmt(best, 1)} kg`),
    ];
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
    return [await recordMeal(user.id, intent.meal, intent.name, intent.price)];
  }

  // ---- 看不懂 ----
  return [
    text(
      '我還看不懂這句 🤔\n' +
        '・記一餐：午餐 雞胸便當 120（金額可省略）\n' +
        '・記帳：房租 15000、交通 捷運 50、娛樂 電影 320\n' +
        '・查花費：本月花費 / 本週花費 / 今日花費\n' +
        '・記重量：臥推 60 8（動作 重量 次數）／查進步：看 臥推\n' +
        '・記訓練：慢跑 30、重訓 45\n' +
        '・記體重：直接打數字，如 72.3\n' +
        '・設目標：目標 2600\n' +
        '・看今日：打「總覽」'
    ),
  ];
}

// 記一餐：問 Claude 估熱量、寫入 food_logs、組回覆。meal 可為 null，price 可為 null。
async function recordMeal(userId, meal, name, price) {
  const nutrition = await estimateNutrition(meal ? `${meal} ${name}` : name);
  insertFood({ userId, name, ...nutrition, price });

  const mealLabel = meal ? `${meal}・` : '';
  const priceLine = price !== null && price !== undefined ? `　花費 $${fmt(price)}` : '';
  const body =
    nutrition.kcal !== null
      ? `${fmt(nutrition.kcal)} 大卡（蛋白 ${fmt(nutrition.protein)}g／碳 ${fmt(
          nutrition.carb
        )}g／脂 ${fmt(nutrition.fat)}g）`
      : '（熱量暫時估不出來，先幫你記下品項）';

  return text(`✅ ${mealLabel}${name}\n${body}${priceLine}`, mealQuickReply);
}

module.exports = { handleEvent };
