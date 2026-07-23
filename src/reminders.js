// 定時提醒：每分鐘看一次「現在幾點幾分」，把到點的人用 LINE 推播提醒。
// 說明：靠 Cloudflare 每 3 分鐘戳一次保活，程式不會睡，計時器就能持續跑。
// 限制：Render 免費方案重啟會清空 SQLite，提醒設定會一併不見（與現有資料同樣的已知限制）。
// 時區：index.js 開頭已把 TZ 設為 Asia/Taipei，所以這裡的「幾點」就是台灣時間。
const { getDueReminders } = require('./db');

// 提醒的內文（label 是使用者設的小標，可空）
function reminderText(label) {
  const head = label ? `⏰ ${label}\n` : '⏰ 提醒時間到囉～\n';
  return (
    head +
    '記得記一下今天的帳和吃了什麼 📝\n' +
    '・記帳：打「記帳」\n' +
    '・記一餐：打「記一餐」\n' +
    '・看今天：打「總覽」'
  );
}

// 啟動排程：傳入 LINE 發訊客戶端（index.js 建好的）
function startReminderScheduler(client) {
  let lastTick = ''; // 記住上次處理到哪一分鐘，避免同一分鐘重複發

  const check = async () => {
    const now = new Date();
    const tick = `${now.toDateString()} ${now.getHours()}:${now.getMinutes()}`;
    if (tick === lastTick) return; // 這一分鐘已處理過
    lastTick = tick;

    let due;
    try {
      due = await getDueReminders(now.getHours(), now.getMinutes());
    } catch (e) {
      console.error('提醒查詢出錯：', e && e.message ? e.message : e);
      return;
    }
    for (const r of due) {
      client
        .pushMessage({
          to: r.lineUid,
          messages: [{ type: 'text', text: reminderText(r.label) }],
        })
        .catch((e) => console.error('提醒推播失敗：', e && e.message ? e.message : e));
    }
  };

  // 每 30 秒檢查一次；用「分鐘」判重，確保跨分鐘不會漏、也不會重複
  setInterval(check, 30 * 1000);
  console.log('⏰ 定時提醒排程已啟動（台灣時間，每分鐘檢查）');
}

module.exports = { startReminderScheduler };
