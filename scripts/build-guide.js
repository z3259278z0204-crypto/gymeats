// 產生「練食記課表 · 動作教學」HTML（之後用無頭 Chrome 印成 PDF）
// 每個動作：手繪示意線稿 + 目標肌群小圖 + 步驟/發力重點/常見錯誤
const fs = require('fs');
const path = require('path');

const GREEN = '#1F7A5A';
const GRAY = '#B9C2BE';
const DARK = '#2f3b38';
const HL = '#E8735A';

// ---- SVG 基本零件 ----
const S = `stroke="${GREEN}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
const SG = `stroke="${GRAY}" stroke-width="7" stroke-linecap="round" fill="none"`;
const head = (x, y, r = 12) => `<circle cx="${x}" cy="${y}" r="${r}" ${S}/>`;
const line = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}" ${S}/>`;
const poly = (pts) => `<path d="M${pts.map((p) => p.join(' ')).join(' L')}" ${S}/>`;
// 槓鈴：灰桿＋兩端槓片
const bar = (x1, y1, x2, y2) =>
  `<path d="M${x1} ${y1} L${x2} ${y2}" ${SG}/>` +
  `<circle cx="${x1}" cy="${y1}" r="9" fill="${GRAY}"/><circle cx="${x2}" cy="${y2}" r="9" fill="${GRAY}"/>`;
const dumbbell = (x, y) =>
  `<circle cx="${x - 7}" cy="${y}" r="7" fill="${GRAY}"/><rect x="${x - 4}" y="${y - 3}" width="8" height="6" fill="${GRAY}"/><circle cx="${x + 7}" cy="${y}" r="7" fill="${GRAY}"/>`;
// 動作方向箭頭
const arrow = (x1, y1, x2, y2) => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 9;
  const p1 = [x2 - h * Math.cos(a - 0.5), y2 - h * Math.sin(a - 0.5)];
  const p2 = [x2 - h * Math.cos(a + 0.5), y2 - h * Math.sin(a + 0.5)];
  return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${HL}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M${p1[0]} ${p1[1]} L${x2} ${y2} L${p2[0]} ${p2[1]}" stroke="${HL}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
};
const bench = (x1, x2, y) =>
  `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="8" rx="3" fill="${GRAY}"/>` +
  `<path d="M${x1 + 12} ${y + 8} L${x1 + 12} ${y + 26} M${x2 - 12} ${y + 8} L${x2 - 12} ${y + 26}" ${SG}/>`;
const floor = (y) => `<path d="M20 ${y} L200 ${y}" stroke="${GRAY}" stroke-width="4" fill="none"/>`;
const fig = (inner) =>
  `<svg viewBox="0 0 220 210" xmlns="http://www.w3.org/2000/svg" width="150" height="143">${inner}</svg>`;

