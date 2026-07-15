// 判斷使用者打的文字是哪一種：總覽 / 體重 / 一餐
// 回傳一個「意圖物件」，讓後面的程式知道要做什麼

const MEAL_WORDS = ['早餐', '午餐', '晚餐', '宵夜', '點心', '早', '午', '晚'];
const OVERVIEW_WORDS = ['總覽', '今日總覽', '看今日總覽', '總結', '今天'];

// 運動每 30 分鐘消耗熱量（大卡）。數值取自使用者 InBody 報告，以體重約 74kg 為基準。
// 重訓不在 InBody 表，以中等強度約 6 MET 估算（≈220/30分）。
const EXERCISE_KCAL = {
  高爾夫球: 130, 高爾夫: 130,
  槌球: 140,
  走路: 148, 散步: 148,
  瑜伽: 148, 瑜珈: 148,
  羽毛球: 167, 羽球: 167,
  桌球: 167,
  網球: 221,
  自行車: 221, 騎車: 221, 單車: 221, 腳踏車: 221,
  拳擊: 221,
  籃球: 221,
  健行: 241, 爬山: 241,
  有氧: 258, 有氧運動: 258,
  跳繩: 258,
  慢跑: 258, 跑步: 258,
  游泳: 258,
  足球: 258,
  劍道: 369, 日本劍道: 369,
  短柄牆球: 369,
  壁球: 369,
  跆拳道: 369,
  重訓: 220, 健身: 220, 重量訓練: 220, 舉重: 220,
};

// 通用記帳的分類：關鍵字 → 分類名稱。第一個詞打中就歸到那一類。
const EXPENSE_ALIASES = {
  交通: '交通', 車資: '交通', 捷運: '交通', 公車: '交通', 高鐵: '交通',
  火車: '交通', 計程車: '交通', uber: '交通', 油錢: '交通', 加油: '交通',
  停車: '交通', 過路費: '交通',
  居住: '居住', 房租: '居住', 水電: '居住', 電費: '居住', 水費: '居住',
  瓦斯: '居住', 網路: '居住', 管理費: '居住',
  娛樂: '娛樂', 電影: '娛樂', 遊戲: '娛樂', 唱歌: '娛樂', ktv: '娛樂',
  旅遊: '娛樂', 門票: '娛樂',
  購物: '購物', 衣服: '購物', 鞋: '購物', 日用品: '購物', 家電: '購物', '3c': '購物',
  醫療: '醫療', 看醫生: '醫療', 看病: '醫療', 藥: '醫療', 診所: '醫療', 掛號: '醫療',
  學習: '學習', 書: '學習', 課程: '學習', 報名費: '學習', 學費: '學習',
  人情: '人情', 禮物: '人情', 紅包: '人情', 請客: '人情',
  其他: '其他', 雜支: '其他',
};

// 查花費指令 → 期間
const SPENDING_REPORT = {
  今日花費: 'today', 今天花費: 'today',
  本週花費: 'week', 這週花費: 'week', 週花費: 'week',
  本月花費: 'month', 這個月花費: 'month', 月花費: 'month', 花費: 'month',
};

// 是不是金額（1~7 位數，可含小數），用來判斷記帳的金額
function isAmount(text) {
  return /^\d{1,7}(\.\d{1,2})?$/.test(text);
}

// 把中文數字符號、全形數字之類先正規化（簡單處理全形）
function normalize(text) {
  return text
    .trim()
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, ' ')
    .replace(/\s+/g, ' ');
}

// 是不是「單純一個數字」（可含小數點），用來判斷體重
function isLoneNumber(text) {
  return /^\d{1,3}(\.\d{1,2})?$/.test(text);
}

