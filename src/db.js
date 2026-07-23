// 資料庫：連到雲端 libSQL（Turso），建好資料表，並提供寫入/查詢的小工具。
// 為什麼用雲端：Render 免費方案重啟會清空本機檔案，資料會不見；
// 改存到 Turso 雲端後，重啟或改版都不會清空，資料永久保存。
//
// 連線方式（看環境變數決定）：
//   ・有設 TURSO_DATABASE_URL → 連雲端 Turso（正式上線用）
//   ・沒設 → 退回本機檔案 data/gymeats.db（本機測試用，不需要網路/帳號）
// 兩種情況程式碼一模一樣，差別只在連到哪裡。
const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

// 決定要連雲端還是本機檔案
const tursoUrl = process.env.TURSO_DATABASE_URL;
let client;
if (tursoUrl) {
  client = createClient({
    url: tursoUrl,
    authToken: process.env.TURSO_AUTH_TOKEN, // 雲端資料庫的通行證
    intMode: 'number',
  });
} else {
  // 本機檔案：放在專案的 data/ 資料夾，第一次跑會自動建立
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  client = createClient({ url: `file:${path.join(dataDir, 'gymeats.db')}`, intMode: 'number' });
}
// 開機時清楚印出用哪種資料庫，避免上線時忘了設 Turso、卻悄悄退回會被清空的本機檔案
console.log(
  tursoUrl
    ? '🗄️  資料庫：雲端 Turso（重啟不會清空）✅'
    : '🗄️  資料庫：本機檔案 data/gymeats.db（測試用；上線請設 TURSO_DATABASE_URL）⚠️'
);

const DAY_MS = 24 * 60 * 60 * 1000;
// 台灣時間比 UTC 快 8 小時、且不換日光節約時間。雲端 Turso 的伺服器用 UTC，
// 所以在 SQL 裡算「哪一天」時，一律加 8 小時換成台灣時間，本機/雲端結果才會一致。
const TW_SHIFT = "'+8 hours'";

// ---- 小工具：把 libSQL 的查詢包成好用的三個函式 ----
// get：拿第一列（沒有回 null）；all：拿全部列；run：執行寫入，回結果（含 rowsAffected）
async function get(sql, args) {
  const r = await client.execute(args !== undefined ? { sql, args } : sql);
  return r.rows[0] || null;
}
async function all(sql, args) {
  const r = await client.execute(args !== undefined ? { sql, args } : sql);
  return r.rows;
}
async function run(sql, args) {
  return client.execute(args !== undefined ? { sql, args } : sql);
}