// ---- 各動作示意線稿 ----
const FIG = {
  // 臥推：仰躺推槓上舉
  benchPress: fig(
    bench(50, 175, 150) +
      head(60, 138) +
      line(72, 140, 140, 140) + // 軀幹
      line(140, 140, 165, 140) + // 大腿
      line(165, 140, 165, 150) + // 小腿
      line(110, 140, 118, 108) + // 上臂
      line(118, 108, 112, 82) + // 前臂
      bar(90, 78, 134, 78) +
      arrow(112, 100, 112, 62)
  ),
  // 上斜臥推
  inclinePress: fig(
    `<path d="M55 165 L150 120" ${SG}/>` +
      head(72, 120) +
      poly([[84, 124], [140, 100]]) +
      line(110, 112, 122, 84) +
      line(122, 84, 118, 60) +
      bar(96, 56, 140, 56) +
      arrow(118, 78, 118, 44)
  ),
  // 雙槓臂屈伸
  dips: fig(
    `<path d="M60 70 L60 150 M160 70 L160 150" ${SG}/>` +
      head(110, 78) +
      line(110, 90, 110, 140) +
      line(110, 140, 100, 165) +
      line(110, 140, 120, 165) +
      line(110, 100, 78, 96) +
      line(110, 100, 142, 96) +
      arrow(150, 120, 150, 90)
  ),
  // 纜繩夾胸
  cableFly: fig(
    head(110, 55) +
      line(110, 68, 110, 130) +
      line(110, 130, 100, 160) +
      line(110, 130, 120, 160) +
      poly([[110, 88], [138, 96], [150, 78]]) +
      poly([[110, 88], [82, 96], [70, 78]]) +
      arrow(150, 82, 122, 92) +
      arrow(70, 82, 98, 92)
  ),
  // 三頭下壓
  pushdown: fig(
    head(110, 55) +
      line(110, 68, 110, 135) +
      line(110, 135, 100, 165) +
      line(110, 135, 120, 165) +
      line(110, 88, 130, 108) + // 上臂固定
      line(130, 108, 132, 138) + // 前臂下壓
      bar(120, 140, 144, 140) +
      arrow(150, 112, 150, 145)
  ),
  // 過頭三頭伸展
  overheadTri: fig(
    head(110, 60) +
      line(110, 72, 110, 135) +
      line(110, 135, 100, 165) +
      line(110, 135, 120, 165) +
      line(110, 90, 118, 60) + // 上臂朝上
      line(118, 60, 130, 84) + // 前臂彎
      dumbbell(134, 88) +
      arrow(140, 84, 128, 52)
  ),
  // 引體 / 滑輪下拉
  pulldown: fig(
    bar(80, 40, 150, 40) +
      head(115, 78) +
      line(115, 90, 115, 145) +
      line(115, 145, 105, 170) +
      line(115, 145, 125, 170) +
      line(115, 100, 92, 62) +
      line(115, 100, 138, 62) +
      arrow(160, 55, 160, 92)
  ),
  // 槓鈴划船
  bentRow: fig(
    floor(180) +
      head(64, 96) +
      line(76, 100, 150, 120) + // 前傾軀幹
      line(150, 120, 150, 176) + // 腿
      line(150, 120, 132, 176) +
      line(110, 112, 112, 150) + // 手臂垂
      bar(92, 152, 132, 152) +
      arrow(112, 150, 112, 116)
  ),
  // 坐姿纜繩划船
  seatedRow: fig(
    floor(180) +
      bench(40, 120, 168) +
      head(70, 120) +
      line(82, 124, 82, 168) + // 軀幹直
      line(82, 150, 150, 150) + // 腿前伸
      line(82, 128, 120, 138) + // 手臂拉
      bar(150, 136, 150, 156) +
      arrow(140, 138, 100, 138)
  ),
  // 單臂啞鈴划船
  dumbbellRow: fig(
    bench(40, 130, 150) +
      head(58, 118) +
      line(70, 122, 150, 132) +
      line(150, 132, 175, 168) +
      line(95, 128, 95, 100) + // 撐手
      line(120, 130, 122, 158) + // 拉手
      dumbbell(122, 162) +
      arrow(140, 158, 140, 128)
  ),
  // 直臂下拉 / 面拉
  facePull: fig(
    bar(150, 55, 150, 95) +
      head(90, 78) +
      line(90, 90, 90, 145) +
      line(90, 145, 80, 170) +
      line(90, 145, 100, 170) +
      poly([[90, 100], [120, 92], [146, 80]]) +
      arrow(140, 92, 104, 96)
  ),
  // 二頭彎舉
  curl: fig(
    head(110, 55) +
      line(110, 68, 110, 135) +
      line(110, 135, 100, 165) +
      line(110, 135, 120, 165) +
      line(110, 90, 116, 128) + // 上臂
      line(116, 128, 132, 104) + // 前臂上舉
      dumbbell(136, 100) +
      arrow(142, 124, 142, 92)
  ),
  // 坐姿肩推
  seatedPress: fig(
    bench(70, 150, 172) +
      head(110, 92) +
      line(110, 104, 110, 168) +
      line(110, 116, 90, 96) +
      line(90, 96, 88, 68) +
      line(110, 116, 130, 96) +
      line(130, 96, 132, 68) +
      bar(78, 62, 142, 62) +
      arrow(150, 88, 150, 56)
  ),
  // 側平舉
  lateralRaise: fig(
    head(110, 58) +
      line(110, 70, 110, 135) +
      line(110, 135, 100, 165) +
      line(110, 135, 120, 165) +
      line(110, 92, 146, 96) + // 手臂側平
      line(110, 92, 74, 96) +
      dumbbell(150, 96) +
      dumbbell(70, 96) +
      arrow(158, 120, 158, 90) +
      arrow(62, 120, 62, 90)
  ),
  // 反向飛鳥（後束）
  rearDelt: fig(
    floor(182) +
      head(64, 92) +
      line(76, 98, 150, 118) +
      line(150, 118, 150, 178) +
      line(150, 118, 132, 178) +
      line(112, 108, 90, 96) +
      line(112, 108, 138, 96) +
      dumbbell(84, 94) +
      dumbbell(144, 94) +
      arrow(150, 118, 150, 92) +
      arrow(76, 118, 76, 92)
  ),
  // 聳肩
  shrug: fig(
    head(110, 58) +
      line(110, 70, 110, 140) +
      line(110, 140, 100, 168) +
      line(110, 140, 120, 168) +
      line(110, 88, 86, 140) +
      line(110, 88, 134, 140) +
      bar(74, 142, 146, 142) +
      arrow(160, 128, 160, 100)
  ),
  // 深蹲
  squat: fig(
    floor(185) +
      bar(78, 66, 142, 66) +
      head(110, 88) +
      line(110, 78, 110, 120) + // 軀幹
      poly([[110, 120], [96, 148], [96, 182]]) + // 一腿彎
      poly([[110, 120], [128, 148], [128, 182]]) +
      arrow(160, 150, 160, 105)
  ),
  // 羅馬尼亞硬舉
  rdl: fig(
    floor(185) +
      head(70, 84) +
      line(82, 90, 150, 118) + // 前傾
      line(150, 118, 148, 182) + // 微彎腿
      line(150, 118, 128, 182) +
      line(120, 108, 120, 150) +
      bar(100, 152, 140, 152) +
      arrow(175, 150, 175, 100)
  ),
  // 腿推
  legPress: fig(
    `<path d="M40 170 L120 120" ${SG}/>` + // 椅背
      head(58, 128) +
      poly([[70, 132], [120, 120]]) +
      poly([[120, 120], [150, 96], [178, 110]]) + // 腿推平台
      `<rect x="176" y="86" width="12" height="46" rx="3" fill="${GRAY}"/>` +
      arrow(160, 150, 182, 128)
  ),
  // 腿伸展
  legExt: fig(
    bench(50, 130, 130) +
      head(66, 100) +
      line(78, 104, 130, 116) +
      line(130, 116, 128, 150) + // 大腿到膝
      line(128, 150, 168, 138) + // 小腿抬起
      arrow(150, 168, 168, 132)
  ),
  // 腿彎舉
  legCurl: fig(
    bench(40, 150, 120) +
      head(56, 108) +
      line(68, 112, 150, 128) +
      line(150, 128, 168, 150) + // 小腿彎起
      arrow(174, 150, 174, 116)
  ),
  // 保加利亞分腿蹲
  splitSquat: fig(
    floor(185) +
      `<rect x="150" y="150" width="40" height="8" rx="3" fill="${GRAY}"/>` + // 後腳墊高
      head(96, 74) +
      line(96, 86, 96, 118) +
      poly([[96, 118], [80, 150], [80, 184]]) + // 前腿
      poly([[96, 118], [130, 140], [158, 150]]) + // 後腿架起
      dumbbell(72, 118) +
      dumbbell(120, 118) +
      arrow(56, 150, 56, 108)
  ),
  // 站姿提踵
  calfRaise: fig(
    floor(184) +
      `<rect x="88" y="176" width="44" height="10" rx="2" fill="${GRAY}"/>` + // 踏板
      head(110, 66) +
      line(110, 78, 110, 130) +
      line(110, 130, 104, 168) +
      line(110, 130, 116, 168) +
      arrow(150, 150, 150, 118)
  ),
  // 抗旋核心（示意）
  core: fig(
    floor(180) +
      head(90, 96) +
      line(90, 108, 90, 160) +
      line(90, 160, 80, 178) +
      line(90, 160, 100, 178) +
      line(90, 120, 140, 120) + // 手臂前伸
      bar(140, 112, 140, 128) +
      arrow(150, 96, 150, 120)
  ),
};