function parseMessage(raw) {
  const text = normalize(raw);

  // 1) 總覽指令（可指定哪一天）
  //    今天：總覽 / 今天　｜　相對：昨天總覽 / 前天總覽
  //    指定日：總覽 7/13、總覽 2026-07-13、7/13總覽
  if (OVERVIEW_WORDS.includes(text)) {
    return { type: 'overview', dayOffset: 0 };
  }
  if (/^(昨天|昨日)(的?總覽)?$/.test(text)) return { type: 'overview', dayOffset: -1 };
  if (/^(前天)(的?總覽)?$/.test(text)) return { type: 'overview', dayOffset: -2 };
  {
    const dateStr = '(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[\\/月]\\d{1,2}日?)';
    const m =
      text.match(new RegExp(`^(?:總覽|今日總覽|總結)\\s*${dateStr}$`)) ||
      text.match(new RegExp(`^${dateStr}\\s*(?:的?總覽)$`));
    if (m) return { type: 'overview', dateStr: m[1] };
  }

  // 1.5) 設定每日目標：例「目標 2600」
  const targetMatch = text.match(/^目標\s*(\d{3,5})$/);
  if (targetMatch) {
    return { type: 'setTarget', target: Number(targetMatch[1]) };
  }

  // 1.6) 運動：例「慢跑 30」「重訓 45」「游泳」（可含「訓練/運動」前綴）
  let wt = text.split(' ');
  if (['訓練', '運動', '記訓練'].includes(wt[0])) wt = wt.slice(1);
  if (wt.length > 0 && EXERCISE_KCAL[wt[0]] != null) {
    const activity = wt[0];
    let minutes = 30; // 沒打時間預設 30 分鐘
    for (const tk of wt.slice(1)) {
      const m = tk.match(/^(\d{1,3})分?鐘?$/);
      if (m) {
        minutes = Number(m[1]);
        break;
      }
    }
    const kcal = Math.round((EXERCISE_KCAL[activity] * minutes) / 30);
    return { type: 'workout', activity, minutes, kcal };
  }

  // 1.7) 查花費：例「本月花費」「本週花費」「今日花費」
  if (SPENDING_REPORT[text]) {
    return { type: 'expenseReport', period: SPENDING_REPORT[text] };
  }

  // 1.8) 通用記帳：例「房租 15000」「交通 捷運 50」「支出 禮物 500」
  //      規則：（可省略的「記帳/支出」前綴）＋ 分類詞 ＋ 品項(可省) ＋ 金額
  {
    let xt = text.split(' ');
    const hadPrefix = ['記帳', '支出', '花錢'].includes(xt[0]);
    if (hadPrefix) xt = xt.slice(1);

    if (xt.length >= 1 && isAmount(xt[xt.length - 1])) {
      const amount = Number(xt[xt.length - 1]);
      const rest = xt.slice(0, xt.length - 1); // 金額以外的詞
      const cat = rest.length ? EXPENSE_ALIASES[rest[0].toLowerCase()] : null;

      if (cat) {
        const middle = rest.slice(1).join(' ').trim();
        return { type: 'expense', category: cat, name: middle || rest[0], amount };
      }
      // 有明確講「記帳/支出」但沒對到分類 → 先歸「其他」，仍然記下來
      if (hadPrefix) {
        return {
          type: 'expense',
          category: '其他',
          name: rest.join(' ').trim() || null,
          amount,
        };
      }
    }
  }

  // 1.9) 查進步：例「看 臥推」「進步 深蹲」→ 該動作重量趨勢
  const progM = text.match(/^(?:看|進步|紀錄)\s+(.+)$/);
  if (progM) {
    return { type: 'liftHistory', name: progM[1].trim() };
  }

  // 1.95) 重訓記錄：例「臥推 60 8」「槓鈴深蹲 100 5」＝動作 重量 次數
  //       用「兩個結尾數字」跟記餐（一個金額）區分。
  const liftM = text.match(/^(.+?)\s+(\d{1,3}(?:\.\d{1,2})?)\s+(\d{1,2})$/);
  if (liftM) {
    const name = liftM[1].trim();
    const weight = Number(liftM[2]);
    const reps = Number(liftM[3]);
    const notOther =
      !MEAL_WORDS.includes(name) &&
      !EXPENSE_ALIASES[name] &&
      EXERCISE_KCAL[name] == null;
    if (notOther && weight >= 1 && weight <= 500 && reps >= 1 && reps <= 50) {
      return { type: 'lift', name, weight, reps };
    }
  }

  // 2) 純數字 → 體重（例：72.3）。也接受「體重 72.3」
  const weightMatch = text.match(/^(?:體重\s*)?(\d{1,3}(?:\.\d{1,2})?)$/);
  if (weightMatch) {
    return { type: 'weight', weight: Number(weightMatch[1]) };
  }
  // 體重＋體脂（例：72.3 15）
  const bodyMatch = text.match(/^(\d{1,3}(?:\.\d{1,2})?)\s+(\d{1,2}(?:\.\d)?)%?$/);
  if (bodyMatch && Number(bodyMatch[1]) >= 20) {
    return {
      type: 'weight',
      weight: Number(bodyMatch[1]),
      bodyfat: Number(bodyMatch[2]),
    };
  }

  // 3) 其餘視為「一餐」：可能含餐別、品項、金額
  const tokens = text.split(' ');

  // 餐別：若第一個詞是餐別關鍵字就取出
  let meal = null;
  if (MEAL_WORDS.includes(tokens[0])) {
    meal = tokens.shift();
  }

  // 金額：若最後一個詞是純數字就當金額（可空）
  let price = null;
  if (tokens.length > 0 && isLoneNumber(tokens[tokens.length - 1])) {
    price = Number(tokens.pop());
  }

  const name = tokens.join(' ').trim();

  // 沒有品項名稱就無法記餐
  if (!name) {
    return { type: 'unknown' };
  }

  return { type: 'food', meal, name, price };
}

module.exports = { parseMessage };
