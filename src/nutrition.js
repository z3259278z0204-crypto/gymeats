// 個人化熱量計算：由性別/年齡/身高/體重/體脂/活動量/目標算出每日建議熱量與蛋白質。
// BMR：一般用 Mifflin-St Jeor；有填體脂改用 Katch-McArdle（更準）。
// TDEE = BMR × 活動係數；再依目標加減得每日目標熱量。

// 活動量係數
const ACTIVITY_FACTOR = {
  久坐: 1.2, // 幾乎不運動
  輕度: 1.375, // 每週運動 1-3 天
  中度: 1.55, // 每週運動 3-5 天
  高度: 1.725, // 每週運動 6-7 天／體力工作
};

// 目標對每日熱量的加減（大卡）
const GOAL_ADJUST = { 增肌: 300, 減脂: -400, 維持: 0 };

// 目標對每公斤體重的蛋白質建議（克）
const GOAL_PROTEIN = { 增肌: 1.8, 減脂: 2.0, 維持: 1.6 };

// Mifflin-St Jeor
function mifflin(sex, kg, cm, age) {
  const base = 10 * kg + 6.25 * cm - 5 * age;
  return sex === '女' ? base - 161 : base + 5;
}

// Katch-McArdle（需要體脂率）
function katch(kg, bodyfat) {
  const lbm = kg * (1 - bodyfat / 100); // 去脂體重
  return 370 + 21.6 * lbm;
}

// 由個人資料算出計畫。回傳 { bmr, tdee, calTarget, protein }（皆為整數）
function computePlan({ sex, age, height, weight, bodyfat, activity, goal }) {
  const bmr =
    bodyfat != null && bodyfat > 0
      ? katch(weight, bodyfat)
      : mifflin(sex, weight, height, age);
  const factor = ACTIVITY_FACTOR[activity] || 1.55;
  const tdee = bmr * factor;
  const calTarget = Math.round((tdee + (GOAL_ADJUST[goal] || 0)) / 10) * 10; // 取整十
  const protein = Math.round(weight * (GOAL_PROTEIN[goal] || 1.6));
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calTarget,
    protein,
  };
}

module.exports = { computePlan, ACTIVITY_FACTOR, GOAL_ADJUST, GOAL_PROTEIN };