// ---- 目標肌群小人形（正/背面 silhouette，highlight 目標區）----
function bodyMap(region) {
  const base = `fill="#DfE7E4"`;
  const hl = `fill="${HL}"`;
  const H = (r) => (region === r ? hl : base);
  // 簡化人形：頭、軀幹、四肢方塊；不同區塊上色
  return `<svg viewBox="0 0 70 110" width="46" height="72" xmlns="http://www.w3.org/2000/svg">
    <circle cx="35" cy="12" r="8" ${base}/>
    <rect x="24" y="22" width="22" height="8" rx="3" ${H('shoulders')}/>
    <rect x="27" y="30" width="16" height="18" rx="4" ${H('chest')}/>
    <rect x="27" y="30" width="16" height="18" rx="4" ${H('back')} opacity="${region === 'back' ? 1 : 0}"/>
    <rect x="28" y="48" width="14" height="16" rx="4" ${H('core')}/>
    <rect x="17" y="31" width="8" height="22" rx="4" ${H('arm')}/>
    <rect x="45" y="31" width="8" height="22" rx="4" ${H('arm')}/>
    <rect x="27" y="64" width="7" height="26" rx="3" ${H('legs')}/>
    <rect x="36" y="64" width="7" height="26" rx="3" ${H('legs')}/>
    <rect x="27" y="90" width="7" height="12" rx="3" ${H('calf')}/>
    <rect x="36" y="90" width="7" height="12" rx="3" ${H('calf')}/>
  </svg>`;
}