// ---- 建立資料表（IF NOT EXISTS：已存在就不重建，資料不會不見）----
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    line_uid   TEXT UNIQUE NOT NULL,
    goal_mode  TEXT DEFAULT 'maintain',
    cal_target INTEGER
  );

  CREATE TABLE IF NOT EXISTS food_logs (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user    INTEGER NOT NULL,
    ts      INTEGER NOT NULL,
    name    TEXT NOT NULL,
    kcal    REAL,
    protein REAL,
    carb    REAL,
    fat     REAL,
    price   REAL
  );

  CREATE TABLE IF NOT EXISTS body_logs (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user    INTEGER NOT NULL,
    ts      INTEGER NOT NULL,
    weight  REAL NOT NULL,
    bodyfat REAL
  );

  CREATE TABLE IF NOT EXISTS workout_logs (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user     INTEGER NOT NULL,
    ts       INTEGER NOT NULL,
    name     TEXT,
    sets     INTEGER,
    reps     INTEGER,
    weight   REAL,
    duration INTEGER,
    kcal     REAL
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user     INTEGER NOT NULL,
    ts       INTEGER NOT NULL,
    category TEXT NOT NULL,
    name     TEXT,
    amount   REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS custom_exercises (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    user  INTEGER NOT NULL,
    grp   TEXT NOT NULL,
    name  TEXT NOT NULL,
    UNIQUE(user, grp, name)
  );

  CREATE TABLE IF NOT EXISTS water_logs (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    user  INTEGER NOT NULL,
    ts    INTEGER NOT NULL,
    ml    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user    INTEGER NOT NULL,
    hour    INTEGER NOT NULL,
    minute  INTEGER NOT NULL,
    label   TEXT,
    enabled INTEGER DEFAULT 1,
    UNIQUE(user, hour, minute)
  );
`;

// 舊資料庫可能缺的欄位，開機時試著補上（已存在會出錯，用 catch 忽略）
const MIGRATIONS = [
  'ALTER TABLE workout_logs ADD COLUMN kcal REAL',
  'ALTER TABLE users ADD COLUMN sex TEXT',
  'ALTER TABLE users ADD COLUMN age INTEGER',
  'ALTER TABLE users ADD COLUMN height REAL',
  'ALTER TABLE users ADD COLUMN pweight REAL',
  'ALTER TABLE users ADD COLUMN bodyfat REAL',
  'ALTER TABLE users ADD COLUMN activity TEXT',
  'ALTER TABLE users ADD COLUMN protein_target INTEGER',
];

// 開機時呼叫一次：建表 + 補欄位。index.js 會在開始服務前 await 這個。
async function initDb() {
  await client.executeMultiple(SCHEMA);
  for (const sql of MIGRATIONS) {
    try {
      await client.execute(sql);
    } catch (e) {
      /* 欄位已存在，略過 */
    }
  }
}

// ---- 使用者：用 LINE 的 userId 找人，沒有就建一個，回傳我們自己的那一列 ----
async function getOrCreateUser(lineUid) {
  let row = await get('SELECT * FROM users WHERE line_uid = ?', [lineUid]);
  if (!row) {
    const info = await run('INSERT INTO users (line_uid) VALUES (?)', [lineUid]);
    row = await get('SELECT * FROM users WHERE id = ?', [Number(info.lastInsertRowid)]);
  }
  return row;
}

// ---- 寫入一餐 ----
async function insertFood({ userId, name, kcal, protein, carb, fat, price }) {
  return run(
    `INSERT INTO food_logs (user, ts, name, kcal, protein, carb, fat, price)
     VALUES (@user, @ts, @name, @kcal, @protein, @carb, @fat, @price)`,
    {
      user: userId,
      ts: Date.now(),
      name,
      kcal: kcal ?? null,
      protein: protein ?? null,
      carb: carb ?? null,
      fat: fat ?? null,
      price: price ?? null,
    }
  );
}

// ---- 寫入一筆體重 ----
async function insertBody({ userId, weight, bodyfat }) {
  return run(
    `INSERT INTO body_logs (user, ts, weight, bodyfat)
     VALUES (@user, @ts, @weight, @bodyfat)`,
    { user: userId, ts: Date.now(), weight, bodyfat: bodyfat ?? null }
  );
}

// ---- 寫入一筆訓練（含消耗熱量）----
async function insertWorkout({ userId, name, duration, kcal }) {
  return run(
    `INSERT INTO workout_logs (user, ts, name, duration, kcal)
     VALUES (@user, @ts, @name, @duration, @kcal)`,
    { user: userId, ts: Date.now(), name, duration: duration ?? null, kcal: kcal ?? null }
  );
}

// ---- Apple 活動能量：每天只留一筆，重覆傳入就覆蓋（避免整天累加）----
const APPLE_ENERGY_NAME = 'Apple 活動能量';
async function upsertAppleEnergy({ userId, kcal }) {
  const start = todayStartMs();
  await run('DELETE FROM workout_logs WHERE user = ? AND name = ? AND ts >= ?', [
    userId,
    APPLE_ENERGY_NAME,
    start,
  ]);
  await run('INSERT INTO workout_logs (user, ts, name, kcal) VALUES (?, ?, ?, ?)', [
    userId,
    Date.now(),
    APPLE_ENERGY_NAME,
    kcal,
  ]);
}

// ---- 設定使用者每日熱量目標 ----
async function setUserTarget(userId, target) {
  await run('UPDATE users SET cal_target = ? WHERE id = ?', [target, userId]);
}

// ---- 儲存個人化資料＋算好的目標（設定資料問卷完成時呼叫）----
async function saveProfile(userId, p) {
  await run(
    `UPDATE users SET
       sex = @sex, age = @age, height = @height, pweight = @pweight,
       bodyfat = @bodyfat, activity = @activity, goal_mode = @goal,
       cal_target = @calTarget, protein_target = @protein
     WHERE id = @id`,
    {
      id: userId,
      sex: p.sex,
      age: p.age,
      height: p.height,
      pweight: p.weight,
      bodyfat: p.bodyfat ?? null,
      activity: p.activity,
      goal: p.goal,
      calTarget: p.calTarget,
      protein: p.protein,
    }
  );
}

// ---- 重訓紀錄：寫入一組（動作＋重量＋次數）----
async function insertLift({ userId, name, weight, reps, kcal }) {
  return run(
    `INSERT INTO workout_logs (user, ts, name, weight, reps, kcal)
     VALUES (@user, @ts, @name, @weight, @reps, @kcal)`,
    { user: userId, ts: Date.now(), name, weight, reps, kcal: kcal ?? null }
  );
}

// ---- 某動作目前最大重量（用來判斷是不是破紀錄）----
async function getLiftMax(userId, name) {
  const row = await get(
    `SELECT MAX(weight) AS m FROM workout_logs
     WHERE user = ? AND name = ? AND weight IS NOT NULL`,
    [userId, name]
  );
  return row && row.m != null ? row.m : null;
}

// ---- 某動作的進步：每天最大重量，最近幾天（由舊到新）----
async function getLiftProgress(userId, name, limit = 8) {
  const rows = await all(
    `SELECT date(ts / 1000, 'unixepoch', ${TW_SHIFT}) AS day,
            MAX(weight) AS topWeight
     FROM workout_logs
     WHERE user = ? AND name = ? AND weight IS NOT NULL
     GROUP BY day
     ORDER BY day DESC
     LIMIT ?`,
    [userId, name, limit]
  );
  return rows.reverse(); // 由舊到新，方便看趨勢
}

// ---- 寫入一筆支出（通用記帳）----
async function insertExpense({ userId, category, name, amount }) {
  return run(
    `INSERT INTO expenses (user, ts, category, name, amount)
     VALUES (@user, @ts, @category, @name, @amount)`,
    { user: userId, ts: Date.now(), category, name: name || null, amount }
  );
}

// ---- 自訂動作：加一個到某肌群（重複會被忽略），回傳是否真的新增 ----
async function addCustomExercise({ userId, group, name }) {
  const info = await run(
    'INSERT OR IGNORE INTO custom_exercises (user, grp, name) VALUES (?, ?, ?)',
    [userId, group, name]
  );
  return info.rowsAffected > 0;
}

// ---- 自訂動作：拿某使用者某肌群的自訂動作名稱清單 ----
async function getCustomExercises(userId, group) {
  const rows = await all(
    'SELECT name FROM custom_exercises WHERE user = ? AND grp = ? ORDER BY id',
    [userId, group]
  );
  return rows.map((r) => r.name);
}

// ---- 自訂動作：刪掉某使用者某肌群的一個自訂動作，回傳是否刪到 ----
async function removeCustomExercise({ userId, group, name }) {
  const info = await run(
    'DELETE FROM custom_exercises WHERE user = ? AND grp = ? AND name = ?',
    [userId, group, name]
  );
  return info.rowsAffected > 0;
}

// ---- 刪除一位使用者的所有資料，回傳刪除的「記錄」筆數 ----
// 連帳號本身(users)一起刪，真正清空、識別碼不殘留。下次傳訊會重建成全新帳號。
async function deleteAllUserData(userId) {
  const tables = [
    'food_logs', 'body_logs', 'workout_logs', 'expenses',
    'custom_exercises', 'water_logs', 'reminders',
  ];
  const tx = await client.transaction('write');
  try {
    let n = 0;
    for (const t of tables) {
      const r = await tx.execute({ sql: `DELETE FROM ${t} WHERE user = ?`, args: [userId] });
      n += r.rowsAffected;
    }
    await tx.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [userId] });
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---- 算「今天」的區間（當地時間 00:00 到現在）----
function todayStartMs() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

// ---- 算「本週」起點（當地時間週一 00:00）----
function weekStartMs() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const day = now.getDay(); // 0=週日, 1=週一 ...
  const diff = day === 0 ? 6 : day - 1; // 讓週一當一週開始
  now.setDate(now.getDate() - diff);
  return now.getTime();
}

// ---- 算「本月」起點（當地時間 1 號 00:00）----
function monthStartMs() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

// ---- 某段期間的花費：飲食(來自 food_logs.price) + 各類支出，合併並依金額排序 ----
async function getSpending(userId, startMs) {
  const food = await get(
    `SELECT COALESCE(SUM(price), 0) AS amount
     FROM food_logs WHERE user = ? AND ts >= ? AND price IS NOT NULL`,
    [userId, startMs]
  );

  const rows = await all(
    `SELECT category, SUM(amount) AS amount
     FROM expenses WHERE user = ? AND ts >= ?
     GROUP BY category`,
    [userId, startMs]
  );

  const cats = [];
  if (food.amount > 0) cats.push({ category: '飲食', amount: food.amount });
  for (const r of rows) cats.push({ category: r.category, amount: r.amount });
  cats.sort((a, b) => b.amount - a.amount);

  const total = cats.reduce((s, c) => s + c.amount, 0);
  return { total, cats };
}

// ---- 某一天的總覽：把該天的餐加總、喝水加總，抓當天(含以前)最新一筆體重 ----
// startMs=當天00:00，endMs=隔天00:00。查今天就用 getTodaySummary。
async function getSummary(userId, startMs, endMs) {
  const food = await get(
    `SELECT
       COALESCE(SUM(kcal), 0)    AS kcal,
       COALESCE(SUM(protein), 0) AS protein,
       COALESCE(SUM(carb), 0)    AS carb,
       COALESCE(SUM(fat), 0)     AS fat,
       COALESCE(SUM(price), 0)   AS price,
       COUNT(*)                  AS meals
     FROM food_logs WHERE user = ? AND ts >= ? AND ts < ?`,
    [userId, startMs, endMs]
  );

  // 體重抓「那天結束前」最新一筆（過去某天沒量，就沿用當時最近的一次）
  const body = await get(
    `SELECT weight, bodyfat FROM body_logs
     WHERE user = ? AND ts < ? ORDER BY ts DESC LIMIT 1`,
    [userId, endMs]
  );

  const workout = await get(
    `SELECT COALESCE(SUM(kcal), 0) AS kcal, COUNT(*) AS count
     FROM workout_logs WHERE user = ? AND ts >= ? AND ts < ?`,
    [userId, startMs, endMs]
  );

  const water = await get(
    `SELECT COALESCE(SUM(ml), 0) AS ml
     FROM water_logs WHERE user = ? AND ts >= ? AND ts < ?`,
    [userId, startMs, endMs]
  );

  return { food, body: body || null, workout, water };
}

// ---- 今日總覽（getSummary 的今天版）----
async function getTodaySummary(userId) {
  const start = todayStartMs();
  return getSummary(userId, start, start + DAY_MS);
}

// ---- 喝水：寫入一筆 ----
async function insertWater({ userId, ml }) {
  return run('INSERT INTO water_logs (user, ts, ml) VALUES (?, ?, ?)', [userId, Date.now(), ml]);
}

// ---- 提醒：新增/更新一個時段（同時段已存在就重新開啟並更新小標）----
async function setReminder({ userId, hour, minute, label }) {
  await run(
    `INSERT INTO reminders (user, hour, minute, label, enabled)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(user, hour, minute)
     DO UPDATE SET enabled = 1, label = excluded.label`,
    [userId, hour, minute, label || null]
  );
}

// ---- 提醒：拿某人目前開啟中的所有時段 ----
async function getReminders(userId) {
  return all(
    `SELECT hour, minute, label FROM reminders
     WHERE user = ? AND enabled = 1 ORDER BY hour, minute`,
    [userId]
  );
}

// ---- 提醒：關閉某人全部提醒 ----
async function disableAllReminders(userId) {
  const r = await run('UPDATE reminders SET enabled = 0 WHERE user = ?', [userId]);
  return r.rowsAffected;
}

// ---- 提醒：某個時、分「該不該發」→ 回傳所有到點的人（含 LINE 識別碼與小標）----
async function getDueReminders(hour, minute) {
  return all(
    `SELECT u.line_uid AS lineUid, r.label AS label
     FROM reminders r JOIN users u ON u.id = r.user
     WHERE r.enabled = 1 AND r.hour = ? AND r.minute = ?`,
    [hour, minute]
  );
}

module.exports = {
  client,
  initDb,
  getOrCreateUser,
  insertFood,
  insertBody,
  insertWorkout,
  upsertAppleEnergy,
  setUserTarget,
  saveProfile,
  getTodaySummary,
  getSummary,
  insertWater,
  setReminder,
  getReminders,
  disableAllReminders,
  getDueReminders,
  insertExpense,
  getSpending,
  insertLift,
  getLiftMax,
  getLiftProgress,
  addCustomExercise,
  getCustomExercises,
  removeCustomExercise,
  deleteAllUserData,
  todayStartMs,
  weekStartMs,
  monthStartMs,
};
