// 資料庫：開啟 SQLite 檔、建好資料表，並提供寫入/查詢的小工具
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// 把資料庫檔放在專案的 data/ 資料夾，第一次跑會自動建立
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'gymeats.db'));
db.pragma('journal_mode = WAL'); // 讀寫更順的模式

// ---- 建立資料表（IF NOT EXISTS：已存在就不重建，資料不會不見）----
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    line_uid   TEXT UNIQUE NOT NULL,
    goal_mode  TEXT DEFAULT 'maintain',  -- 目標模式：減脂/維持/增肌，先預設維持
    cal_target INTEGER                    -- 每日熱量目標，可空
  );

  CREATE TABLE IF NOT EXISTS food_logs (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user    INTEGER NOT NULL,             -- 對應 users.id
    ts      INTEGER NOT NULL,             -- 記錄時間（毫秒）
    name    TEXT NOT NULL,                -- 品項，例：雞胸便當
    kcal    REAL,                         -- 熱量估算
    protein REAL,                         -- 蛋白質(克)
    carb    REAL,                         -- 碳水(克)
    fat     REAL,                         -- 脂肪(克)
    price   REAL,                         -- 花費，可空
    FOREIGN KEY (user) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS body_logs (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user    INTEGER NOT NULL,
    ts      INTEGER NOT NULL,
    weight  REAL NOT NULL,                -- 體重(公斤)
    bodyfat REAL,                         -- 體脂率(%)，可空
    FOREIGN KEY (user) REFERENCES users(id)
  );

  -- 訓練紀錄：MVP 先不做，但結構先預留，日後直接用
  CREATE TABLE IF NOT EXISTS workout_logs (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user     INTEGER NOT NULL,
    ts       INTEGER NOT NULL,
    name     TEXT,                        -- 動作/課表名稱
    sets     INTEGER,                     -- 組數
    reps     INTEGER,                     -- 次數
    weight   REAL,                        -- 重量
    duration INTEGER,                     -- 時長(分鐘)
    kcal     REAL,                        -- 消耗熱量估算
    FOREIGN KEY (user) REFERENCES users(id)
  );

  -- 通用記帳：飲食以外的任何支出（房租、交通、娛樂…）
  CREATE TABLE IF NOT EXISTS expenses (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user     INTEGER NOT NULL,
    ts       INTEGER NOT NULL,
    category TEXT NOT NULL,               -- 分類，例：交通/居住/娛樂
    name     TEXT,                        -- 品項說明，可空
    amount   REAL NOT NULL,               -- 金額
    FOREIGN KEY (user) REFERENCES users(id)
  );

  -- 使用者自訂動作：加進某肌群課表的個人動作（課表沒列、但自己會做的）
  CREATE TABLE IF NOT EXISTS custom_exercises (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    user  INTEGER NOT NULL,
    grp   TEXT NOT NULL,                  -- 肌群：胸/背/肩膀/腿
    name  TEXT NOT NULL,                  -- 動作名稱
    UNIQUE(user, grp, name),
    FOREIGN KEY (user) REFERENCES users(id)
  );
`);

// 舊資料庫若沒有 kcal 欄位，補上（新資料庫已含，這裡會被 catch 忽略）
try {
  db.exec('ALTER TABLE workout_logs ADD COLUMN kcal REAL');
} catch (e) {
  /* 欄位已存在，略過 */
}

// ---- 使用者：用 LINE 的 userId 找人，沒有就建一個，回傳我們自己的 id ----
function getOrCreateUser(lineUid) {
  let row = db.prepare('SELECT * FROM users WHERE line_uid = ?').get(lineUid);
  if (!row) {
    const info = db.prepare('INSERT INTO users (line_uid) VALUES (?)').run(lineUid);
    row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }
  return row;
}

// ---- 寫入一餐 ----
function insertFood({ userId, name, kcal, protein, carb, fat, price }) {
  return db
    .prepare(
      `INSERT INTO food_logs (user, ts, name, kcal, protein, carb, fat, price)
       VALUES (@user, @ts, @name, @kcal, @protein, @carb, @fat, @price)`
    )
    .run({
      user: userId,
      ts: Date.now(),
      name,
      kcal: kcal ?? null,
      protein: protein ?? null,
      carb: carb ?? null,
      fat: fat ?? null,
      price: price ?? null,
    });
}

// ---- 寫入一筆體重 ----
function insertBody({ userId, weight, bodyfat }) {
  return db
    .prepare(
      `INSERT INTO body_logs (user, ts, weight, bodyfat)
       VALUES (@user, @ts, @weight, @bodyfat)`
    )
    .run({ user: userId, ts: Date.now(), weight, bodyfat: bodyfat ?? null });
}

// ---- 寫入一筆訓練（含消耗熱量）----
function insertWorkout({ userId, name, duration, kcal }) {
  return db
    .prepare(
      `INSERT INTO workout_logs (user, ts, name, duration, kcal)
       VALUES (@user, @ts, @name, @duration, @kcal)`
    )
    .run({
      user: userId,
      ts: Date.now(),
      name,
      duration: duration ?? null,
      kcal: kcal ?? null,
    });
}

// ---- 設定使用者每日熱量目標 ----
function setUserTarget(userId, target) {
  db.prepare('UPDATE users SET cal_target = ? WHERE id = ?').run(target, userId);
}

// ---- 重訓紀錄：寫入一組（動作＋重量＋次數）----
function insertLift({ userId, name, weight, reps }) {
  return db
    .prepare(
      `INSERT INTO workout_logs (user, ts, name, weight, reps)
       VALUES (@user, @ts, @name, @weight, @reps)`
    )
    .run({ user: userId, ts: Date.now(), name, weight, reps });
}

// ---- 某動作目前最大重量（用來判斷是不是破紀錄）----
function getLiftMax(userId, name) {
  const row = db
    .prepare(
      `SELECT MAX(weight) AS m FROM workout_logs
       WHERE user = ? AND name = ? AND weight IS NOT NULL`
    )
    .get(userId, name);
  return row && row.m != null ? row.m : null;
}

// ---- 某動作的進步：每天最大重量，最近幾天（由舊到新）----
function getLiftProgress(userId, name, limit = 8) {
  const rows = db
    .prepare(
      `SELECT date(ts / 1000, 'unixepoch', 'localtime') AS day,
              MAX(weight) AS topWeight
       FROM workout_logs
       WHERE user = ? AND name = ? AND weight IS NOT NULL
       GROUP BY day
       ORDER BY day DESC
       LIMIT ?`
    )
    .all(userId, name, limit);
  return rows.reverse(); // 由舊到新，方便看趨勢
}

// ---- 寫入一筆支出（通用記帳）----
function insertExpense({ userId, category, name, amount }) {
  return db
    .prepare(
      `INSERT INTO expenses (user, ts, category, name, amount)
       VALUES (@user, @ts, @category, @name, @amount)`
    )
    .run({
      user: userId,
      ts: Date.now(),
      category,
      name: name || null,
      amount,
    });
}

// ---- 自訂動作：加一個到某肌群（重複會被忽略），回傳是否真的新增 ----
function addCustomExercise({ userId, group, name }) {
  const info = db
    .prepare('INSERT OR IGNORE INTO custom_exercises (user, grp, name) VALUES (?, ?, ?)')
    .run(userId, group, name);
  return info.changes > 0;
}

// ---- 自訂動作：拿某使用者某肌群的自訂動作名稱清單 ----
function getCustomExercises(userId, group) {
  return db
    .prepare('SELECT name FROM custom_exercises WHERE user = ? AND grp = ? ORDER BY id')
    .all(userId, group)
    .map((r) => r.name);
}

// ---- 自訂動作：刪掉某使用者某肌群的一個自訂動作，回傳是否刪到 ----
function removeCustomExercise({ userId, group, name }) {
  const info = db
    .prepare('DELETE FROM custom_exercises WHERE user = ? AND grp = ? AND name = ?')
    .run(userId, group, name);
  return info.changes > 0;
}

// ---- 刪除一位使用者的所有資料，回傳刪除的「記錄」筆數 ----
// 連帳號本身(users，含 LINE 識別碼與目標設定)一起刪，真正清空、識別碼不殘留。
// 下次傳訊 getOrCreateUser 會重建成全新帳號。
function deleteAllUserData(userId) {
  const tables = ['food_logs', 'body_logs', 'workout_logs', 'expenses', 'custom_exercises'];
  const tx = db.transaction((uid) => {
    let n = 0;
    for (const t of tables) {
      n += db.prepare(`DELETE FROM ${t} WHERE user = ?`).run(uid).changes;
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(uid); // 帳號框架也刪，識別碼不留
    return n;
  });
  return tx(userId);
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
function getSpending(userId, startMs) {
  const food = db
    .prepare(
      `SELECT COALESCE(SUM(price), 0) AS amount
       FROM food_logs WHERE user = ? AND ts >= ? AND price IS NOT NULL`
    )
    .get(userId, startMs);

  const rows = db
    .prepare(
      `SELECT category, SUM(amount) AS amount
       FROM expenses WHERE user = ? AND ts >= ?
       GROUP BY category`
    )
    .all(userId, startMs);

  const cats = [];
  if (food.amount > 0) cats.push({ category: '飲食', amount: food.amount });
  for (const r of rows) cats.push({ category: r.category, amount: r.amount });
  cats.sort((a, b) => b.amount - a.amount);

  const total = cats.reduce((s, c) => s + c.amount, 0);
  return { total, cats };
}

// ---- 今日總覽：把今天的餐加總，抓最新一筆體重 ----
function getTodaySummary(userId) {
  const start = todayStartMs();
  const food = db
    .prepare(
      `SELECT
         COALESCE(SUM(kcal), 0)    AS kcal,
         COALESCE(SUM(protein), 0) AS protein,
         COALESCE(SUM(carb), 0)    AS carb,
         COALESCE(SUM(fat), 0)     AS fat,
         COALESCE(SUM(price), 0)   AS price,
         COUNT(*)                  AS meals
       FROM food_logs WHERE user = ? AND ts >= ?`
    )
    .get(userId, start);

  const body = db
    .prepare(
      `SELECT weight, bodyfat FROM body_logs
       WHERE user = ? ORDER BY ts DESC LIMIT 1`
    )
    .get(userId);

  const workout = db
    .prepare(
      `SELECT COALESCE(SUM(kcal), 0) AS kcal, COUNT(*) AS count
       FROM workout_logs WHERE user = ? AND ts >= ?`
    )
    .get(userId, start);

  return { food, body: body || null, workout };
}

module.exports = {
  db,
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
  removeCustomExercise,
  deleteAllUserData,
  todayStartMs,
  weekStartMs,
  monthStartMs,
};
