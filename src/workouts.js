// 依肌群分類的課表（增肌微減脂）。點「今日課表」選肌群→出清單→點動作記重量。
// 每個動作 = { name 動作名, sr 組×次 }。手臂拆進胸日(三頭)、背日(二頭)。
const WORKOUTS = {
  胸: {
    title: '胸（含三頭）',
    items: [
      { name: '槓鈴臥推', sr: '4×6-8' },
      { name: '上斜槓鈴臥推', sr: '4×6-8' },
      { name: '上斜啞鈴臥推', sr: '3×8-12' },
      { name: '平板啞鈴臥推', sr: '3×8-12' },
      { name: '器械推胸', sr: '3×10-12' },
      { name: '蝴蝶機夾胸', sr: '3×12-15' },
      { name: '纜繩夾胸', sr: '3×12-15' },
      { name: '雙槓臂屈伸', sr: '3×10-12' },
      { name: '伏地挺身', sr: '3×力竭' },
      { name: '三頭下壓', sr: '3×12-15' },
      { name: '過頭三頭伸展', sr: '3×12-15' },
    ],
  },
  背: {
    title: '背（含二頭）',
    items: [
      { name: '引體向上/滑輪下拉', sr: '4×8-10' },
      { name: '夾臀引體向上', sr: '3×8-10' },
      { name: '窄握下拉', sr: '3×10-12' },
      { name: '槓鈴硬舉', sr: '4×5' },
      { name: '槓鈴划船', sr: '4×8-10' },
      { name: 'T槓划船', sr: '3×8-10' },
      { name: '坐姿纜繩划船', sr: '3×10-12' },
      { name: '高跪姿繩索划船', sr: '3×10-12' },
      { name: '單臂啞鈴划船', sr: '3×10-12' },
      { name: '器械划船', sr: '3×10-12' },
      { name: '直臂下拉', sr: '3×15' },
      { name: '二頭彎舉', sr: '3×12-15' },
      { name: '錘式彎舉', sr: '3×12-15' },
      { name: '牧師彎舉', sr: '3×12-15' },
    ],
  },
  肩膀: {
    title: '肩膀',
    items: [
      { name: '坐姿肩推', sr: '4×6-10' },
      { name: '站姿肩推', sr: '4×6-8' },
      { name: '器械肩推', sr: '3×10-12' },
      { name: '阿諾推舉', sr: '3×10-12' },
      { name: '側平舉', sr: '4×12-15' },
      { name: '纜繩側平舉', sr: '3×15' },
      { name: '前平舉', sr: '3×12-15' },
      { name: '直立划船', sr: '3×12-15' },
      { name: '反向飛鳥', sr: '3×15' },
      { name: '纜繩面拉', sr: '3×15' },
      { name: '聳肩', sr: '3×12-15' },
    ],
  },

  腿: {
    title: '腿',
    items: [
      { name: '槓鈴深蹲', sr: '4×6-8' },
      { name: '前蹲舉', sr: '3×8-10' },
      { name: '羅馬尼亞硬舉', sr: '3×8-10' },
      { name: '腿推', sr: '3×10-12' },
      { name: '哈克深蹲', sr: '3×10-12' },
      { name: '臀推', sr: '3×10-12' },
      { name: '腿伸展', sr: '3×12-15' },
      { name: '腿彎舉', sr: '3×12-15' },
      { name: '保加利亞分腿蹲', sr: '3×10（每腿）' },
      { name: '站姿提踵', sr: '4×15' },
      { name: '坐姿提踵', sr: '3×15-20' },
    ],
  },
};

// 選單顯示順序
const WORKOUT_KEYS = ['胸', '背', '肩膀', '腿'];

// 每個肌群前 N 個動作視為「複合大動作」（主課），其餘為孤立動作。
const COMPOUND_COUNT = 3;
// 回傳某肌群的複合動作名稱集合（用來判斷組數次數要用哪一套）
function compoundNames(key) {
  const w = WORKOUTS[key];
  return new Set(w ? w.items.slice(0, COMPOUND_COUNT).map((it) => it.name) : []);
}

