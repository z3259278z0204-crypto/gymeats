// 組「今日總覽」的 Flex 卡片，以及記完餐的 Quick Reply 按鈕
// 原則：超標只中性顯示數字（例 1,750/1,600 ⚠️），不出現任何勸戒或責備文字
const { WORKOUTS, WORKOUT_KEYS } = require('./workouts');
const STRETCH_KEY = '伸展放鬆';

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

// 總覽卡片。summary 來自 db.getSummary()。
// opts：{ calTarget, waterGoal, title, dateLabel } — 標題與日期讓「查別天」也能共用這張卡。
function buildOverviewFlex(summary, opts = {}) {
  const { calTarget, waterGoal, title = '今日總覽', dateLabel } = opts;
  const { food, body, workout, water } = summary;
  const burn = workout ? workout.kcal : 0;
  const net = food.kcal - burn; // 淨熱量 = 吃進去 - 運動燒掉

  // 淨熱量：有目標就顯示「實際/目標」，超標補 ⚠️（純數字，不評論）
  let netText = `${fmt(net)} 大卡`;
  let netOver = false;
  if (calTarget) {
    netOver = net > calTarget;
    netText = `${fmt(net)}/${fmt(calTarget)}${netOver ? ' ⚠️' : ''}`;
  }

  // 喝水：有目標就顯示「實際/目標」，達標補 ✅
  const drank = water ? water.ml : 0;
  let waterText = `${fmt(drank)} ml`;
  if (waterGoal) {
    waterText = `${fmt(drank)}/${fmt(waterGoal)} ml${drank >= waterGoal ? ' ✅' : ''}`;
  }

  const workoutCount = workout ? workout.count : 0;
  const subtitle =
    (dateLabel ? `${dateLabel} · ` : '') + `已記 ${food.meals} 餐 · ${workoutCount} 次訓練`;

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
          { type: 'text', text: subtitle, size: 'xs', color: '#FFFFFFCC', wrap: true },
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
          row('喝水', waterText),
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

// 取消鍵：放在流程中的 Quick Reply 最後一顆，隨時中斷
const CANCEL_ITEM = {
  type: 'action',
  action: { type: 'message', label: '✖️ 取消', text: '取消' },
};
// 只有取消鍵的 Quick Reply：輸入金額/品項時附上
const cancelQuickReply = { items: [CANCEL_ITEM] };

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

// 今日課表卡：列出選定部位的動作與組×次
function buildWorkoutFlex(key, items) {
  const w = WORKOUTS[key];
  if (!w) return null;
  const list = items || w.items;

  const rows = list.map((it) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: it.name, size: 'sm', color: '#333333', flex: 5, wrap: true },
      {
        type: 'text',
        text: it.sr,
        size: 'sm',
        color: '#1F7A5A',
        align: 'end',
        flex: 3,
        weight: 'bold',
      },
    ],
  }));

  return {
    type: 'flex',
    altText: `今日課表：${w.title}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '今日課表', size: 'xs', color: '#FFFFFFCC' },
          { type: 'text', text: w.title, weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true },
        ],
        backgroundColor: '#1F7A5A',
        paddingAll: '16px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: rows,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '👇 點下面動作記錄重量　·　查進步：看 臥推',
            size: 'xxs',
            color: '#8C8C8C',
            wrap: true,
          },
        ],
        paddingAll: '12px',
      },
    },
  };
}

// 課表卡下面的動作按鈕：點某動作 → 開始記錄那個動作的重量。
// text 用「記:肌群:動作」帶著肌群，記完好再列同肌群的動作繼續記。
function buildLiftPicker(key, items) {
  const w = WORKOUTS[key];
  if (!w) return null;
  const list = items || w.items;
  // LINE quickReply 上限 13 顆：保留 4 顆給「新增動作/換一組/換部位/取消」，其餘給動作
  const actionBtns = list.slice(0, 13 - 4).map((it) => ({
    type: 'action',
    action: { type: 'message', label: it.name, text: `記:${key}:${it.name}` },
  }));
  return {
    items: [
      ...actionBtns,
      { type: 'action', action: { type: 'message', label: '➕ 新增動作', text: `新增動作:${key}` } },
      { type: 'action', action: { type: 'message', label: '🎲 換一組', text: `課表:${key}` } },
      { type: 'action', action: { type: 'message', label: '🔄 換部位', text: '今日課表' } },
      CANCEL_ITEM,
    ],
  };
}

// 伸展放鬆卡：列出抽中的伸展動作與停留呼吸數（不記重量）
function buildStretchFlex(items) {
  const rows = items.map((it) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: it.name, size: 'sm', color: '#333333', flex: 5, wrap: true },
      {
        type: 'text',
        text: it.hold,
        size: 'xs',
        color: '#7A5AA0',
        align: 'end',
        flex: 4,
        weight: 'bold',
        wrap: true,
      },
    ],
  }));

  return {
    type: 'flex',
    altText: '伸展放鬆',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '訓練後收操', size: 'xs', color: '#FFFFFFCC' },
          { type: 'text', text: '🧘 伸展放鬆', weight: 'bold', size: 'lg', color: '#FFFFFF' },
        ],
        backgroundColor: '#7A5AA0',
        paddingAll: '16px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: rows,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '慢慢伸展、自然深呼吸、不憋氣，痠緊處停留久一點',
            size: 'xxs',
            color: '#8C8C8C',
            wrap: true,
          },
        ],
        paddingAll: '12px',
      },
    },
  };
}

// 伸展卡下面的按鈕：換一組／回今日課表（伸展不需記錄，所以沒有動作記錄鈕）
const stretchQuickReply = {
  items: [
    { type: 'action', action: { type: 'message', label: '🎲 換一組', text: `課表:${STRETCH_KEY}` } },
    { type: 'action', action: { type: 'message', label: '🔄 回課表', text: '今日課表' } },
    CANCEL_ITEM,
  ],
};

// 今日課表：選部位按鈕（點「今日課表」後跳出），最後一顆是伸展放鬆
const workoutPickerQuickReply = {
  items: [
    ...WORKOUT_KEYS.map((key) => ({
      type: 'action',
      action: { type: 'message', label: key, text: `課表:${key}` },
    })),
    { type: 'action', action: { type: 'message', label: '🧘 伸展放鬆', text: `課表:${STRETCH_KEY}` } },
    CANCEL_ITEM,
  ],
};

// 記帳分類按鈕：點「記帳」後跳出，點一下分類就不用打字選類別
// 送出的文字用「分類:xxx」讓 handler 記住這位使用者接下來要記哪一類
const CATEGORY_BUTTONS = [
  ['🚌', '交通'], ['🏠', '居住'], ['🎬', '娛樂'], ['🛍️', '購物'],
  ['💊', '醫療'], ['📚', '學習'], ['🎁', '人情'], ['📦', '其他'],
];
const categoryQuickReply = {
  items: [
    ...CATEGORY_BUTTONS.map(([icon, name]) => ({
      type: 'action',
      action: { type: 'message', label: `${icon} ${name}`, text: `分類:${name}` },
    })),
    CANCEL_ITEM,
  ],
};

// 記一餐分餐別按鈕：點「記一餐」後跳出，點一下餐別就不用打字
// 送出的文字用「餐別:xxx」讓 handler 記住這餐是哪一餐
const MEAL_BUTTONS = [
  ['🌅', '早餐'], ['🍜', '午餐'], ['🌙', '晚餐'], ['🌃', '宵夜'], ['🍪', '點心'],
];
const mealPickerQuickReply = {
  items: [
    ...MEAL_BUTTONS.map(([icon, name]) => ({
      type: 'action',
      action: { type: 'message', label: `${icon} ${name}`, text: `餐別:${name}` },
    })),
    CANCEL_ITEM,
  ],
};

// 查花費快捷鈕：附在統計卡下面，點一下切換今日／本週／本月
const spendingQuickReply = {
  items: [
    { type: 'action', action: { type: 'message', label: '📅 今日', text: '今日花費' } },
    { type: 'action', action: { type: 'message', label: '🗓️ 本週', text: '本週花費' } },
    { type: 'action', action: { type: 'message', label: '📆 本月', text: '本月花費' } },
  ],
};

// 喝水快捷鈕：點「喝水」後跳出，點一下就記一杯的量（送出「喝水 500」讓 parser 記帳）
const WATER_BUTTONS = [
  ['🥛', 200], ['🥤', 350], ['🍶', 500], ['🍾', 700],
];
const waterPickerQuickReply = {
  items: [
    ...WATER_BUTTONS.map(([icon, ml]) => ({
      type: 'action',
      action: { type: 'message', label: `${icon} ${ml}`, text: `喝水 ${ml}` },
    })),
    { type: 'action', action: { type: 'message', label: '📊 總覽', text: '總覽' } },
    CANCEL_ITEM,
  ],
};

// 提醒設定快捷鈕：點「提醒」後跳出，選常用時段（送「設定提醒 HH:MM」）或關閉
const REMINDER_PRESETS = [
  ['🍜 午餐後', '13:00'], ['🌆 晚餐後', '20:00'], ['🌙 睡前', '22:00'],
];
const reminderQuickReply = {
  items: [
    ...REMINDER_PRESETS.map(([label, hm]) => ({
      type: 'action',
      action: { type: 'message', label, text: `設定提醒 ${hm}` },
    })),
    { type: 'action', action: { type: 'message', label: '📋 我的提醒', text: '我的提醒' } },
    { type: 'action', action: { type: 'message', label: '🔕 全部關閉', text: '關閉提醒' } },
    CANCEL_ITEM,
  ],
};

module.exports = {
  buildOverviewFlex,
  buildSpendingFlex,
  buildWorkoutFlex,
  buildLiftPicker,
  buildStretchFlex,
  stretchQuickReply,
  mealQuickReply,
  categoryQuickReply,
  mealPickerQuickReply,
  spendingQuickReply,
  workoutPickerQuickReply,
  waterPickerQuickReply,
  reminderQuickReply,
  cancelQuickReply,
  fmt,
};
