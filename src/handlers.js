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
  addCustomExercise,
  getCustomExercises,
  deleteAllUserData,
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
  buildLiftPicker,
  mealQuickReply,
  categoryQuickReply,
  mealPickerQuickReply,
  spendingQuickReply,
  workoutPickerQuickReply,
  cancelQuickReply,
  fmt,
  buildStretchFlex,
  stretchQuickReply,
} = require('./flex');
const { pickWorkout, pickStretch, WORKOUT_KEYS } = require('./workouts');
const { config } = require('./config');

// 「用點的」暫存：點了分類/餐別/動作後，記住這位使用者接下來要記什麼，等他輸入內容。
// 放記憶體即可（短暫流程，Render 重啟清空可接受）。
const pendingExpense = new Map(); // lineUid -> 分類名稱
const pendingMeal = new Map(); // lineUid -> 餐別名稱
const pendingLift = new Map(); // lineUid -> { group, name } 要記重量的動作
const pendingWorkout = new Map(); // lineUid -> 本次抽中的動作陣列（讓卡片與續記按鈕一致）
const pendingCustom = new Map(); // lineUid -> 肌群名稱，正在等使用者輸入要新增的動作名稱
const pendingDelete = new Set(); // lineUid：正在等使用者確認「刪除我的資料」

// 每人每日記餐上限（＝每天最多呼叫幾次 AI 估熱量，防止有人狂打灌爆金鑰費用）。
// 可用環境變數 MEAL_DAILY_LIMIT 調整；一般人一天記不到 30 餐，正常使用不會碰到。
const DAILY_MEAL_LIMIT = Number(process.env.MEAL_DAILY_LIMIT) || 30;

// 隱私告知（打「隱私」會看到）：試用者知情同意用
const PRIVACY_TEXT =
  '🔒 隱私說明\n' +
  '\n' +
  '1. 會記錄：你輸入的飲食、花費、體重體脂、訓練記錄，以及你的 LINE 識別碼。\n' +
  '2. 存放：資料存在雲端伺服器（Render，位於新加坡）。\n' +
  '3. 食物名稱：為了估熱量，會傳給 AI 服務（Anthropic）處理，不會用於訓練。\n' +
  '4. 開發者：本機器人為個人專案，開發者技術上可看到資料，僅供除錯、不會外流或另作他用。\n' +
  '5. 你的權利：隨時打「刪除我的資料」可把你的所有記錄永久清除。\n' +
  '\n' +
  '有疑慮歡迎直接告訴開發者 🙌';

// 使用說明（打「說明」或「使用說明」會看到）
const HELP_TEXT =
  '📖 練食記 使用說明\n' +
  '\n' +
  '・記一餐：打「午餐 雞胸便當 120」（金額可省略）\n' +
  '・量體重：直接打數字，例「72.3」或「72.3 15」(體重 體脂)\n' +
  '・記帳：打「房租 15000」「交通 捷運 50」\n' +
  '・查花費：打「今日/本週/本月花費」\n' +
  '・今日課表：排當天要練的動作，可加自訂動作\n' +
  '・記重訓：打「臥推 60 8」(動作 重量 次數)\n' +
  '・查進步：打「看 臥推」\n' +
  '・總覽：打「總覽」看今天吃了多少\n' +
  '\n' +
  '🔒 隱私：打「隱私」\n' +
  '🗑️ 清除資料：打「刪除我的資料」';

// 圖文選單按鈕送出的關鍵字 → 對應的引導或佔位回覆
const MENU_HINTS = {
  量體重: '量體重直接打數字就好\n例：72.3（也可加體脂：72.3 15）',
  快速補記: '快速補記：直接打品項即可，例「地瓜」\n沒打餐別和金額也能記',
  記訓練: '記訓練：打「運動＋時間」，例：\n・慢跑 30\n・重訓 45\n・游泳（沒打時間預設 30 分鐘）\n會自動算消耗熱量',
  拍照記: '拍照記功能開發中，很快就來 📷',
  加照片: '拍照記功能開發中，很快就來 📷',
  熱量估不準: '之後會開放手動修正數字，先幫你記著這個需求 🙏',
};

