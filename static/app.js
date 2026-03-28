/**
 * app.js — Fight log playback state machine.
 * Manages state, UI updates, and drives Renderer.
 */
(() => {
  // ── State ────────────────────────────────────────────────────────────────────
  let fightLog      = null;
  let rounds        = [];
  let currentRound  = -1;
  let isPlaying     = false;
  let playTimer     = null;
  let playbackSpeed = 1500;

  // ── DOM ──────────────────────────────────────────────────────────────────────
  const canvas      = document.getElementById('ring');
  const fightTitle  = document.getElementById('fight-title');
  const roundNumber = document.getElementById('round-number');
  const roundOf     = document.getElementById('round-of');
  const calloutF1   = document.getElementById('callout-f1');
  const calloutF2   = document.getElementById('callout-f2');
  const commentary  = document.getElementById('commentary-text');

  const hpBarF1  = document.getElementById('hp-bar-f1');
  const hpBarF2  = document.getElementById('hp-bar-f2');
  const stBarF1  = document.getElementById('st-bar-f1');
  const stBarF2  = document.getElementById('st-bar-f2');
  const hpValF1  = document.getElementById('hp-val-f1');
  const hpValF2  = document.getElementById('hp-val-f2');
  const stValF1  = document.getElementById('st-val-f1');
  const stValF2  = document.getElementById('st-val-f2');

  const nameF1   = document.getElementById('name-f1');
  const nameF2   = document.getElementById('name-f2');

  const btnPlay    = document.getElementById('btn-play');
  const btnPrev    = document.getElementById('btn-prev');
  const btnNext    = document.getElementById('btn-next');
  const btnRestart = document.getElementById('btn-restart');
  const btnLoad    = document.getElementById('btn-load');
  const fileInput  = document.getElementById('log-file-input');
  const speedSel   = document.getElementById('speed-select');

  const timelineFill  = document.getElementById('timeline-fill');
  const timelineLabel = document.getElementById('timeline-label');

  const distIndicator   = document.getElementById('distance-indicator');
  const overlay         = document.getElementById('result-overlay');
  const resultWinner    = document.getElementById('result-winner');
  const resultMethod    = document.getElementById('result-method');
  const resultStats     = document.getElementById('result-stats');
  const btnCloseResult  = document.getElementById('btn-close-result');

  // ── Init ─────────────────────────────────────────────────────────────────────
  Renderer.init(canvas);

  // ── Load ─────────────────────────────────────────────────────────────────────
  async function loadFromURL(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      loadFightLog(await res.json());
    } catch (e) {
      commentary.textContent = `Could not load fight_log.json (${e.message}). Use LOAD LOG to pick a file.`;
    }
  }

  function loadFightLog(data) {
    fightLog     = data;
    rounds       = data.rounds || [];
    currentRound = -1;
    isPlaying    = false;
    _clearTimer();
    overlay.classList.add('hidden');

    const meta  = data.metadata || {};
    const f1cfg = meta.fighter1_config || {};
    const f2cfg = meta.fighter2_config || {};
    const maxRounds = (meta.config && meta.config.max_rounds) || 12;

    nameF1.textContent = f1cfg.display_name || 'FIGHTER 1';
    nameF2.textContent = f2cfg.display_name || 'FIGHTER 2';
    fightTitle.textContent = `${f1cfg.display_name || 'F1'}  VS  ${f2cfg.display_name || 'F2'}`;
    roundOf.textContent = `of ${maxRounds}`;
    roundNumber.textContent = '—';

    _hideCallouts();
    _setCommentary(`Fight loaded · ${rounds.length} rounds · Press ▶ to play`);
    _resetBars();
    _updateTimeline();
    _updatePlayBtn();
    Renderer.drawIdle();
  }

  // ── Playback ─────────────────────────────────────────────────────────────────
  function goToRound(idx) {
    if (!fightLog || rounds.length === 0) return;
    if (idx < 0) idx = 0;
    if (idx >= rounds.length) { showResult(); return; }

    currentRound = idx;
    const r  = rounds[idx];
    const f1 = r.fighter1;
    const f2 = r.fighter2;

    roundNumber.textContent = r.round_number;
    _setCallout(calloutF1, f1.move_executed);
    _setCallout(calloutF2, f2.move_executed);
    _setCommentary(r.commentary || '…');

    _setBar(hpBarF1, f1.hp_after, 100);
    _setBar(hpBarF2, f2.hp_after, 100);
    _setBar(stBarF1, f1.stamina_after, 100);
    _setBar(stBarF2, f2.stamina_after, 100);
    hpValF1.textContent = f1.hp_after;
    hpValF2.textContent = f2.hp_after;
    stValF1.textContent = f1.stamina_after;
    stValF2.textContent = f2.stamina_after;

    _updateTimeline();
    _colorHP(hpBarF1, f1.hp_after);
    _colorHP(hpBarF2, f2.hp_after);

    // Distance
    const distBefore = r.distance_before ?? 1;
    const distAfter  = r.distance_after  ?? 1;
    _updateDistance(distAfter);

    Renderer.animateRound(
      f1.move_executed,
      f2.move_executed,
      f1.damage_taken,
      f2.damage_taken,
      distBefore,
      distAfter,
      null
    );
  }

  function showResult() {
    _clearTimer();
    isPlaying = false;
    _updatePlayBtn();
    if (!fightLog || !fightLog.result) return;

    const r    = fightLog.result;
    const meta = fightLog.metadata || {};
    const f1n  = (meta.fighter1_config || {}).display_name || 'F1';
    const f2n  = (meta.fighter2_config || {}).display_name || 'F2';
    const s1   = r.fighter1_stats || {};
    const s2   = r.fighter2_stats || {};

    resultWinner.textContent = r.winner ? `${r.winner} WINS` : 'DRAW';
    resultMethod.textContent = `by ${r.method}  ·  ${r.rounds_fought} round${r.rounds_fought !== 1 ? 's' : ''}`;
    resultStats.innerHTML = [
      `<span style="color:#e84b4b">${f1n}</span>  ${s1.total_damage_dealt ?? '—'} dmg · ${s1.successful_dodges ?? 0} dodges`,
      `<span style="color:#4b9ee8">${f2n}</span>  ${s2.total_damage_dealt ?? '—'} dmg · ${s2.successful_dodges ?? 0} dodges`,
      r.final_score ? `Score  ${r.final_score.fighter1} – ${r.final_score.fighter2}` : '',
    ].filter(Boolean).join('<br>');

    overlay.classList.remove('hidden');
  }

  function _advance() {
    if (!fightLog) return;
    const next = currentRound + 1;
    if (next >= rounds.length) showResult();
    else goToRound(next);
  }

  function _startPlay() {
    isPlaying = true;
    _updatePlayBtn();
    _scheduleNext();
  }

  function _pausePlay() {
    isPlaying = false;
    _clearTimer();
    _updatePlayBtn();
  }

  function _scheduleNext() {
    _clearTimer();
    playTimer = setTimeout(() => {
      _advance();
      if (isPlaying && currentRound < rounds.length - 1) _scheduleNext();
      else if (isPlaying) showResult();
    }, playbackSpeed);
  }

  function _clearTimer() {
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function _setBar(el, val, max) {
    el.style.width = Math.max(0, Math.min(100, (val / max) * 100)) + '%';
  }

  function _colorHP(el, val) {
    if (val > 50)      el.style.background = 'linear-gradient(90deg,#902828,#e84b4b)';
    else if (val > 25) el.style.background = 'linear-gradient(90deg,#a05010,#e88020)';
    else               el.style.background = 'linear-gradient(90deg,#802020,#cc2020)';
  }

  function _resetBars() {
    _setBar(hpBarF1, 100, 100); _setBar(hpBarF2, 100, 100);
    _setBar(stBarF1, 100, 100); _setBar(stBarF2, 100, 100);
    hpValF1.textContent = '100'; hpValF2.textContent = '100';
    stValF1.textContent = '100'; stValF2.textContent = '100';
    [hpBarF1, hpBarF2].forEach(b => b.style.background = '');
    _updateDistance(1); // reset to mid
  }

  const DIST_LABELS = ['OUTSIDE', 'MID', 'INSIDE'];
  const DIST_COLORS = ['#6888a0', '#e8b84b', '#e86040'];

  function _updateDistance(level) {
    if (!distIndicator) return;
    distIndicator.textContent = DIST_LABELS[level] || 'MID';
    distIndicator.style.color = DIST_COLORS[level] || DIST_COLORS[1];
  }

  let commentaryTimer = null;
  function _setCommentary(text) {
    if (commentaryTimer) clearTimeout(commentaryTimer);
    commentary.classList.add('fade');
    commentaryTimer = setTimeout(() => {
      commentary.textContent = text;
      commentary.classList.remove('fade');
    }, 160);
  }

  function _setCallout(el, move) {
    el.textContent = move.toUpperCase();
    el.classList.remove('visible');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
  }

  function _hideCallouts() {
    calloutF1.classList.remove('visible');
    calloutF2.classList.remove('visible');
    calloutF1.textContent = '';
    calloutF2.textContent = '';
  }

  function _updatePlayBtn() {
    btnPlay.textContent = isPlaying ? '⏸' : '▶';
  }

  function _updateTimeline() {
    const total = rounds.length;
    const cur   = currentRound + 1;
    const pct   = total > 0 ? (cur / total) * 100 : 0;
    timelineFill.style.width  = pct + '%';
    timelineLabel.textContent = `${cur} / ${total}`;
  }

  // ── Events ───────────────────────────────────────────────────────────────────
  btnPlay.addEventListener('click', () => {
    if (!fightLog) return;
    if (isPlaying) { _pausePlay(); return; }
    if (currentRound >= rounds.length - 1) {
      // Replay
      currentRound = -1;
      _resetBars();
      roundNumber.textContent = '—';
      _hideCallouts();
      _updateTimeline();
      Renderer.drawIdle();
    }
    _startPlay();
  });

  btnNext.addEventListener('click', () => { _pausePlay(); _advance(); });

  btnPrev.addEventListener('click', () => {
    _pausePlay();
    if (currentRound > 0) goToRound(currentRound - 1);
    else if (currentRound === 0) {
      currentRound = -1;
      _resetBars();
      roundNumber.textContent = '—';
      _hideCallouts();
      _setCommentary('Press ▶ to play.');
      _updateTimeline();
      Renderer.drawIdle();
    }
  });

  btnRestart.addEventListener('click', () => {
    _pausePlay();
    currentRound = -1;
    _resetBars();
    roundNumber.textContent = '—';
    _hideCallouts();
    _setCommentary('Press ▶ to play.');
    _updateTimeline();
    overlay.classList.add('hidden');
    Renderer.drawIdle();
  });

  speedSel.addEventListener('change', () => {
    playbackSpeed = parseInt(speedSel.value, 10);
  });

  btnLoad.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try { loadFightLog(JSON.parse(e.target.result)); }
      catch (err) { commentary.textContent = `Invalid file: ${err.message}`; }
    };
    reader.readAsText(file);
  });

  btnCloseResult.addEventListener('click', () => overlay.classList.add('hidden'));

  // Click timeline to seek
  document.getElementById('timeline-track').addEventListener('click', e => {
    if (!fightLog || rounds.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    const idx  = Math.max(0, Math.min(rounds.length - 1, Math.floor(pct * rounds.length)));
    _pausePlay();
    goToRound(idx);
  });

  // Auto-load on startup
  loadFromURL('fight_log.json');
})();
