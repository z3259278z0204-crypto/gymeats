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

  // 1) 總覽指令
  if (OVERVIEW_WORDS.includes(text)) {
    return { type: 'overview' };
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
