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
  const { food, body, workout } = summary;
  const burn = workout ? workout.kcal : 0;
  const net = food.kcal - burn; // 淨熱量 = 吃進去 - 運動燒掉

  // 淨熱量：有目標就顯示「實際/目標」，超標補 ⚠️（純數字，不評論）
  let netText = `${fmt(net)} 大卡`;
  let netOver = false;
  if (calTarget) {
    netOver = net > calTarget;
    netText = `${fmt(net)}/${fmt(calTarget)}${netOver ? ' ⚠️' : ''}`;
  }

  const workoutCount = workout ? workout.count : 0;

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
          {
            type: 'text',
            text: `已記 ${food.meals} 餐 · ${workoutCount} 次訓練`,
            size: 'xs',
            color: '#FFFFFFCC',
          },
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
          row('攝取', `${fmt(food.kcal)} 大卡`),
          row('運動消耗', burn > 0 ? `-${fmt(burn)} 大卡` : '—'),
          row('淨熱量', netText, netOver),
          { type: 'separator', margin: 'md' },
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

// 花費統計卡：title 例「本月花費」，report 來自 db.getSpending()
function buildSpendingFlex(title, report) {
  const { total, cats } = report;

  const rows = cats.length
    ? cats.map((c) => row(c.category, `$${fmt(c.amount)}`))
    : [
        {
          type: 'text',
          text: '這段期間還沒有任何花費紀錄',
          size: 'sm',
          color: '#8C8C8C',
          wrap: true,
        },
      ];

  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'lg', color: '#FFFFFF' },
          { type: 'text', text: `共 ${cats.length} 類`, size: 'xs', color: '#FFFFFFCC' },
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
          ...rows,
          { type: 'separator', margin: 'md' },
          row('合計', `$${fmt(total)}`, true),
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

// 記帳分類按鈕：點「記帳」後跳出，點一下分類就不用打字選類別
// 送出的文字用「分類:xxx」讓 handler 記住這位使用者接下來要記哪一類
const CATEGORY_BUTTONS = [
  ['🚌', '交通'], ['🏠', '居住'], ['🎬', '娛樂'], ['🛍️', '購物'],
  ['💊', '醫療'], ['📚', '學習'], ['🎁', '人情'], ['📦', '其他'],
];
const categoryQuickReply = {
  items: CATEGORY_BUTTONS.map(([icon, name]) => ({
    type: 'action',
    action: { type: 'message', label: `${icon} ${name}`, text: `分類:${name}` },
  })),
};

// 查花費快捷鈕：附在統計卡下面，點一下切換今日／本週／本月
const spendingQuickReply = {
  items: [
    { type: 'action', action: { type: 'message', label: '📅 今日', text: '今日花費' } },
    { type: 'action', action: { type: 'message', label: '🗓️ 本週', text: '本週花費' } },
    { type: 'action', action: { type: 'message', label: '📆 本月', text: '本月花費' } },
  ],
};

module.exports = {
  buildOverviewFlex,
  buildSpendingFlex,
  mealQuickReply,
  categoryQuickReply,
  spendingQuickReply,
  fmt,
};
