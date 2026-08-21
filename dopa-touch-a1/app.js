(() => {
  'use strict';

  const app = document.getElementById('app');
  const loading = document.getElementById('loading');
  const effects = document.getElementById('effects');
  const rewardOverlay = document.getElementById('rewardOverlay');
  const toast = document.getElementById('toast');
  const settingsDialog = document.getElementById('settingsDialog');
  const parentDialog = document.getElementById('parentDialog');
  const STORAGE_KEY = 'dopatouch-a1-state-v1';
  const FLOW = ['video', 'mimic', 'number', 'karuta'];
  const NODE_INFO = {
    video: { icon: '▶', label: 'どうが' },
    mimic: { icon: '☝', label: 'まねっこ' },
    number: { icon: '★', label: 'たまおき' },
    karuta: { icon: '▦', label: 'かるた' }
  };
  const ISO_REGION_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK`.split(' ');
  const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['ja'], { type: 'region' }) : null;
  const SPECIAL_REGION_NAMES = { JP: 'にほん', XK: 'コソボ' };
  const FLAGS = ISO_REGION_CODES.map(code => ({
    code: code.toLowerCase(),
    name: SPECIAL_REGION_NAMES[code] || regionNames?.of(code) || code,
    locked: false
  })).sort((a, b) => a.code === 'jp' ? -1 : b.code === 'jp' ? 1 : a.name.localeCompare(b.name, 'ja'));
  function flagGraphic(code, name = '') {
    return `<img src="https://flagcdn.com/${code}.svg" alt="${escapeHTML(name)}の国旗" loading="lazy" decoding="async">`;
  }
  function selectedFlagItem() {
    return FLAGS.find(item => item.code === state.selectedFlag) || FLAGS.find(item => item.code === 'jp');
  }
  const GIFTS = [
    { icon: '🌼', title: 'キラキラのお花！', message: '画面いっぱいに咲いたよ！' },
    { icon: '🐕', title: 'げんきなワンちゃん！', message: 'いっしょにダンスしているよ！' },
    { icon: '🚀', title: 'ロケット発見！', message: 'つぎの問題へ、しゅっぱつ！' },
    { icon: '🦖', title: 'ちび恐竜がきた！', message: 'その調子！ ガオー！' },
    { icon: '👑', title: 'ピカピカ王冠！', message: '今日の主役はきみだ！' },
    { icon: '🌈', title: 'にじが出た！', message: 'すごいタッチだったね！' }
  ];

  const todayKey = () => new Date().toISOString().slice(0, 10);
  const defaults = {
    name: 'ゲスト',
    stage: 'A1',
    selectedFlag: 'jp',
    flagOffer: [],
    flagCollection: {},
    completed: [],
    mistakes: 0,
    totalCorrect: 0,
    dailyClears: 0,
    dailyDate: todayKey(),
    internalMission: 1,
    device: 'pc',
    prefs: { volume: 82, vibration: true, motion: true }
  };

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const merged = { ...defaults, ...saved, prefs: { ...defaults.prefs, ...(saved.prefs || {}) } };
      if (merged.dailyDate !== todayKey()) {
        merged.dailyDate = todayKey();
        merged.dailyClears = 0;
      }
      merged.completed = Array.isArray(merged.completed) ? merged.completed.filter(x => FLOW.includes(x)) : [];
      merged.flagOffer = Array.isArray(merged.flagOffer) ? merged.flagOffer.filter(code => FLAGS.some(flag => flag.code === code)).slice(0, 3) : [];
      merged.flagCollection = merged.flagCollection && typeof merged.flagCollection === 'object' ? merged.flagCollection : {};
      return merged;
    } catch (_) {
      return structuredClone(defaults);
    }
  }

  let state = readState();
  let audioContext = null;
  let installPrompt = null;
  let screenTimer = null;
  let intervalTimer = null;
  let currentCleanup = () => {};
  const activePointers = new Map();
  document.body.dataset.device = state.device;
  document.body.classList.toggle('motion-off', !state.prefs.motion);

  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function clearTimers() {
    clearTimeout(screenTimer);
    clearInterval(intervalTimer);
    screenTimer = null;
    intervalTimer = null;
    currentCleanup();
    currentCleanup = () => {};
    activePointers.clear();
  }
  function setScreen(html) {
    clearTimers();
    app.innerHTML = html;
  }
  function screenEl() { return app.querySelector('.screen'); }
  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function getAudio() {
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      return audioContext;
    } catch (_) { return null; }
  }
  function tone(frequency, duration = .08, delay = 0, type = 'sine', gainValue = .23) {
    if (state.prefs.volume <= 0) return;
    const ctx = getAudio();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(Math.max(.001, gainValue * state.prefs.volume / 100), start);
    gain.gain.exponentialRampToValueAtTime(.001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
  }
  function sound(kind) {
    if (kind === 'tap') tone(660, .055, 0, 'sine', .17);
    if (kind === 'correct') { tone(523, .16, 0, 'triangle', .26); tone(659, .17, .07, 'triangle', .27); tone(784, .22, .14, 'triangle', .29); }
    if (kind === 'wrong') { tone(180, .12, 0, 'sawtooth', .2); tone(125, .18, .1, 'sawtooth', .19); }
    if (kind === 'reward') [523,659,784,1047,1319].forEach((f,i) => tone(f,.24,i*.085,i === 4 ? 'triangle' : 'sine',.3));
    if (kind === 'flag') [392,523,659,784,1047,1319].forEach((f,i) => tone(f,.33,i*.11,'triangle',.31));
    if (kind === 'count') tone(880, .08, 0, 'square', .12);
  }
  function vibrate(pattern) { if (state.prefs.vibration && navigator.vibrate) navigator.vibrate(pattern); }

  function showToast(message, ms = 1400) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, ms);
  }
  function showLoading(next, ms = 900) {
    clearTimers();
    loading.hidden = false;
    sound('count');
    screenTimer = setTimeout(() => {
      loading.hidden = true;
      next();
    }, ms);
  }
  function confetti(count = 70) {
    if (!state.prefs.motion) return;
    const colors = ['#ff3d8d','#ffd82e','#38d5ff','#7f44ff','#56e969','#ff7b32'];
    for (let i = 0; i < count; i++) {
      const bit = document.createElement('i');
      bit.className = 'confetti';
      bit.style.left = Math.random() * 100 + '%';
      bit.style.setProperty('--c', colors[i % colors.length]);
      bit.style.setProperty('--t', 1 + Math.random() * 1.5 + 's');
      bit.style.setProperty('--d', -80 + Math.random() * 160 + 'px');
      bit.style.setProperty('--r', Math.random() * 180 + 'deg');
      bit.style.animationDelay = Math.random() * .25 + 's';
      effects.append(bit);
      setTimeout(() => bit.remove(), 2900);
    }
  }
  function burst(word = 'せいかい！') {
    const pop = document.createElement('b');
    pop.className = 'pop-word';
    pop.textContent = word;
    effects.append(pop);
    const colors = ['#fff33a','#22d9ff','#ff56ae','#80ff52'];
    for (let i = 0; i < 16; i++) {
      const spark = document.createElement('i');
      const angle = Math.PI * 2 * i / 16;
      spark.className = 'spark';
      spark.style.left = '50%';
      spark.style.top = '48%';
      spark.style.setProperty('--c', colors[i % colors.length]);
      spark.style.setProperty('--x', Math.cos(angle) * (80 + Math.random() * 120) + 'px');
      spark.style.setProperty('--y', Math.sin(angle) * (55 + Math.random() * 100) + 'px');
      effects.append(spark);
      setTimeout(() => spark.remove(), 900);
    }
    setTimeout(() => pop.remove(), 950);
  }
  function correctEffect(big = false) {
    sound('correct');
    vibrate(big ? [35,25,55,25,90] : 35);
    burst(big ? 'すごい！！' : 'せいかい！');
    if (big) { confetti(45); screenEl()?.classList.add('party'); }
  }
  function wrongEffect(message = 'もう一度！') {
    state.mistakes += 1;
    save();
    sound('wrong');
    vibrate([60,35,60]);
    screenEl()?.classList.remove('shake');
    void screenEl()?.offsetWidth;
    screenEl()?.classList.add('shake');
    showToast(message);
  }

  function deviceButtons(compact = false) {
    const labels = { phone: 'スマホ', tablet: 'iPad', pc: 'パソコン' };
    return `<div class="device-options${compact ? ' compact' : ''}">${Object.entries(labels).map(([key,label]) =>
      `<button type="button" class="device-choice${state.device === key ? ' selected' : ''}" data-action="device" data-device="${key}" aria-pressed="${state.device === key}">${label}</button>`
    ).join('')}</div>`;
  }
  function userPlate() { return `<div class="user-plate">${escapeHTML(state.name)}<span>${state.stage}</span></div>`; }
  function gameHeader(title, back = 'mission-select') {
    return `<header class="game-header"><button class="back-button" data-action="${back}" aria-label="戻る">←</button>${userPlate()}<div class="header-title">${title}</div><div class="header-side"><button class="small-header-button" data-action="settings">せってい</button></div></header>`;
  }
  function sideTabs() { return `<aside class="side-tabs" aria-hidden="true"><div class="side-tab">Timer</div><div class="side-tab">Volume</div></aside>`; }
  function escapeHTML(text) { return String(text).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function createFlagOffer() {
    const pool = FLAGS.map(flag => flag.code);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    state.flagOffer = pool.slice(0, 3);
    save();
  }
  function currentFlagOffer() {
    if (!Array.isArray(state.flagOffer) || state.flagOffer.length !== 3) createFlagOffer();
    return state.flagOffer.map(code => FLAGS.find(flag => flag.code === code)).filter(Boolean);
  }

  function renderStart() {
    setScreen(`<section class="screen start-screen star-bg">
      <div class="top-tools"><button class="aqua-button" data-action="settings">Settings</button><button class="aqua-button" data-action="parent">Parent/Guardian</button></div>
      <img class="brand-logo" src="assets/dopatouch-logo.png" alt="DopaTouch">
      <button class="start-name" data-action="settings">${escapeHTML(state.name)}</button>
      <div class="device-chooser"><div class="device-label">使用する端末を選んでください</div>${deviceButtons()}</div>
      <button class="start-button" data-action="start">START</button>
      <div class="version">Version A1.0</div>
    </section>`);
  }

  function renderMissionSelect() {
    const offeredFlags = currentFlagOffer();
    setScreen(`<section class="screen mission-select">
      ${gameHeader('きょうのミッション', 'start-back')}
      <div class="today-strip"><h1>きょうのミッション</h1><p>国旗をひとつ選ぼう！</p></div>
      <div class="world-panel"><div class="random-label">🎲 ランダムでえらばれた3つ</div><div class="flag-grid">${offeredFlags.map(item => { const index = FLAGS.indexOf(item); return `<button class="flag-card" data-action="flag" data-index="${index}"><span class="flag">${flagGraphic(item.code, item.name)}</span><strong>${item.name}</strong><small>この国旗をえらぶ</small></button>`; }).join('')}</div></div>
      <div class="daily-progress"><span>きょう</span>${[0,1,2].map(i => `<i class="daily-dot${state.dailyClears > i ? ' done' : ''}"></i>`).join('')}<span>${state.dailyClears}/3面</span></div>
    </section>`);
  }

  function renderMap() {
    if (state.completed.length >= FLOW.length) { renderMissionDecision(); return; }
    const current = state.completed.length;
    setScreen(`<section class="screen map-screen">
      ${gameHeader('A1 ミッション', 'mission-select')}
      <div class="map-path"><div class="path-line"></div>${FLOW.map((type,index) => {
        const done = state.completed.includes(type);
        const status = done ? ' completed' : index === current ? ' current' : ' locked';
        return `<button class="map-node node-${index}${status}" data-action="node" data-index="${index}" ${index > current ? 'disabled' : ''}><span class="node-icon">${done ? '✓' : NODE_INFO[type].icon}</span><span class="node-label">${NODE_INFO[type].label}</span></button>`;
      }).join('')}<div class="guide-hand map-hand" style="left:${[7,30,56,80][current]}%;top:${[7,38,3,37][current]}%">☝</div></div>
      ${sideTabs()}
    </section>`);
  }

  function boardHTML(id, columns = 2, extraClass = '') {
    const columnHTML = Array.from({ length: columns }, (_, col) => `<div class="soroban-column${col === columns - 1 ? ' units' : ''}" data-column="${col}">
      <div class="bead-slot"><button class="bead" data-value="5" data-index="0" aria-label="5の珠"></button></div>
      <div class="lower-deck">${[0,1,2,3].map(i => `<button class="bead" data-value="1" data-index="${i}" aria-label="${i + 1}の珠"></button>`).join('')}</div>
    </div>`).join('');
    return `<div class="soroban-board ${extraClass}" id="${id}" style="--columns:${columns}">${columnHTML}</div>`;
  }
  function miniBoardHTML(value) {
    return `<div class="mini-beads"><i class="mini-bead"></i><i class="mini-bar"></i>${[1,2,3,4].map(i => `<i class="mini-bead${i <= value ? ' on' : ''}"></i>`).join('')}</div>`;
  }
  function getBoardValues(board) {
    return [...board.querySelectorAll('.soroban-column')].map(column => [...column.querySelectorAll('.bead.on')].reduce((sum,bead) => sum + Number(bead.dataset.value),0));
  }
  function setBead(bead, on, color = '') {
    bead.classList.toggle('on', on);
    bead.classList.toggle('blue', on && color === 'blue');
    bead.setAttribute('aria-pressed', String(on));
  }
  function resetBoard(board) { board.querySelectorAll('.bead').forEach(bead => setBead(bead,false)); }
  function setColumnValue(board, columnIndex, value, color = '') {
    const column = board.querySelector(`.soroban-column[data-column="${columnIndex}"]`);
    if (!column) return;
    const upper = column.querySelector('.bead[data-value="5"]');
    setBead(upper, value >= 5, color);
    column.querySelectorAll('.bead[data-value="1"]').forEach((bead,index) => setBead(bead, index < value % 5, color));
  }
  function bindBoard(board, onChange) {
    const moveLimit = Math.max(10, board.getBoundingClientRect().width * .025);
    const down = event => {
      const bead = event.target.closest('.bead');
      if (!bead || activePointers.has(event.pointerId)) return;
      event.preventDefault();
      activePointers.set(event.pointerId,{ bead, x:event.clientX, y:event.clientY, moved:false });
      bead.classList.add('pressed');
      try { bead.setPointerCapture(event.pointerId); } catch (_) {}
    };
    const move = event => {
      const point = activePointers.get(event.pointerId);
      if (!point) return;
      if (Math.hypot(event.clientX - point.x,event.clientY - point.y) > moveLimit) { point.moved = true; point.bead.classList.remove('pressed'); }
    };
    const finish = (event,cancelled = false) => {
      const point = activePointers.get(event.pointerId);
      if (!point) return;
      point.bead.classList.remove('pressed');
      if (!cancelled && !point.moved) {
        const bead = point.bead;
        const value = Number(bead.dataset.value);
        if (value === 5) setBead(bead,!bead.classList.contains('on'));
        else {
          const column = bead.closest('.soroban-column');
          const beads = [...column.querySelectorAll('.bead[data-value="1"]')];
          const touched = Number(bead.dataset.index);
          const count = beads.filter(item => item.classList.contains('on')).length;
          const nextCount = touched < count ? touched : touched + 1;
          beads.forEach((item,index) => setBead(item,index < nextCount));
        }
        sound('tap');
        vibrate(16);
        onChange(getBoardValues(board),bead);
      }
      activePointers.delete(event.pointerId);
    };
    board.addEventListener('pointerdown',down);
    board.addEventListener('pointermove',move);
    board.addEventListener('pointerup',finish);
    board.addEventListener('pointercancel',event => finish(event,true));
    currentCleanup = () => {
      board.removeEventListener('pointerdown',down); board.removeEventListener('pointermove',move); board.removeEventListener('pointerup',finish);
      board.querySelectorAll('.pressed').forEach(bead => bead.classList.remove('pressed'));
    };
  }

  function renderLesson() {
    setScreen(`<section class="screen lesson-screen">
      <div class="lesson-head"><button class="lesson-pause" data-action="activity-back">←</button><span class="lesson-time" id="lessonTime">0:00 / 0:12</span><div class="lesson-progress"><i id="lessonBar"></i></div><button class="lesson-pause" data-action="lesson-pause" id="lessonPause">Ⅱ</button></div>
      <div class="lesson-stage"><div class="lesson-caption" id="lessonCaption">数字の「3」を珠でつくってみよう</div><div class="lesson-demo-board soroban-wrap">${boardHTML('lessonBoard',2)}</div><div class="lesson-finger">☝</div><div class="lesson-mascot">★</div></div>
      <div class="no-skip">この動画は最後まで見よう（早送りはできません）</div>
    </section>`);
    const duration = 12000;
    let elapsed = 0;
    let paused = false;
    const board = document.getElementById('lessonBoard');
    const bar = document.getElementById('lessonBar');
    const time = document.getElementById('lessonTime');
    const caption = document.getElementById('lessonCaption');
    const tick = () => {
      if (paused) return;
      elapsed += 100;
      const ratio = Math.min(1,elapsed / duration);
      bar.style.width = ratio * 100 + '%';
      time.textContent = `0:${String(Math.floor(elapsed / 1000)).padStart(2,'0')} / 0:12`;
      if (elapsed < 2800) { caption.textContent = '数字の「3」をよく見よう'; resetBoard(board); }
      else if (elapsed < 7600) { caption.textContent = '3番目の珠をタッチすると、3つ光るよ'; setColumnValue(board,1,3,'blue'); }
      else { caption.textContent = 'できた！ 次はまねっこしてみよう'; setColumnValue(board,1,3); }
      if (elapsed >= duration) {
        clearInterval(intervalTimer);
        correctEffect(true);
        screenTimer = setTimeout(() => finishNode('video',true),900);
      }
    };
    intervalTimer = setInterval(tick,100);
    document.getElementById('lessonPause').onclick = () => {
      paused = !paused;
      document.getElementById('lessonPause').textContent = paused ? '▶' : 'Ⅱ';
      showToast(paused ? 'いったん休憩' : 'つづきを見る');
    };
  }

  function renderMimic() {
    const targets = [2,3,1,4,2,3,4];
    let round = 0;
    let phase = 'demo';
    let roundMistake = false;
    let locked = false;
    setScreen(`<section class="screen activity-screen" id="mimicScreen">
      ${gameHeader('まねっこ','map')}
      <div class="activity-body"><div class="prompt-area"><div class="prompt-model" id="modelValue">2</div><div class="prompt-answer" id="answerValue">?</div></div><div class="flower-target" id="flowerTarget" style="position:absolute;left:50%;top:6%;transform:translateX(-50%)">✿</div><div class="soroban-wrap two">${boardHTML('mimicBoard',2)}</div><div class="activity-tools"><button class="activity-tool" data-action="undo" aria-label="やり直し">↶</button><button class="activity-tool hint" data-action="hint" aria-label="ヒント">💡</button></div><div class="activity-hand" id="mimicHand">☝</div><div class="round-badge"><span id="mimicRound">1</span></div></div>${sideTabs()}
    </section>`);
    const board = document.getElementById('mimicBoard');
    const model = document.getElementById('modelValue');
    const answer = document.getElementById('answerValue');
    const hand = document.getElementById('mimicHand');
    const badge = document.getElementById('mimicRound');
    function demo() {
      locked = true; phase = 'demo'; roundMistake = false;
      const target = targets[round];
      model.textContent = String(target); answer.textContent = '?'; answer.style.color = '#ff1717'; badge.textContent = String(round + 1);
      resetBoard(board); setColumnValue(board,1,target,'blue'); hand.hidden = false;
      screenTimer = setTimeout(() => { resetBoard(board); phase = 'input'; locked = false; hand.hidden = true; },1250);
    }
    bindBoard(board,values => {
      if (locked || phase !== 'input') { resetBoard(board); return; }
      const target = targets[round];
      const left = values[0], right = values[1];
      if (left !== 0 || right > target) {
        if (!roundMistake) { roundMistake = true; wrongEffect('お手本と同じ場所をタッチしよう'); }
        resetBoard(board); return;
      }
      if (right === target) {
        locked = true; phase = 'correct'; answer.textContent = String(target); answer.style.color = '#00ee32';
        state.totalCorrect += 1; save();
        correctEffect((round + 1) % 3 === 0);
        round += 1;
        if (round >= targets.length) { screenTimer = setTimeout(() => finishNode('mimic'),900); }
        else screenTimer = setTimeout(demo,850);
      } else if (right > 0 && !roundMistake) {
        roundMistake = true; wrongEffect('押す珠をよく見てね');
      }
    });
    document.querySelector('[data-action="undo"]').onclick = () => { if (!locked) resetBoard(board); sound('tap'); };
    document.querySelector('[data-action="hint"]').onclick = () => {
      if (locked) return;
      hand.hidden = false; setColumnValue(board,1,targets[round],'blue');
      showToast('ここをタッチ！');
      setTimeout(() => { resetBoard(board); hand.hidden = true; },900);
    };
    demo();
  }

  function renderNumberPractice() {
    const totalQuestions = 40;
    let question = 0;
    let target = randomDigit();
    let locked = false;
    let questionMistake = false;
    setScreen(`<section class="screen activity-screen">
      <button class="back-button" style="position:absolute;left:1.3cqw;top:1.6cqh;z-index:8" data-action="map">←</button>
      <div class="progress-pill"><span>A1 たまおき</span><strong><span id="numberProgress">1</span>/40</strong></div><div class="star-meter" id="starMeter">${Array.from({length:10},()=>'<span>★</span>').join('')}</div>
      <div class="activity-body"><div class="prompt-area" style="top:7cqh"><div class="prompt-model" id="numberTarget" style="color:white;font-size:6cqw">${target}</div></div><div class="soroban-wrap two">${boardHTML('numberBoard',2)}</div><div class="activity-tools"><button class="activity-tool" data-action="undo">↶</button></div></div>${sideTabs()}
    </section>`);
    const board = document.getElementById('numberBoard');
    const targetEl = document.getElementById('numberTarget');
    const progress = document.getElementById('numberProgress');
    function randomDigit(previous = 0) { let n; do n = 1 + Math.floor(Math.random() * 4); while(n === previous); return n; }
    function next() {
      locked = false; questionMistake = false; resetBoard(board);
      target = randomDigit(target); targetEl.textContent = String(target); progress.textContent = String(question + 1);
      [...document.querySelectorAll('#starMeter span')].forEach((star,index) => star.classList.toggle('lit', index < Math.floor(question / 4)));
    }
    bindBoard(board,values => {
      if (locked) return;
      const left = values[0], right = values[1];
      if (left !== 0 || right > target || Number(document.activeElement?.dataset?.value) === 5) {
        if (!questionMistake) { questionMistake = true; wrongEffect('数字と珠をもう一度見よう'); }
        locked = true; screenTimer = setTimeout(() => { locked = false; resetBoard(board); },380); return;
      }
      if (right === target) {
        locked = true; question += 1; state.totalCorrect += 1; save();
        const big = question % 5 === 0;
        correctEffect(big);
        if (big) confetti(25);
        if (question >= totalQuestions) screenTimer = setTimeout(() => finishNode('number'),850);
        else screenTimer = setTimeout(next,big ? 650 : 330);
      } else if (right > 0 && !questionMistake) {
        questionMistake = true; wrongEffect('その珠で合っているかな？');
      }
    });
    document.querySelector('[data-action="undo"]').onclick = () => { if (!locked) resetBoard(board); sound('tap'); };
  }

  function renderKaruta() {
    let seconds = 30;
    let score = 0;
    let target = 1 + Math.floor(Math.random() * 4);
    let locked = false;
    const cards = shuffle([1,2,3,4]);
    setScreen(`<section class="screen karuta-screen">
      <header class="karuta-titlebar"><button class="back-button" data-action="map">←</button>${userPlate()}<div class="karuta-title">かるた</div><div class="karuta-range">1〜4</div></header>
      <div class="karuta-main"><div class="balloon-mascot"><div class="balloon-face">★</div><div class="balloon-ropes"></div><div class="balloon-basket"></div></div><div class="karuta-prompt" id="karutaTarget">${target}</div><div class="karuta-grid" id="karutaGrid">${cards.map(value => `<button class="karuta-card" data-value="${value}" aria-label="${value}のカード">${miniBoardHTML(value)}</button>`).join('')}</div><div class="timer-rail"><i class="timer-ball" id="timerBall"></i></div><div class="score-bubble" id="karutaScore">0</div><div class="timer-text"><span id="karutaTime">30</span>秒</div></div>${sideTabs()}
    </section>`);
    const targetEl = document.getElementById('karutaTarget');
    const scoreEl = document.getElementById('karutaScore');
    const timeEl = document.getElementById('karutaTime');
    const ball = document.getElementById('timerBall');
    document.getElementById('karutaGrid').addEventListener('click',event => {
      const card = event.target.closest('.karuta-card');
      if (!card || locked) return;
      const picked = Number(card.dataset.value);
      if (picked === target) {
        locked = true; score += 1; state.totalCorrect += 1; save();
        scoreEl.textContent = String(score); correctEffect(score % 5 === 0);
        card.style.transform = 'scale(.82) rotate(4deg)'; card.style.filter = 'brightness(1.5)';
        setTimeout(() => { target = nextTarget(target); targetEl.textContent = String(target); card.style.transform = ''; card.style.filter = ''; locked = false; },230);
      } else { wrongEffect('ちがう珠だよ！'); card.animate([{transform:'rotate(-4deg)'},{transform:'rotate(4deg)'},{transform:'rotate(0)'}],{duration:260}); }
    });
    intervalTimer = setInterval(() => {
      seconds -= 1; timeEl.textContent = String(seconds); ball.style.setProperty('--time-left', seconds / 30 * 100 + '%'); sound('count');
      if (seconds <= 0) { clearInterval(intervalTimer); renderKarutaResult(score); }
    },1000);
  }
  function shuffle(array) { return array.map(value => ({value,sort:Math.random()})).sort((a,b) => a.sort - b.sort).map(item => item.value); }
  function nextTarget(previous) { let value; do value = 1 + Math.floor(Math.random() * 4); while(value === previous); return value; }

  function renderKarutaResult(score) {
    setScreen(`<section class="screen result-screen">${sideTabs()}<div class="result-panel"><h1>ゲームクリア！</h1><strong>${score}まい ゲット！</strong></div></section>`);
    sound('reward'); confetti(100); vibrate([50,35,80,40,120]);
    screenTimer = setTimeout(() => finishNode('karuta'),2400);
  }

  function finishNode(type, noGift = false) {
    if (!state.completed.includes(type)) state.completed.push(type);
    save();
    if (noGift) { showLoading(renderMap,950); return; }
    showGift(() => {
      if (state.completed.length >= FLOW.length) showLoading(renderMissionDecision,900);
      else showLoading(renderMap,900);
    });
  }
  function showGift(next) {
    const gift = GIFTS[Math.floor(Math.random() * GIFTS.length)];
    setScreen(`<section class="screen gift-screen"><div class="gift-circle"><span class="gift-sparkle one">✦</span><span class="gift-sparkle two">✦</span><div class="gift-object">🎁</div></div></section>`);
    sound('reward'); confetti(70);
    screenTimer = setTimeout(() => {
      document.querySelector('.gift-object').textContent = gift.icon;
      burst('プレゼント！'); sound('reward'); vibrate([40,30,70]);
      screenTimer = setTimeout(() => {
        rewardOverlay.hidden = false;
        document.getElementById('rewardIcon').textContent = gift.icon;
        document.getElementById('rewardTitle').textContent = gift.title;
        document.getElementById('rewardMessage').textContent = gift.message;
        screenTimer = setTimeout(() => { rewardOverlay.hidden = true; next(); },1800);
      },650);
    },900);
  }

  function renderMissionDecision() {
    if (state.mistakes >= 3) {
      setScreen(`<section class="screen result-screen"><div class="result-panel"><h1>よくがんばったね！</h1><strong>A1をもう一度れんしゅうしよう</strong><p>まちがい ${state.mistakes}回</p><button class="continue-button" data-action="retry-mission">もう一度やる</button></div></section>`);
      sound('correct'); return;
    }
    renderFlagWin();
  }
  function renderFlagWin() {
    const flag = selectedFlagItem();
    setScreen(`<section class="screen flag-win star-bg"><div class="flag-win-card"><div class="big-flag">${flagGraphic(flag.code, flag.name)}</div><h1>MISSION CLEAR!</h1><p>${flag.name}の国旗GET！ A1クリア！</p><button class="continue-button" data-action="next-mission">つぎへ</button></div></section>`);
    sound('flag'); confetti(150); vibrate([60,30,80,35,140]);
  }

  function openSettings() {
    document.getElementById('nameInput').value = state.name;
    document.getElementById('volumeInput').value = state.prefs.volume;
    document.getElementById('vibrationInput').checked = state.prefs.vibration;
    document.getElementById('motionInput').checked = state.prefs.motion;
    document.getElementById('settingsDevices').innerHTML = deviceButtons(true).replace(/^<div[^>]*>|<\/div>$/g,'');
    settingsDialog.showModal();
  }
  function openParent() {
    const progress = Math.round(state.completed.length / FLOW.length * 100);
    document.getElementById('parentStats').innerHTML = `<div class="parent-stat"><strong>${state.stage}</strong><span>現在のステージ</span></div><div class="parent-stat"><strong>${progress}%</strong><span>今回の進み具合</span></div><div class="parent-stat"><strong>${state.mistakes}</strong><span>今回のミス</span></div><div class="parent-stat"><strong>${state.dailyClears}/3</strong><span>今日の面</span></div><div class="parent-stat"><strong>${state.totalCorrect}</strong><span>累計正解</span></div><div class="parent-stat"><strong>端末内</strong><span>保存方法</span></div>`;
    parentDialog.showModal();
  }
  function saveSettings() {
    state.name = document.getElementById('nameInput').value.trim().slice(0,12) || 'ゲスト';
    state.prefs.volume = Number(document.getElementById('volumeInput').value);
    state.prefs.vibration = document.getElementById('vibrationInput').checked;
    state.prefs.motion = document.getElementById('motionInput').checked;
    document.body.classList.toggle('motion-off',!state.prefs.motion);
    save(); sound('tap');
  }
  function selectDevice(device) {
    if (!['phone','tablet','pc'].includes(device)) return;
    state.device = device; document.body.dataset.device = device; save(); sound('tap');
    document.querySelectorAll('.device-choice').forEach(button => { const selected = button.dataset.device === device; button.classList.toggle('selected',selected); button.setAttribute('aria-pressed',String(selected)); });
  }
  function resetAttempt(newFlags = false) { state.completed = []; state.mistakes = 0; if (newFlags) state.flagOffer = []; save(); }

  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'device') { selectDevice(target.dataset.device); return; }
    if (action === 'settings') { openSettings(); return; }
    if (action === 'parent') { openParent(); return; }
    if (action === 'start') {
      sound('reward'); vibrate(35);
      showLoading(renderMissionSelect,1000); return;
    }
    if (action === 'start-back') { renderStart(); return; }
    if (action === 'mission-select') { renderMissionSelect(); return; }
    if (action === 'map') { renderMap(); return; }
    if (action === 'flag') { const item = FLAGS[Number(target.dataset.index)]; if (!item || item.locked) return; state.selectedFlag = item.code; save(); sound('correct'); showLoading(renderMap,900); return; }
    if (action === 'node') {
      const index = Number(target.dataset.index);
      if (index !== state.completed.length) { sound('wrong'); showToast(index < state.completed.length ? 'ここはクリア済み！' : '前のアイコンから進もう'); return; }
      const type = FLOW[index];
      if (type === 'video') renderLesson();
      if (type === 'mimic') renderMimic();
      if (type === 'number') renderNumberPractice();
      if (type === 'karuta') renderKaruta();
      return;
    }
    if (action === 'activity-back') { renderMap(); return; }
    if (action === 'retry-mission') { resetAttempt(true); showLoading(renderMissionSelect,850); return; }
    if (action === 'next-mission') {
      const wonFlag = selectedFlagItem();
      state.flagCollection[wonFlag.code] = Number(state.flagCollection[wonFlag.code] || 0) + 1;
      state.dailyClears += 1;
      state.internalMission += 1;
      resetAttempt(true);
      showLoading(renderMissionSelect,850);
      return;
    }
  });

  settingsDialog.addEventListener('click',event => {
    const device = event.target.closest('[data-device]');
    if (device) selectDevice(device.dataset.device);
  });
  document.getElementById('saveSettings').addEventListener('click',saveSettings);
  document.getElementById('volumeInput').addEventListener('input',event => { state.prefs.volume = Number(event.target.value); sound('tap'); });
  document.getElementById('resetProgress').addEventListener('click',() => {
    if (!confirm('A1の進み具合を最初に戻しますか？')) return;
    state = { ...structuredClone(defaults), name:state.name, device:state.device, prefs:{...state.prefs}, dailyDate:todayKey() };
    save(); settingsDialog.close(); renderStart(); showToast('A1を最初に戻しました');
  });
  document.getElementById('installButton').addEventListener('click',async() => {
    if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; document.getElementById('installButton').hidden = true; }
  });
  window.addEventListener('beforeinstallprompt',event => { event.preventDefault(); installPrompt = event; document.getElementById('installButton').hidden = false; });
  window.addEventListener('blur',() => { activePointers.forEach(point => point.bead.classList.remove('pressed')); activePointers.clear(); });
  document.addEventListener('gesturestart',event => event.preventDefault(),{passive:false});
  document.addEventListener('touchmove',event => { if (event.touches.length > 1) event.preventDefault(); },{passive:false});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load',() => navigator.serviceWorker.register('./sw.js?v=8'));

  renderStart();
})();
