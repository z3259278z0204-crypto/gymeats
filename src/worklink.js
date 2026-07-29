// 跨 bot 連線：去問工作 bot（line-teaching-bot）拿本月工作淨薪明細。
// 拿不到（沒設 token、對方睡著逾時、錯誤）就回 null，總覽照常顯示、不擋流程。
const { config } = require('./config');

async function fetchWorkNet() {
  const { url, token } = config.workLink;
  if (!token) return null; // 沒設 REPORT_TOKEN 就不接，靜默略過
  try {
    const u = `${url}?token=${encodeURIComponent(token)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000); // 對方可能冷啟動，給 8 秒
    const res = await fetch(u, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.ok !== true) return null;
    return data; // { net, salary_gross, fuel, parking, ledger_income, ledger_expense, lessons, ... }
  } catch (e) {
    console.warn('fetchWorkNet 失敗（略過）:', e.message);
    return null;
  }
}

module.exports = { fetchWorkNet };