// ---- 26 個動作的教學內容 ----
const EX = [
  // 胸
  { g: '胸', n: '槓鈴臥推', m: '胸大肌、三頭', map: 'chest', f: 'benchPress',
    steps: ['躺穩，肩胛後收下壓，挺胸、腳踩地。', '槓下放到胸線（乳頭上方），手肘約 45–75 度。', '推回起點，鎖定但不聳肩。'],
    cue: ['全程肩胛夾緊、胸帶動', '手腕在手肘正上方'],
    bad: ['彈胸借力、手肘外開太多', '屁股離椅（過度拱腰）'] },
  { g: '胸', n: '上斜啞鈴臥推', m: '上胸', map: 'chest', f: 'inclinePress',
    steps: ['椅背調 30–45 度，啞鈴收到肩上方起。', '沿弧線下放到上胸兩側，感覺伸展。', '推起靠攏，不互敲。'],
    cue: ['角度別太高（>45 變肩推）', '想像用胸把手肘推向中間'],
    bad: ['椅背太陡練成肩', '下放過深壓迫肩'] },
  { g: '胸', n: '雙槓臂屈伸', m: '下胸、三頭', map: 'chest', f: 'dips',
    steps: ['雙槓撐起，身體微前傾練胸、直立偏三頭。', '屈肘下沉到肩略低於肘。', '推回頂端。'],
    cue: ['肩胛穩定、別聳肩', '前傾角度決定胸/三頭比重'],
    bad: ['下沉過深傷肩', '聳肩借力'] },
  { g: '胸', n: '纜繩夾胸', m: '胸大肌', map: 'chest', f: 'cableFly',
    steps: ['站中央微前傾，手肘微彎固定。', '像抱大樹把手把向中間收攏。', '慢慢還原到胸有伸展。'],
    cue: ['手肘角度全程不變', '收到底擠一下胸'],
    bad: ['變成推（肘一直彎伸）', '用肩發力'] },
  { g: '胸', n: '三頭下壓', m: '三頭肌', map: 'arm', f: 'pushdown',
    steps: ['面對滑輪，上臂夾身固定。', '只動前臂，把桿壓到底伸直。', '控制回到起點。'],
    cue: ['手肘固定不前後晃', '底部停一下擠三頭'],
    bad: ['上臂亂動借力', '身體前傾用體重壓'] },
  { g: '胸', n: '過頭三頭伸展', m: '三頭長頭', map: 'arm', f: 'overheadTri',
    steps: ['啞鈴/繩舉過頭，上臂朝上固定。', '前臂往後下放到伸展。', '伸直回頂。'],
    cue: ['手肘朝前、夾住不外開', '感覺三頭被拉長'],
    bad: ['手肘外開', '肩膀代償'] },
  // 背
  { g: '背', n: '引體向上 / 滑輪下拉', m: '闊背、大圓肌', map: 'back', f: 'pulldown',
    steps: ['握略寬於肩，肩胛先下沉。', '把桿拉到上胸／身體拉向桿。', '控制回到手臂伸直。'],
    cue: ['用手肘往腰帶方向拉', '別聳肩、挺胸'],
    bad: ['靠慣性甩', '只用手臂不用背'] },
  { g: '背', n: '槓鈴划船', m: '中背、闊背', map: 'back', f: 'bentRow',
    steps: ['髖鉸鏈前傾約 45 度，背打直。', '槓沿腿拉向肚臍下方。', '收緊後慢放。'],
    cue: ['核心繃緊、背不彎', '手肘貼身往後'],
    bad: ['圓背（危險）', '站太直變聳肩'] },
  { g: '背', n: '坐姿纜繩划船', m: '中背', map: 'back', f: 'seatedRow',
    steps: ['坐直微前傾抓把，膝微彎。', '把手拉到腹部，肩胛後收。', '前傾伸展再拉。'],
    cue: ['挺胸、胸口迎向把手', '拉到底夾背'],
    bad: ['整個人前後盪', '駝背拉'] },
  { g: '背', n: '單臂啞鈴划船', m: '闊背', map: 'back', f: 'dumbbellRow',
    steps: ['一手一膝撐椅，背平行地面。', '啞鈴沿身側拉到腰。', '控制放到肩前伸展。'],
    cue: ['手肘貼身、拉到髖', '軀幹不隨手轉'],
    bad: ['身體旋轉借力', '聳肩'] },
  { g: '背', n: '直臂下拉 / 面拉', m: '闊背 / 後束', map: 'shoulders', f: 'facePull',
    steps: ['面拉：繩拉向臉，手肘高、外展。', '收到耳側、肩胛後收。', '慢慢還原。'],
    cue: ['想像秀二頭的姿勢', '肩後與旋轉肌群發力'],
    bad: ['用重量過大聳肩', '手肘下掉變划船'] },
  { g: '背', n: '二頭彎舉', m: '二頭肌', map: 'arm', f: 'curl',
    steps: ['站直上臂夾身，掌心朝前。', '彎起到頂端擠一下。', '慢放到完全伸直。'],
    cue: ['手肘固定不往前跑', '下放控制別放鬆'],
    bad: ['甩身體借力', '沒放到底'] },
  { g: '背', n: '錘式彎舉', m: '二頭、肱橈肌', map: 'arm', f: 'curl',
    steps: ['掌心相對（拇指朝上）握啞鈴。', '彎起到頂，維持中立握。', '控制下放。'],
    cue: ['手腕中立不轉', '上臂固定'],
    bad: ['借力上擺', '聳肩'] },
  // 肩膀
  { g: '肩膀', n: '坐姿肩推', m: '三角肌前中束', map: 'shoulders', f: 'seatedPress',
    steps: ['坐直靠背，槓/啞鈴在肩上方起。', '往上推到手臂近伸直。', '控制回到耳側高度。'],
    cue: ['核心收緊、肋骨不外翻', '手腕在手肘上方'],
    bad: ['過度後仰變上斜臥推', '聳肩推'] },
  { g: '肩膀', n: '側平舉', m: '三角肌中束', map: 'shoulders', f: 'lateralRaise',
    steps: ['微前傾，手肘微彎。', '往兩側抬到與肩同高。', '慢放，全程控制。'],
    cue: ['小指略高、像倒水', '用肩不用斜方'],
    bad: ['甩起來、聳肩', '重量過大'] },
  { g: '肩膀', n: '纜繩側平舉', m: '三角肌中束', map: 'shoulders', f: 'lateralRaise',
    steps: ['纜繩在身後側，單手抓把。', '沿身側抬到肩高。', '控制回放，張力不斷。'],
    cue: ['全程張力連續', '軀幹不晃'],
    bad: ['身體帶動', '角度跑掉'] },
  { g: '肩膀', n: '反向飛鳥（後束）', m: '三角肌後束', map: 'shoulders', f: 'rearDelt',
    steps: ['前傾約 45 度，手肘微彎。', '往兩側後上方張開。', '擠後肩後慢放。'],
    cue: ['想把兩片肩胛夾起', '拇指略朝下'],
    bad: ['用背划船', '聳肩'] },
  { g: '肩膀', n: '纜繩面拉', m: '後束、旋轉肌', map: 'shoulders', f: 'facePull',
    steps: ['繩高於臉，拉向額頭兩側。', '手肘高、外展打開。', '收緊後還原。'],
    cue: ['手肘高於手腕', '肩後發力'],
    bad: ['重量太大聳肩', '拉到胸口'] },
  { g: '肩膀', n: '聳肩', m: '上斜方肌', map: 'shoulders', f: 'shrug',
    steps: ['雙手持槓/啞鈴自然垂。', '肩往耳朵方向直上聳。', '頂端停一下再慢放。'],
    cue: ['直上直下、不繞圈', '下放拉到底伸展'],
    bad: ['繞肩（易受傷）', '用手臂彎舉'] },
  // 腿
  { g: '腿', n: '槓鈴深蹲', m: '股四頭、臀', map: 'legs', f: 'squat',
    steps: ['槓置上背，腳與肩同寬略外八。', '髖膝同時下蹲到大腿平行或更低。', '腳推地站起。'],
    cue: ['核心繃緊、背打直', '膝蓋對齊腳尖方向'],
    bad: ['膝內夾、圓背', '重心過度前傾'] },
  { g: '腿', n: '羅馬尼亞硬舉', m: '腿後、臀', map: 'legs', f: 'rdl',
    steps: ['微屈膝，槓貼腿，髖向後推。', '下到腿後有伸展（背保持直）。', '髖前推站直、夾臀。'],
    cue: ['槓全程貼著腿', '感覺是髖在動不是腰'],
    bad: ['圓背（很危險）', '變成蹲'] },
  { g: '腿', n: '腿推 Leg Press', m: '股四頭、臀', map: 'legs', f: 'legPress',
    steps: ['坐穩，腳與肩同寬踩平台。', '屈膝下放到約 90 度。', '腳跟推回，膝不鎖死。'],
    cue: ['下背貼椅不離開', '膝對腳尖'],
    bad: ['下放過深屁股翹起', '膝內扣'] },
  { g: '腿', n: '腿伸展', m: '股四頭', map: 'legs', f: 'legExt',
    steps: ['調墊到腳踝上方，坐穩握把。', '伸直膝蓋抬到頂。', '控制放回。'],
    cue: ['頂端停一下擠股四頭', '別用甩的'],
    bad: ['甩腿、屁股離椅', '速度太快'] },
  { g: '腿', n: '腿彎舉', m: '腿後肌', map: 'legs', f: 'legCurl',
    steps: ['墊在腳跟上方，身體固定。', '把腳跟往臀部方向彎。', '控制還原。'],
    cue: ['骨盆穩定不翹', '收到底擠腿後'],
    bad: ['臀部彈起借力', '半程'] },
  { g: '腿', n: '保加利亞分腿蹲', m: '股四頭、臀', map: 'legs', f: 'splitSquat',
    steps: ['後腳背放椅上，前腳踩穩。', '垂直下蹲到後膝近地。', '前腳推地起身。'],
    cue: ['重心壓前腳跟', '軀幹稍前傾練臀'],
    bad: ['前腳跪太前膝過腳尖', '左右晃'] },
  { g: '腿', n: '站姿提踵', m: '小腿', map: 'calf', f: 'calfRaise',
    steps: ['前腳掌踩踏板，腳跟懸空。', '踮到最高、停一下。', '慢慢下放到腳跟低於踏板。'],
    cue: ['頂端擠、底部伸展', '膝蓋打直'],
    bad: ['彈震快速', '幅度太小'] },
];

