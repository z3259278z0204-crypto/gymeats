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
    FOREIGN KEY (user) REFERENCES users(id)
  );
`);

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

// ---- 算「今天」的區間（當地時間 00:00 到現在）----
function todayStartMs() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
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

  return { food, body: body || null };
}

module.exports = {
  db,
  getOrCreateUser,
  insertFood,
  insertBody,
  getTodaySummary,
};