// 各肌群的熱身（動態伸展＋輕重量暖身組），課表最上面自動帶入
const WARMUPS = {
  胸: ['肩繞環 前後各 15 下', '伏地挺身（慢） 10 下', '空槓／輕重量臥推 15 下'],
  背: ['貓牛式 10 下', '彈力帶下拉 15 下', '輕重量划船 15 下'],
  肩膀: ['肩繞環 前後各 15 下', '彈力帶肩外旋 15 下', '輕重量側平舉 15 下'],
  腿: ['髖繞環 每邊 10 下', '徒手深蹲 15 下', '空槓深蹲 10 下'],
};
function warmupFor(key) {
  return WARMUPS[key] || ['原地慢跑 2 分鐘', '目標肌群動態伸展 10 下', '主課輕重量暖身組 15 下'];
}

// 依目標決定組×次、休息、有氧建議
const GOAL_SCHEME = {
  增肌: {
    compound: '4×6-10',
    iso: '3×10-15',
    rest: '複合休 90-120 秒／孤立 60 秒',
    cardio: '有氧少量：每週 1-2 次、15-20 分',
  },
  減脂: {
    compound: '3×10-12',
    iso: '3×12-15',
    rest: '休息短：45-60 秒、節奏快',
    cardio: '有氧多些：每週 3 次、20-30 分',
  },
  維持: {
    compound: '3×8-10',
    iso: '3×10-12',
    rest: '休息 60-90 秒',
    cardio: '有氧：每週 2 次、15-20 分',
  },
};
// 某目標下，複合/孤立動作的組×次字串；goal 為空回 null（沿用動作預設）
function schemeFor(goal, isCompound) {
  const s = GOAL_SCHEME[goal];
  if (!s) return null;
  return isCompound ? s.compound : s.iso;
}

// Fisher-Yates 洗牌（不改原陣列）
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 從某肌群隨機抽「當天要練的」5-6 個動作，每次不同。
// 保證含 1 個複合大動作當主課（各肌群前 3 個視為複合），
// 其餘隨機補齊，最後依原始強度順序（複合在前）排回。
function pickWorkout(key) {
  const w = WORKOUTS[key];
  if (!w) return null;
  const all = w.items;
  const count = Math.min(Math.random() < 0.5 ? 5 : 6, all.length);
  const compoundPool = all.slice(0, 3); // 複合主項
  const main = compoundPool[Math.floor(Math.random() * compoundPool.length)];
  const remaining = shuffle(all.filter((it) => it !== main));
  const chosen = new Set([main, ...remaining.slice(0, count - 1)]);
  return all.filter((it) => chosen.has(it)); // 依原順序（強度）排回
}

// 伸展放鬆（訓練後收操）。資料整理自健身工廠「9招椅子瑜珈」伸展放鬆文。
// 只顯示動作與停留呼吸數，不記重量。
const STRETCHES = [
  { name: '椅子下犬式', hold: '5-10 個呼吸' },
  { name: '坐姿貓式', hold: '3-5 個呼吸' },
  { name: '坐姿牛式', hold: '3-5 個呼吸' },
  { name: '坐姿簡易扭轉式', hold: '左右各 5-10 個呼吸' },
  { name: '坐姿前彎式', hold: '5-10 個呼吸' },
  { name: '提腿伸展', hold: '左右各 5-10 個呼吸' },
  { name: '肩膀伸展', hold: '左右各 5-10 個呼吸' },
  { name: '坐姿鴿式', hold: '左右各 5-10 個呼吸' },
  { name: '椅子老鷹式', hold: '左右各 5-10 個呼吸' },
];

// 隨機抽 5-6 個伸展動作，依原順序（頸背→軀幹→下肢）排回
function pickStretch() {
  const count = Math.min(Math.random() < 0.5 ? 5 : 6, STRETCHES.length);
  const chosen = new Set(shuffle(STRETCHES).slice(0, count));
  return STRETCHES.filter((s) => chosen.has(s));
}

module.exports = {
  WORKOUTS,
  WORKOUT_KEYS,
  pickWorkout,
  STRETCHES,
  pickStretch,
  compoundNames,
  warmupFor,
  schemeFor,
  GOAL_SCHEME,
};