// 判斷這句是不是「功能指令／選單按鈕」，而不是使用者要填的內容。
// 用在點選流程中途（等品項、等動作名）：使用者若改點別的功能，就放棄原流程，
// 而不是把「總覽」「記帳」這種指令誤存成餐點或動作名。
const RESERVED_EXACT = new Set([
  '取消', '說明', '使用說明', '幫助', '隱私', '隱私權', '隱私說明',
  '刪除我的資料', '刪除資料', '清除我的資料', '確定刪除',
  '今日課表', '記一餐', '記帳', '總覽', '今日總覽', '總結',
]);
function isCommandLike(c) {
  if (RESERVED_EXACT.has(c)) return true;
  if (MENU_HINTS[c]) return true; // 量體重／快速補記／記訓練／拍照記…
  if (/^(記:|課表:|新增動作:|餐別:|分類:)/.test(c)) return true;
  if (c.includes(':') || c.includes('：')) return true;
  if (/花費$/.test(c)) return true; // 今日／本週／本月花費
  return false;
}

// 這句看起來是不是「體重」（純數字，或「體重 體脂」兩個數字且第一個≥20）。
// 用在記餐等品項時：使用者若打數字，多半是想記體重而非把餐點取名叫數字。
function looksLikeWeight(c) {
  if (/^\d{1,3}(\.\d{1,2})?$/.test(c)) return true;
  const m = c.match(/^(\d{1,3}(?:\.\d{1,2})?)\s+(\d{1,2}(?:\.\d)?)%?$/);
  return !!(m && Number(m[1]) >= 20);
}

// 純文字回覆的小工具
function text(t, quickReply) {
  const msg = { type: 'text', text: t };
  if (quickReply) msg.quickReply = quickReply;
  return msg;
}