const GROUP_ORDER = ['胸', '背', '肩膀', '腿'];
const GROUP_COLOR = { 胸: '#1F7A5A', 背: '#2C6FB0', 肩膀: '#D89B2E', 腿: '#7A4FB0' };

function list(items) {
  return items.map((s) => `<li>${s}</li>`).join('');
}

function card(e) {
  return `<div class="card">
    <div class="fig">${FIG[e.f] || ''}<div class="map">${bodyMap(e.map)}<span>目標</span></div></div>
    <div class="txt">
      <div class="name">${e.n}<span class="muscle">${e.m}</span></div>
      <div class="block"><b>步驟</b><ol>${list(e.steps)}</ol></div>
      <div class="row2">
        <div class="block cue"><b>發力重點</b><ul>${list(e.cue)}</ul></div>
        <div class="block bad"><b>常見錯誤</b><ul>${list(e.bad)}</ul></div>
      </div>
    </div>
  </div>`;
}

function section(g) {
  const cards = EX.filter((e) => e.g === g).map(card).join('');
  const dot = `<span class="dot" style="background:${GROUP_COLOR[g]}"></span>`;
  return `<section><h2 style="color:${GROUP_COLOR[g]};border-color:${GROUP_COLOR[g]}">${dot}${g}</h2>${cards}</section>`;
}

