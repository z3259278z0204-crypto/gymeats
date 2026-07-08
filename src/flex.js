// 組「今日總覽」的 Flex 卡片，以及記完餐的 Quick Reply 按鈕
// 原則：超標只中性顯示數字（例 1,750/1,600 ⚠️），不出現任何勸戒或責備文字

// 數字加千分位，null 顯示為「—」
function fmt(n, digits = 0) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// 一列「標籤 ── 數值」
function row(label, value, highlight = false) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#8C8C8C', flex: 3 },
      {
        type: 'text',
        text: value,
        size: 'sm',
        color: highlight ? '#D9534F' : '#333333',
        align: 'end',
        flex: 4,
        weight: 'bold',
      },
    ],
  };
}

// 今日總覽卡片。summary 來自 db.getTodaySummary()，calTarget 可為 null
function buildOverviewFlex(summary, calTarget) {
  const { food, body } = summary;

  // 熱量：有目標就顯示「實際/目標」，超標補 ⚠️（純數字，不評論）
  let kcalText = `${fmt(food.kcal)} 大卡`;
  let kcalOver = false;
  if (calTarget) {
    kcalOver = food.kcal > calTarget;
    kcalText = `${fmt(food.kcal)}/${fmt(calTarget)}${kcalOver ? ' ⚠️' : ''}`;
  }

  return {
    type: 'flex',
    altText: '今日總覽',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '今日總覽', weight: 'bold', size: 'lg', color: '#FFFFFF' },
          { type: 'text', text: `已記 ${food.meals} 餐`, size: 'xs', color: '#FFFFFFCC' },
        ],
        backgroundColor: '#1F7A5A',
        paddingAll: '16px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: [
          row('熱量', kcalText, kcalOver),
          row('蛋白質', `${fmt(food.protein)} g`),
          row('碳水', `${fmt(food.carb)} g`),
          row('脂肪', `${fmt(food.fat)} g`),
          { type: 'separator', margin: 'md' },
          row('花費', `$${fmt(food.price)}`),
          row('體重', body ? `${fmt(body.weight, 1)} kg` : '尚未記錄'),
        ],
      },
    },
  };
}

// 記完一餐後的 Quick Reply 三顆按鈕（依需求：加照片／熱量估不準?／看今日總覽）
const mealQuickReply = {
  items: [
    {
      type: 'action',
      action: { type: 'message', label: '📷 加照片', text: '加照片' },
    },
    {
      type: 'action',
      action: { type: 'message', label: '熱量估不準?', text: '熱量估不準' },
    },
    {
      type: 'action',
      action: { type: 'message', label: '看今日總覽', text: '總覽' },
    },
  ],
};

module.exports = { buildOverviewFlex, mealQuickReply, fmt };