// 組某肌群的今日課表卡：隨機抽 5-6 個內建動作 ＋ 這位使用者的自訂動作
// 回傳可直接回覆的 Flex 卡（含下方動作按鈕）；找不到肌群回 null
function buildTodayWorkout(lineUid, userId, key) {
  const items = pickWorkout(key);
  if (!items) return null;
  const customs = getCustomExercises(userId, key).map((name) => ({ name, sr: '自訂' }));
  const all = [...items, ...customs];
  pendingWorkout.set(lineUid, all); // 記住這組，續記時按鈕一致
  const card = buildWorkoutFlex(key, all);
  card.quickReply = buildLiftPicker(key, all);
  return card;
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
    pendingExpense.delete(lineUid);
    pendingMeal.delete(lineUid);
    pendingLift.delete(lineUid);
    pendingWorkout.delete(lineUid);
    pendingCustom.delete(lineUid);
    pendingDelete.delete(lineUid);
    return [text('好的，取消了 👌')];
  }

  // 只要是功能指令／選單按鈕，就放棄「等品項／等動作名」這類自由輸入流程，
  // 避免使用者中途改點別的功能時，把「總覽」「記帳」誤存成餐點或自訂動作。
  if (isCommandLike(content)) {
    pendingMeal.delete(lineUid);
    pendingCustom.delete(lineUid);
  }

  // ---- 使用說明 / 隱私 ----
  if (content === '說明' || content === '使用說明' || content === '幫助') {
    return [text(HELP_TEXT)];
  }
  if (content === '隱私' || content === '隱私權' || content === '隱私說明') {
    return [text(PRIVACY_TEXT)];
  }

  // ---- 刪除我的資料：先確認，避免手誤 ----
  if (content === '刪除我的資料' || content === '刪除資料' || content === '清除我的資料') {
    pendingDelete.add(lineUid);
    return [
      text(
        '⚠️ 確定要刪除你的「全部」記錄嗎？\n（飲食、體重、花費、訓練、自訂動作都會清空，無法復原）\n\n確定請回覆「確定刪除」，或按取消。',
        cancelQuickReply
      ),
    ];
  }
  if (pendingDelete.has(lineUid)) {
    if (content === '確定刪除') {
      pendingDelete.delete(lineUid);
      const n = deleteAllUserData(user.id);
      return [text(`🗑️ 已刪除你的全部記錄（共 ${n} 筆），資料已清空。\n感謝試用 🙏`)];
    }
    pendingDelete.delete(lineUid); // 沒回「確定刪除」→ 當作放棄，往下照常處理
  }

  // ---- 課表記錄流程：點課表上的動作 → 問重量 → 記錄 ----
  // 點某動作（text「記:肌群:動作」）
  if (content.startsWith('記:')) {
    const rest = content.slice(2);
    const idx = rest.indexOf(':');
    const group = idx >= 0 ? rest.slice(0, idx) : '';
    const name = idx >= 0 ? rest.slice(idx + 1) : rest;
    pendingExpense.delete(lineUid);
    pendingMeal.delete(lineUid);
    pendingLift.set(lineUid, { group, name });
    return [text(`「${name}」這組多重？💪\n打「重量 次數」，例：60 8`, cancelQuickReply)];
  }
  // 正在等這位使用者輸入某動作的重量×次數
  if (pendingLift.has(lineUid)) {
    const { group, name } = pendingLift.get(lineUid);
    const m = content.match(/^(\d{1,3}(?:\.\d{1,2})?)\s*(?:kg)?\s+(\d{1,2})(?:\s*下)?$/i);
    if (m) {
      pendingLift.delete(lineUid);
      const weight = Number(m[1]);
      const reps = Number(m[2]);
      const prevMax = getLiftMax(user.id, name);
      insertLift({ userId: user.id, name, weight, reps });
      const pr = prevMax === null || weight > prevMax;
      const prLine = pr ? '　🎉 新高！' : `（最佳 ${fmt(prevMax, 1)}kg）`;
      const msg = text(
        `✅ ${name} ${fmt(weight, 1)}kg × ${reps}${prLine}\n繼續點下一個動作，或「看 ${name}」查進步`
      );
      const picker = buildLiftPicker(group, pendingWorkout.get(lineUid));
      if (picker) msg.quickReply = picker;
      return [msg];
    }
    pendingLift.delete(lineUid); // 不像「重量 次數」→ 放棄記錄，往下照常處理
  }

  // ---- 今日課表：點部位 → 出當天課表 ----
  if (content === '今日課表') {
    return [text('今天練哪個部位？👇', workoutPickerQuickReply)];
  }
  if (content.startsWith('課表:')) {
    const key = content.slice(3).trim();
    if (key === '伸展放鬆') { // 伸展放鬆：只顯示動作與停留呼吸數，不記重量
      pendingWorkout.delete(lineUid);
      const stretchCard = buildStretchFlex(pickStretch());
      stretchCard.quickReply = stretchQuickReply;
      return [stretchCard];
    }
    const card = buildTodayWorkout(lineUid, user.id, key); // 內建隨機 5-6 個 ＋ 自訂動作
    if (card) return [card];
    return [text('找不到這個部位，點「今日課表」重新選 💪')];
  }

  // ---- 新增自訂動作：點「➕ 新增動作」→ 輸入名稱 → 永久加進該肌群清單 ----
  if (content.startsWith('新增動作:')) {
    const group = content.slice('新增動作:'.length).trim();
    if (!WORKOUT_KEYS.includes(group)) {
      return [text('找不到這個部位，點「今日課表」重新選 💪')];
    }
    pendingExpense.delete(lineUid);
    pendingMeal.delete(lineUid);
    pendingLift.delete(lineUid);
    pendingCustom.set(lineUid, group);
    return [text(`要新增什麼動作到「${group}」？\n直接打動作名稱就好，例如：滑輪面拉`, cancelQuickReply)];
  }
  // 正在等使用者輸入要新增的動作名稱
  if (pendingCustom.has(lineUid)) {
    const group = pendingCustom.get(lineUid);
    // 改點別的功能指令 → 放棄新增；名稱過長、或純數字（沒意義）也不收
    if (!isCommandLike(content) && content.length <= 20 && !/^\d+(\.\d+)?$/.test(content)) {
      pendingCustom.delete(lineUid);
      const added = addCustomExercise({ userId: user.id, group, name: content });
      const msg = added
        ? `✅ 已把「${content}」加進「${group}」清單，之後點課表就看得到`
        : `「${content}」已經在「${group}」清單裡囉`;
      const card = buildTodayWorkout(lineUid, user.id, group);
      return card ? [text(msg), card] : [text(msg)];
    }
    pendingCustom.delete(lineUid); // 放棄新增，往下照常處理
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
  // （若打的是體重樣式的數字，放棄記餐、往下當體重處理，不把餐點取名叫數字）
  if (pendingMeal.has(lineUid) && looksLikeWeight(content)) {
    pendingMeal.delete(lineUid);
  } else if (pendingMeal.has(lineUid)) {
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
  // 每日上限保護：超過就不呼叫 AI（不花錢），回中性提示
  const todayMeals = getTodaySummary(userId).food.meals;
  if (todayMeals >= DAILY_MEAL_LIMIT) {
    return text(
      `今天的記餐額度用完囉（每日上限 ${DAILY_MEAL_LIMIT} 餐）🙌\n` +
        '明天再記，或改用不受限的「量體重／記帳／總覽」功能'
    );
  }
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
