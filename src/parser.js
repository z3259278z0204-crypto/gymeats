// 判斷使用者打的文字是哪一種：總覽 / 體重 / 一餐
// 回傳一個「意圖物件」，讓後面的程式知道要做什麼

const MEAL_WORDS = ['早餐', '午餐', '晚餐', '宵夜', '點心', '早', '午', '晚'];
const OVERVIEW_WORDS = ['總覽', '今日總覽', '看今日總覽', '總結', '今天'];

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