const today = new Date().toLocaleDateString('zh-TW');
const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><style>
  @font-face { font-family:'NotoTC'; src:url('fonts/NotoSansTC.otf') format('opentype'); font-weight:100 900; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'NotoTC',sans-serif; color:${DARK}; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .dot { display:inline-block; width:16px; height:16px; border-radius:4px; margin-right:8px; vertical-align:middle; }
  @page { size:A4; margin:14mm; }
  .cover { height:250mm; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; page-break-after:always; }
  .cover h1 { font-size:40px; color:${GREEN}; margin-bottom:12px; }
  .cover .sub { font-size:18px; color:#6b7772; margin-bottom:28px; }
  .cover .split { font-size:16px; color:${DARK}; line-height:2; background:#F1F6F4; padding:20px 34px; border-radius:14px; }
  .cover .foot { margin-top:30px; font-size:12px; color:#9aa5a1; }
  h2 { font-size:24px; color:${GREEN}; margin:6px 0 14px; padding-bottom:6px; border-bottom:3px solid ${GREEN}; page-break-after:avoid; }
  section { page-break-inside:auto; }
  .card { display:flex; gap:16px; border:1px solid #E3EAE7; border-radius:12px; padding:14px 16px; margin-bottom:14px; page-break-inside:avoid; }
  .fig { flex:0 0 160px; display:flex; flex-direction:column; align-items:center; }
  .fig .map { display:flex; flex-direction:column; align-items:center; margin-top:4px; }
  .fig .map span { font-size:10px; color:#9aa5a1; }
  .txt { flex:1; }
  .name { font-size:19px; font-weight:700; color:${DARK}; margin-bottom:8px; }
  .name .muscle { font-size:12px; font-weight:500; color:#fff; background:${GREEN}; padding:2px 8px; border-radius:10px; margin-left:8px; vertical-align:middle; }
  .block { margin-bottom:6px; font-size:13px; }
  .block b { color:${GREEN}; font-size:13px; }
  .block ol, .block ul { margin:3px 0 0 18px; line-height:1.55; }
  .row2 { display:flex; gap:14px; }
  .row2 .block { flex:1; }
  .bad b { color:${HL}; }
  .footer-note { font-size:11px; color:#9aa5a1; margin-top:8px; text-align:center; }
</style></head><body>
  <div class="cover">
    <h1>練食記 · 動作教學手冊</h1>
    <div class="sub">四日肌群分化課表　增肌微減脂</div>
    <div class="split">週一 胸　·　週二 背<br>週四 肩膀　·　週五 腿<br>（週三、週末 休息）</div>
    <div class="foot">產生日期 ${today}　·　示意線稿僅供動作概念參考</div>
  </div>
  ${GROUP_ORDER.map(section).join('')}
  <div class="footer-note">漸進超負荷：主項所有組做到次數上限且姿勢標準，下次加 2.5–5% 重量。訓練日吃到約 2600 大卡、蛋白 150g。</div>
</body></html>`;

const outDir = path.join(__dirname, '..', 'assets');
fs.writeFileSync(path.join(outDir, 'guide.html'), html);
console.log('已產生 assets/guide.html（' + EX.length + ' 個動作）');
