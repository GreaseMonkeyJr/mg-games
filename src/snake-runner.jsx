import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const COLS         = 3;
const VISIBLE_ROWS = 14;
const CELL_W       = 80;
const CELL_H       = 56;
// Speed: fwdSpeed = BASE_SPEED + score * SPEED_PER_ROW, capped at MAX_SPEED
const BASE_SPEED    = 0.13;  // px/ms at start (~7 rows/sec)
const MAX_SPEED     = 0.32;  // px/ms at cap  (~18 rows/sec)
const SPEED_PER_ROW = 0.0004; // added per row crossed

const TILE = 40;  // grass texture tile size

// Lateral snap speed — crosses one lane (80px) in ~70ms; feels instant
const LATERAL_SPEED = 1.2;  // px/ms

// Snake visuals
const BODY_R      = 12;
const PATH_SUBSAMPLE = 4; // record a point every N px of movement
const SNAKE_HEAD  = "#4ade80";
const SNAKE_BODY  = "#22c55e";
const SNAKE_DARK  = "#15803d";
// Lane grass colours
const LANE_COLORS = ["#3a7d2c", "#4a9a38", "#3a7d2c"];

// How many path samples the initial snake body spans
const INIT_BODY_PX  = 100; // initial body length in px


// ─── Snake Skins ──────────────────────────────────────────────────────────────
const SKINS = [
  { id:"classic",  name:"Classic",   head:"#4ade80", body:"#22c55e", dark:"#15803d", stripe:"#86efac", unlock:null },
  { id:"fire",     name:"Fire",      head:"#fb923c", body:"#ef4444", dark:"#991b1b", stripe:"#fca5a5", unlock:"score200" },
  { id:"ocean",    name:"Ocean",     head:"#38bdf8", body:"#0ea5e9", dark:"#0369a1", stripe:"#bae6fd", unlock:"mice50" },
  { id:"golden",   name:"Golden",    head:"#fde68a", body:"#f59e0b", dark:"#92400e", stripe:"#fef3c7", unlock:"score500" },
  { id:"shadow",   name:"Shadow",    head:"#a78bfa", body:"#7c3aed", dark:"#3b0764", stripe:"#ddd6fe", unlock:"shieldblock" },
  { id:"toxic",    name:"Toxic",     head:"#ecfccb", body:"#84cc16", dark:"#365314", stripe:"#d9f99d", unlock:"mice100" },
  { id:"legend",   name:"Legend",    head:"#4a3020", body:"#2a1a0a", dark:"#150d05", stripe:"#c8955a", unlock:"allachievements", special:"realhead" },
];

// ─── Achievements ─────────────────────────────────────────────────────────────
const ACHIEVEMENTS = [
  { id:"score100",  icon:"🌱", name:"Hatchling",      desc:"Reach a score of 100",          check: s => s.bestScore >= 100 },
  { id:"score200",  icon:"🔥", name:"On Fire",         desc:"Reach a score of 200",          check: s => s.bestScore >= 200, unlocksSkin:"fire" },
  { id:"score500",  icon:"👑", name:"Snake King",      desc:"Reach a score of 500",          check: s => s.bestScore >= 500, unlocksSkin:"golden" },
  { id:"mice50",    icon:"🐭", name:"Rat Catcher",     desc:"Collect 50 mice total",         check: s => s.totalMice >= 50,  unlocksSkin:"ocean" },
  { id:"mice100",   icon:"🐀", name:"Exterminator",    desc:"Collect 100 mice total",        check: s => s.totalMice >= 100, unlocksSkin:"toxic" },
  { id:"shieldblock", icon:"🛡️", name:"Bulletproof",    desc:"Survive a box hit with a shield", check: s => s.shieldBlocks >= 1, unlocksSkin:"shadow" },
  { id:"survival",  icon:"⏱️", name:"Survivor",        desc:"Cross 300 rows in one run",     check: s => s.bestScore >= 300 },
  { id:"firstmice", icon:"🎯", name:"First Catch",     desc:"Collect your first mouse",      check: s => s.totalMice >= 1 },
  { id:"games5",    icon:"🎮", name:"Dedicated",       desc:"Play 5 games",                  check: s => s.gamesPlayed >= 5 },
  { id:"games20",   icon:"🏅", name:"Veteran",         desc:"Play 20 games",                 check: s => s.gamesPlayed >= 20 },
];

// ─── Persistent user stats ────────────────────────────────────────────────────
const EMPTY_STATS = () => ({ bestScore:0, totalMice:0, totalShields:0, shieldBlocks:0, gamesPlayed:0, achievements:[], unlockedSkins:["classic"] });
async function loadUserStats(username) {
  const key = "stats:" + username.toLowerCase();
  try {
    const r = await window.storage.get(key, true).catch(() => null);
    if (r && r.value) return JSON.parse(r.value);
    const r2 = await window.storage.get(key, false).catch(() => null);
    if (r2 && r2.value) {
      await window.storage.set(key, r2.value, true).catch(() => null);
      return JSON.parse(r2.value);
    }
    return EMPTY_STATS();
  } catch { return EMPTY_STATS(); }
}
async function saveUserStats(username, stats) {
  const key = "stats:" + username.toLowerCase();
  const val = JSON.stringify(stats);
  try { await window.storage.set(key, val, true); } catch(e) { console.error("[storage] saveUserStats shared error", e); }
  try { await window.storage.set(key, val, false); } catch(e) { console.error("[storage] saveUserStats personal error", e); }
}
async function loadSelectedSkin(username) {
  try {
    const r = await window.storage.get("skin:" + username.toLowerCase(), true);
    return (r && r.value) ? r.value : "classic";
  } catch { return "classic"; }
}
async function saveSelectedSkin(username, skinId) {
  try { await window.storage.set("skin:" + username.toLowerCase(), skinId, true); } catch {}
}

// ─── Profile photo ───────────────────────────────────────────────────────────
async function loadPfp(username) {
  try {
    const r = await window.storage.get("pfp:" + username.toLowerCase(), true);
    return (r && r.value) ? r.value : null;
  } catch { return null; }
}
async function savePfp(username, dataUrl) {
  try { await window.storage.set("pfp:" + username.toLowerCase(), dataUrl, true); } catch {}
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────
async function fetchLeaderboard() {
  try { const r = await window.storage.get("leaderboard", true); return r ? JSON.parse(r.value) : []; }
  catch { return []; }
}
async function saveLeaderboard(e) {
  try { await window.storage.set("leaderboard", JSON.stringify(e), true); } catch {}
}
async function submitScore(username, score) {
  const board = await fetchLeaderboard();
  const existing = board.find(e => e.username === username);
  if (!existing || score > existing.score) {
    const filtered = board.filter(e => e.username !== username);
    filtered.push({ username, score, date: new Date().toLocaleDateString() });
    filtered.sort((a, b) => b.score - a.score);
    await saveLeaderboard(filtered.slice(0, 20));
  }
}

// ─── Level generator ──────────────────────────────────────────────────────────
// Rules:
//  1. No box in the same lane as a box in the previous row (no vertical stack).
//  2. No diagonal trap: if placing a box in lane X would leave ONLY lanes
//     adjacent to a prev-row box as the escape, it's blocked. Concretely:
//     after placing, at least one open lane must be non-adjacent to all prev boxes.
//  3. No double-box row after any row that had boxes.
//  4. At least one lane always open.
function generateRow(rowIndex, prevCells) {
  const cells = [null, null, null];
  if (rowIndex < 12) return cells;

  const prevBoxed = prevCells ? [0,1,2].filter(l => prevCells[l] === "box") : [];
  const wasAnyBox = prevBoxed.length > 0;

  // A lane is "safe to box" only if:
  //  - it wasn't boxed in the prev row (no vertical stack)
  //  - it isn't adjacent to ALL prev-row boxes in a way that creates a diagonal trap
  // Simpler rule that covers all cases: never box a lane that is adjacent (±1)
  // to ANY prev-row box. This guarantees the open lanes are always fully reachable.
  function isSafeToBox(lane) {
    if (prevBoxed.includes(lane)) return false;          // no vertical stack
    for (const pb of prevBoxed) {
      if (Math.abs(lane - pb) === 1) return false;       // no diagonal
    }
    return true;
  }

  const safeToBox = [0,1,2].filter(isSafeToBox);

  // If no safe lanes to box (e.g. prev row had box in lane 1 → lanes 0,1,2 all blocked),
  // just skip obstacles this row entirely.
  if (safeToBox.length === 0) return cells;

  const rand = Math.random();

  if (rand < 0.18) {
    // Mouse — any lane is fine
    cells[Math.floor(Math.random() * 3)] = "mouse";

  } else if (rand < 0.58) {
    // Single box from safe lanes only
    cells[safeToBox[Math.floor(Math.random() * safeToBox.length)]] = "box";

  } else if (rand < 0.72 && !wasAnyBox && safeToBox.length >= 2) {
    // Double box — only when prev row was completely clear
    // Keep one safe lane open, box the other safe lane(s)
    const keepIdx = Math.floor(Math.random() * safeToBox.length);
    safeToBox.forEach((l, i) => { if (i !== keepIdx) cells[l] = "box"; });
  }

  return cells;
}

function laneX(lane, offsetX) { return offsetX + lane * CELL_W + CELL_W / 2; }


// ─── Main Component ───────────────────────────────────────────────────────────
export default function SnakeRunner() {
  const [screen, setScreen]           = useState("login");
  const [username, setUsername]       = useState("");
  const [inputName, setInputName]     = useState("");
  const [loginError, setLoginError]   = useState("");
  const [leaderboard, setLeaderboard] = useState([]);
  const [finalScore, setFinalScore]   = useState(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [shieldSecs, setShieldSecs]     = useState(0);
  const [miceDisplay, setMiceDisplay]   = useState(0);
  const [userStats, setUserStats]       = useState(null);
  const [newAchievements, setNewAchievements] = useState([]); // just-unlocked popups
  const [selectedSkin, setSelectedSkin] = useState("classic");
  const selectedSkinRef = useRef("classic");
  const userStatsRef = useRef(null);
  const usernameRef = useRef("");
  const [gameRunning, setGameRunning]   = useState(false);
  const [controlMode, setControlMode]   = useState('tap'); // 'tap' | 'swipe'
  const [pfpUrl, setPfpUrl]               = useState(null);
  const pfpInputRef = useRef(null);

  const [saveCode, setSaveCode]           = useState('');
  const [restoreCode, setRestoreCode]     = useState('');
  const [restoreMsg, setRestoreMsg]       = useState('');

  const canvasRef   = useRef(null);
  const gsRef       = useRef(null);
  const animRef     = useRef(null);
  const lastDrawRef = useRef(0);


  const loadLeaderboard = useCallback(async () => {
    setLeaderboard(await fetchLeaderboard());
  }, []);
  useEffect(() => {
    if (screen === "leaderboard" || screen === "account") loadLeaderboard();
    if (screen === "account" && username) setSaveCode(generateSaveCode());
  }, [screen, loadLeaderboard]);


  // ── Save codes ────────────────────────────────────────────────────────────
  function generateSaveCode() {
    const stats = userStatsRef.current || {};
    const skin  = selectedSkinRef.current || "classic";
    const data  = { v:1, u:username, s:stats, k:skin };
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  }

  async function applyRestoreCode(code) {
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (!data || data.v !== 1) { setRestoreMsg("❌ Invalid code."); return; }
      if (data.u?.toLowerCase() !== username.toLowerCase()) {
        setRestoreMsg("❌ This code belongs to a different account."); return;
      }
      userStatsRef.current = data.s;
      setUserStats({ ...data.s });
      await saveUserStats(username, data.s);
      selectedSkinRef.current = data.k || "classic";
      setSelectedSkin(data.k || "classic");
      await saveSelectedSkin(username, data.k || "classic");
      setRestoreMsg("✅ Progress restored!");
      setTimeout(() => setRestoreMsg(''), 4000);
    } catch(e) { setRestoreMsg("❌ Invalid code."); }
  }

  // ── Music: Web Audio API (no library needed) ───────────────────────────
  const audioRef = useRef(null);   // { ctx, nodes[], intervalId }
  const [musicOn, setMusicOn] = useState(true);
  const musicOnRef = useRef(true);

  function getAudioCtx() {
    if (!audioRef.current) audioRef.current = {};
    if (!audioRef.current.ctx) {
      audioRef.current.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioRef.current.ctx;
  }

  // Play a single note: freq (Hz), type, duration (s), volume, startTime
  function playNote(ctx, freq, type, duration, vol, when) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  // Kick drum via filtered noise burst
  function playKick(ctx, when) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, when);
    osc.frequency.exponentialRampToValueAtTime(40, when + 0.15);
    gain.gain.setValueAtTime(0.6, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.2);
    osc.start(when); osc.stop(when + 0.25);
  }

  // Snare via noise
  function playSnare(ctx, when) {
    const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src2 = ctx.createBufferSource();
    src2.buffer = buf;
    const gain = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "highpass"; filt.frequency.value = 2000;
    src2.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.18, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.1);
    src2.start(when); src2.stop(when + 0.15);
  }

  // ── Sound effects ──────────────────────────────────────────────────────────
  function playEatSfx() {
    try {
      const ctx = getAudioCtx();
      if (ctx.state === "suspended") ctx.resume();
      const when = ctx.currentTime;
      // Two quick rising chirps
      [0, 0.07].forEach((offset, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(600 + i * 200, when + offset);
        osc.frequency.exponentialRampToValueAtTime(1200 + i * 200, when + offset + 0.06);
        gain.gain.setValueAtTime(0.25, when + offset);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + offset + 0.09);
        osc.start(when + offset);
        osc.stop(when + offset + 0.12);
      });
    } catch(e) {}
  }

  function playDeathSfx() {
    try {
      const ctx = getAudioCtx();
      if (ctx.state === "suspended") ctx.resume();
      const when = ctx.currentTime;
      // Descending wail
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(400, when);
      osc.frequency.exponentialRampToValueAtTime(60, when + 0.6);
      gain.gain.setValueAtTime(0.35, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.65);
      osc.start(when); osc.stop(when + 0.7);

      // Low thud
      const osc2  = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(120, when + 0.05);
      osc2.frequency.exponentialRampToValueAtTime(30, when + 0.4);
      gain2.gain.setValueAtTime(0.4, when + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.0001, when + 0.45);
      osc2.start(when + 0.05); osc2.stop(when + 0.5);
    } catch(e) {}
  }

  // G major pentatonic: G3=196, A3=220, B3=247, D4=294, E4=330, G4=392, A4=440, B4=494, D5=587, E5=659, G5=784
  const NOTES = {
    "G3":196,"A3":220,"B3":247,"D4":294,"E4":330,
    "G4":392,"A4":440,"B4":494,"D5":587,"E5":659,"G5":784,
    "G2":98,"A2":110,"B2":123,"D3":147,"E3":165,
    "G1":49,"C3":131,
  };

  const MELODY = [
    "G4","B4","D5","B4","G4","A4","B4",null,
    "D5","B4","A4","G4","A4","B4","D5","E5",
    "D5","B4","G4","B4","A4","G4","E4","G4",
    "B4","D5","E5","D5","B4","A4","G4",null,
    "E5","D5","B4","D5","E5","G5","E5","D5",
    "B4","D5","E5","D5","B4","A4","G4","A4",
    "B4","G4","A4","B4","D5","B4","A4","G4",
    "G4","A4","B4","D5","E5","D5","B4",null,
  ];
  const BASS = ["G2","G2","E3","G2","C3","A2","G2","D3"];
  const BPM = 138;
  const stepLen = 60 / BPM / 2; // eighth note in seconds

  function scheduleBeat(ctx, step) {
    if (!musicOnRef.current) return;
    const when = ctx.currentTime + 0.05;
    const i    = step % MELODY.length;
    const bar  = Math.floor(i / 8);

    // Melody (xylophone feel: triangle, short)
    if (MELODY[i]) playNote(ctx, NOTES[MELODY[i]], "triangle", 0.18, 0.15, when);

    // Bass on beat 1 of bar
    if (i % 8 === 0) playNote(ctx, NOTES[BASS[bar % BASS.length]], "triangle", 0.35, 0.25, when);

    // Pad chord every 2 bars (simple two-note fifth)
    if (i % 16 === 0) {
      playNote(ctx, NOTES["G3"], "sine", 0.9, 0.08, when);
      playNote(ctx, NOTES["D4"], "sine", 0.9, 0.06, when);
    }

    // Kick on 1 and 3
    if (i % 8 === 0 || i % 8 === 4) playKick(ctx, when);

    // Snare on 2 and 4
    if (i % 8 === 2 || i % 8 === 6) playSnare(ctx, when);
  }

  function startMusic() {
    if (!musicOnRef.current) return;
    if (audioRef.current?.intervalId) return; // already running
    const ctx = getAudioCtx();
    const doStart = () => {
      let step = 0;
      scheduleBeat(ctx, step++);
      const id = setInterval(() => {
        if (!musicOnRef.current) { clearInterval(id); audioRef.current.intervalId = null; return; }
        scheduleBeat(ctx, step++);
      }, stepLen * 1000);
      audioRef.current.intervalId = id;
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(doStart);
    } else {
      doStart();
    }
  }

  function stopMusic() {
    if (audioRef.current?.intervalId) {
      clearInterval(audioRef.current.intervalId);
      audioRef.current.intervalId = null;
    }
  }

  function toggleMusic() {
    musicOnRef.current = !musicOnRef.current;
    setMusicOn(musicOnRef.current);
    if (musicOnRef.current) startMusic();
    else stopMusic();
  }

  async function handleLogin() {
    const name = inputName.trim();
    if (!name || name.length < 2) { setLoginError("Name must be at least 2 characters."); return; }
    if (name.length > 16)         { setLoginError("Max 16 characters."); return; }

    // Start music immediately (user gesture)
    startMusic();

    // Load stats + skin before navigating
    if (!userStatsRef.current) {
      const [stats, skinId, pfp] = await Promise.all([
        loadUserStats(name),
        loadSelectedSkin(name),
        loadPfp(name),
      ]);
      userStatsRef.current = stats;
      setUserStats(stats);
      if (selectedSkinRef.current === "classic") {
        selectedSkinRef.current = skinId;
        setSelectedSkin(skinId);
      }
      if (pfp) setPfpUrl(pfp);
    } else {
      setUserStats({ ...userStatsRef.current });
    }

    usernameRef.current = name;
    setUsername(name); setLoginError(""); setScreen("game");
  }

  // ── Init game ──────────────────────────────────────────────────────────────
  const initGame = useCallback(() => {
    const rows = [];
    for (let r = 0; r < VISIBLE_ROWS + 30; r++) rows.push(generateRow(r, rows[r-1] ?? null));

    const canvas = canvasRef.current;
    const W = canvas ? canvas.width : 360;
    const offsetX = (W - COLS * CELL_W) / 2;
    const startLane = 1;
    const startRow  = 3;
    const startWorldY = startRow * CELL_H + CELL_H / 2;
    const startX      = laneX(startLane, offsetX);

    // Ring-buffer path — fixed max capacity, O(1) prepend
    // Each entry: { x, worldY }
    // We only record a point every PATH_SUBSAMPLE px of travel → far fewer points
    const MAX_PATH_PTS = 400;
    const pathBuf  = new Array(MAX_PATH_PTS).fill(null).map(() => ({ x: startX, worldY: startWorldY }));
    // Pre-fill with a straight tail going down
    for (let i = 0; i < MAX_PATH_PTS; i++) {
      pathBuf[i] = { x: startX, worldY: startWorldY - i * PATH_SUBSAMPLE };
    }

    gsRef.current = {
      rows,
      dead: false,
      score: 0,
      lastScoredRow: startRow,
      miceCollected: 0,
      shieldUntil:   0,
      shieldBlocksThisRun: 0,

      headRow:      startRow,
      scrollOffset: 0,
      targetLane:   startLane,

      headX:      startX,
      targetX:    startX,
      headWorldY: startWorldY,

      get fwdSpeed() {
        return Math.min(MAX_SPEED, BASE_SPEED + this.score * SPEED_PER_ROW);
      },

      // Ring buffer
      pathBuf,
      pathHead: 0,           // index of newest point
      pathCount: MAX_PATH_PTS,
      MAX_PATH_PTS,

      // Body length in path-points (not px)
      bodyPts:  Math.ceil(INIT_BODY_PX / PATH_SUBSAMPLE),
      growPts:  0,           // extra points to keep when growing

      // Accumulator: how many px head has traveled since last recorded point
      pathAccum: 0,
      lastRecX:  startX,
      lastRecY:  startWorldY,
    };

    setDisplayScore(0);
    setShieldSecs(0);
    setMiceDisplay(0);
    setNewAchievements([]);
    setGameRunning(true);
  }, []);

  useEffect(() => {
    if (screen === "game") { lastDrawRef.current = 0; initGame(); }
    return () => cancelAnimationFrame(animRef.current);
  }, [screen, initGame]);


  // ── Input ─────────────────────────────────────────────────────────────────
  function changeLane(dir) {
    const gs = gsRef.current;
    if (!gs || gs.dead) return;
    const canvas = canvasRef.current;
    const offsetX = canvas ? (canvas.width - COLS * CELL_W) / 2 : 30;

    const newLane = Math.max(0, Math.min(2, gs.targetLane + dir));

    // Block lane change if the adjacent lane at the current row has a box
    const curRow = gs.rows[gs.headRow];
    if (curRow && curRow[newLane] === "box") return;  // wall — can't go there

    gs.targetLane = newLane;
    gs.targetX    = laneX(newLane, offsetX);
  }

  useEffect(() => {
    if (screen !== "game") return;
    function onKey(e) {
      if (e.key === "ArrowLeft"  || e.key === "a") changeLane(-1);
      if (e.key === "ArrowRight" || e.key === "d") changeLane(+1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

  // ── Game loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameRunning || screen !== "game") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const offsetX = (W - COLS * CELL_W) / 2;

    // ── Build grass tile texture once (offscreen, never redrawn) ──
    const TILE_SIZE = 40;
    const tileCanvas = document.createElement("canvas");
    tileCanvas.width = tileCanvas.height = TILE_SIZE;
    const tc = tileCanvas.getContext("2d");
    // Base fill
    tc.fillStyle = "#4a9a38";
    tc.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    // Subtle noise patches
    const patches = [
      { x:3,  y:5,  r:5, c:"rgba(60,120,20,0.18)" },
      { x:18, y:12, r:7, c:"rgba(30,90,10,0.13)"  },
      { x:30, y:3,  r:4, c:"rgba(80,150,30,0.15)" },
      { x:8,  y:28, r:6, c:"rgba(40,110,15,0.12)" },
      { x:28, y:30, r:5, c:"rgba(55,130,25,0.14)" },
      { x:15, y:22, r:3, c:"rgba(70,140,20,0.10)" },
    ];
    patches.forEach(p => {
      tc.beginPath(); tc.arc(p.x, p.y, p.r, 0, Math.PI*2);
      tc.fillStyle = p.c; tc.fill();
    });
    // Grass blades — short diagonal strokes
    tc.strokeStyle = "rgba(30,80,10,0.22)"; tc.lineWidth = 1; tc.lineCap = "round";
    [[4,18,6,12],[12,8,10,2],[22,25,24,18],[33,14,31,8],[36,32,38,26],[7,36,9,30],[25,6,23,0]].forEach(([x1,y1,x2,y2])=>{
      tc.beginPath(); tc.moveTo(x1,y1); tc.lineTo(x2,y2); tc.stroke();
    });
    // Lighter highlight flecks
    tc.fillStyle = "rgba(160,220,80,0.12)";
    [[10,15,3],[28,8,2],[5,32,2],[35,22,3],[20,35,2]].forEach(([x,y,r])=>{
      tc.beginPath(); tc.arc(x,y,r,0,Math.PI*2); tc.fill();
    });
    const grassPattern = ctx.createPattern(tileCanvas, "repeat");

    async function handleDeath(score) {
      playDeathSfx();
      setFinalScore(score);
      const currentUser = usernameRef.current || username;
      await submitScore(currentUser, score);

      // Update persistent stats
      const gs2 = gsRef.current;
      const prev = userStatsRef.current || { bestScore:0, totalMice:0, totalShields:0, shieldBlocks:0, gamesPlayed:0, achievements:[], unlockedSkins:["classic"] };
      const updated = {
        bestScore:     Math.max(prev.bestScore, score),
        totalMice:     (prev.totalMice || 0) + (gs2.miceCollected || 0),
        totalShields:  (prev.totalShields || 0) + Math.floor((gs2.miceCollected || 0) / 15),
        shieldBlocks:  (prev.shieldBlocks || 0) + (gs2.shieldBlocksThisRun || 0),
        gamesPlayed:   (prev.gamesPlayed || 0) + 1,
        achievements:  [...(prev.achievements || [])],
        unlockedSkins: [...(prev.unlockedSkins || ["classic"])],
      };

      // Check achievements
      const newlyEarned = [];
      for (const ach of ACHIEVEMENTS) {
        if (!updated.achievements.includes(ach.id) && ach.check(updated)) {
          updated.achievements.push(ach.id);
          newlyEarned.push(ach);
          if (ach.unlocksSkin && !updated.unlockedSkins.includes(ach.unlocksSkin)) {
            updated.unlockedSkins.push(ach.unlocksSkin);
          }
        }
      }
      // Legend skin: unlock when ALL achievements earned
      const allEarned = ACHIEVEMENTS.every(a => updated.achievements.includes(a.id));
      if (allEarned && !updated.unlockedSkins.includes("legend")) {
        updated.unlockedSkins.push("legend");
        newlyEarned.push({ id:"legend_skin", icon:"🐍", name:"Legend Skin Unlocked!", desc:"All achievements complete" });
      }
      userStatsRef.current = updated;
      setUserStats({ ...updated });
      if (newlyEarned.length) setNewAchievements(newlyEarned);
      const saveUser = (usernameRef.current || username).toLowerCase();
      console.log('[SnakeRunner] Saving stats for:', saveUser, updated);
      await saveUserStats(saveUser, updated);

      setGameRunning(false);
      setScreen("gameover");
    }

    function draw(ts) {
      const gs = gsRef.current;
      if (!gs || gs.dead) return;

      const dt = lastDrawRef.current ? Math.min(ts - lastDrawRef.current, 50) : 16;
      lastDrawRef.current = ts;

      // ── 1. Move head forward (world Y increases = moving "up" into new rows) ──
      gs.headWorldY += gs.fwdSpeed * dt;

      // ── 2. Move head laterally toward targetX (smooth, no jitter) ──
      {
        const dx = gs.targetX - gs.headX;
        const step = LATERAL_SPEED * dt;
        if (Math.abs(dx) <= step) gs.headX = gs.targetX;
        else                      gs.headX += Math.sign(dx) * step;
      }

      // ── 3. Check which grid row the head is now in ──
      const newHeadRow = Math.floor(gs.headWorldY / CELL_H);
      if (newHeadRow > gs.headRow) {
        gs.headRow = newHeadRow;
        // Slow speed ramp
      }

      // ── 4. Score: +1 per new row crossed ──
      if (gs.headRow > gs.lastScoredRow) {
        gs.score += gs.headRow - gs.lastScoredRow;
        gs.lastScoredRow = gs.headRow;
        setDisplayScore(gs.score);
      }

      // ── 5. Continuous scroll — pin head to a fixed screen Y every frame ──
      // worldToScreen(wy) = H - (wy - scrollY)
      // We want worldToScreen(headWorldY) = HEAD_SCREEN_Y (fixed pixels from top)
      // => scrollY = headWorldY - (H - HEAD_SCREEN_Y)
      const HEAD_SCREEN_Y = CELL_H * 5;
      const scrollY = gs.headWorldY - (H - HEAD_SCREEN_Y);

      // Keep row buffer topped up (integer rows only)
      const newScrollOffset = Math.floor(scrollY / CELL_H);
      if (newScrollOffset > gs.scrollOffset) {
        gs.scrollOffset = newScrollOffset;
        while (gs.rows.length <= gs.scrollOffset + VISIBLE_ROWS + 10)
          gs.rows.push(generateRow(gs.rows.length, gs.rows[gs.rows.length - 1] ?? null));
      }

      // ── 6. Pixel-accurate collision ──
      // Head bounding circle: centre (headX, headWorldY), radius = BODY_R * 0.7
      const HR = BODY_R * 0.7;
      const hx = gs.headX, hy = gs.headWorldY;

      // Check all nearby rows for boxes
      for (let dr = -1; dr <= 1; dr++) {
        const r = gs.headRow + dr;
        if (r < 0) continue;
        const cellRow = gs.rows[r];
        if (!cellRow) continue;
        for (let col = 0; col < COLS; col++) {
          if (!cellRow[col]) continue;
          // Box world-space rect
          const bx = offsetX + col * CELL_W;
          const by = r * CELL_H;
          const bw = CELL_W, bh = CELL_H;

          if (cellRow[col] === "box") {
            // Circle vs AABB collision
            const nearX = Math.max(bx, Math.min(hx, bx + bw));
            const nearY = Math.max(by, Math.min(hy, by + bh));
            const distSq = (hx - nearX)**2 + (hy - nearY)**2;
            if (distSq < HR * HR) {
              if (gs.shieldUntil > performance.now()) {
                // Shield absorbs the hit — destroy this box and cancel shield
                cellRow[col] = null;
                gs.shieldUntil = 0;
                gs.shieldBlocksThisRun = (gs.shieldBlocksThisRun || 0) + 1;
                setShieldSecs(0);
                // Snap back to lane centre so snake isn't stuck on an edge
                gs.headX = gs.targetX;
              } else {
                gs.dead = true; handleDeath(gs.score); return;
              }
            }

            // Also block lateral movement into a box in the same/adjacent row
            // Push head away if it's overlapping horizontally
            if (hy + HR > by && hy - HR < by + bh) {
              // Head overlaps this row vertically — enforce X boundary
              const leftEdge  = bx - HR;
              const rightEdge = bx + bw + HR;
              if (hx > bx - HR && hx < bx + bw + HR) {
                // Snap to the closer edge
                if (hx < bx + bw / 2) {
                  gs.headX = leftEdge;
                  if (gs.targetX > leftEdge) gs.targetX = leftEdge;
                } else {
                  gs.headX = rightEdge;
                  if (gs.targetX < rightEdge) gs.targetX = rightEdge;
                }
              }
            }
          } else if (cellRow[col] === "mouse") {
            // Mouse pickup
            const nearX = Math.max(bx, Math.min(hx, bx + bw));
            const nearY = Math.max(by, Math.min(hy, by + bh));
            const distSq = (hx - nearX)**2 + (hy - nearY)**2;
            if (distSq < (BODY_R * 1.2)**2) {
              gs.score += 10;
              gs.growPts += Math.ceil(60 / PATH_SUBSAMPLE);
              playEatSfx();
              cellRow[col] = null;
              gs.miceCollected++;
              // Every 30 mice = extra life (10 second shield)
              if (gs.miceCollected % 15 === 0) {
                gs.shieldUntil = performance.now() + 10000;
              }
              setDisplayScore(gs.score);
              setMiceDisplay(gs.miceCollected);
            }
          }
        }
      }
      if (gs.dead) return;

      // ── Shield countdown ──
      if (gs.shieldUntil > 0) {
        const remaining = Math.ceil((gs.shieldUntil - performance.now()) / 1000);
        if (remaining <= 0) { gs.shieldUntil = 0; setShieldSecs(0); }
        else setShieldSecs(remaining);
      }

      // ── 7. Update ring-buffer path ──
      // Only record a new point every PATH_SUBSAMPLE px of travel
      const dxAcc = gs.headX - gs.lastRecX;
      const dyAcc = gs.headWorldY - gs.lastRecY;
      gs.pathAccum += Math.sqrt(dxAcc*dxAcc + dyAcc*dyAcc);
      gs.lastRecX = gs.headX; gs.lastRecY = gs.headWorldY;

      if (gs.pathAccum >= PATH_SUBSAMPLE) {
        gs.pathAccum -= PATH_SUBSAMPLE;
        gs.pathHead = (gs.pathHead - 1 + gs.MAX_PATH_PTS) % gs.MAX_PATH_PTS;
        gs.pathBuf[gs.pathHead] = { x: gs.headX, worldY: gs.headWorldY };
        if (gs.pathCount < gs.MAX_PATH_PTS) gs.pathCount++;
      }

      if (gs.growPts > 0) { gs.growPts--; gs.bodyPts++; }

      // ── Render ──────────────────────────────────────────────────────────────
      function worldToScreen(wy) { return H - (wy - scrollY); }

      // ── Background ──
      ctx.fillStyle = "#3d7020";
      ctx.fillRect(0, 0, W, H);

      // Grass lanes — tiled texture scrolls with the world for depth
      const tyOffset = scrollY % TILE;
      for (let col = 0; col < COLS; col++) {
        const cx = offsetX + col * CELL_W;
        // Tint alternate lanes slightly
        ctx.save();
        ctx.beginPath(); ctx.rect(cx, 0, CELL_W, H); ctx.clip();
        // Base colour
        ctx.fillStyle = col === 1 ? "#52a840" : "#4a9a38";
        ctx.fillRect(cx, 0, CELL_W, H);
        // Scrolling texture via matrix translate
        const mat = new DOMMatrix().translate(cx, tyOffset);
        grassPattern.setTransform(mat);
        ctx.fillStyle = grassPattern;
        ctx.fillRect(cx, 0, CELL_W, H);
        ctx.restore();
      }

      // Lane dividers — rustic wooden fence posts
      for (let col = 1; col < COLS; col++) {
        const fx = offsetX + col * CELL_W;
        ctx.strokeStyle = "#5c3d1a"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(fx, H); ctx.stroke();
        ctx.strokeStyle = "#8b5e2a"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(fx - 1, 0); ctx.lineTo(fx - 1, H); ctx.stroke();
      }

      // Boxes & mice — fade in as they scroll down from the top edge
      // worldToScreen: higher worldY = smaller screenY (toward top of canvas).
      // New rows appear at top (screenY ~0). Fade over 3 rows worth of pixels.
      const FADE_PX = CELL_H * 3;
      for (let r = -1; r < VISIBLE_ROWS + 3; r++) {
        const absRow = Math.floor(gs.scrollOffset) + r;
        const cellRow = gs.rows[absRow];
        if (!cellRow) continue;
        const screenY = worldToScreen(absRow * CELL_H + CELL_H); // top edge of row
        // screenY = 0 means top of canvas. Row enters from top, scrolls downward.
        // alpha: 0 when screenY<=0, ramps to 1 once it has scrolled FADE_PX down.
        const alpha = Math.min(1, Math.max(0, (screenY + CELL_H) / FADE_PX));
        if (alpha <= 0) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        for (let col = 0; col < COLS; col++) {
          const cx = offsetX + col * CELL_W;
          if (cellRow[col] === "box")   drawBox(ctx, cx + 6, screenY + 5, CELL_W - 12, CELL_H - 10);
          if (cellRow[col] === "mouse") drawMouse(ctx, cx + CELL_W / 2, screenY + CELL_H / 2);
        }
        ctx.restore();
      }

      // ── Snake ribbon (from ring buffer) ──
      {
        const buf   = gs.pathBuf;
        const head  = gs.pathHead;
        const total = gs.MAX_PATH_PTS;
        const draw  = Math.min(gs.bodyPts, gs.pathCount);

        // Collect screen-space points head→tail, skip once below screen
        const pts = [];
        for (let i = 0; i < draw; i++) {
          const idx = (head + i) % total;
          const py = worldToScreen(buf[idx].worldY);
          if (py > H + 40 && i > 2) break;
          pts.push({ x: buf[idx].x, y: py });
        }

        if (pts.length >= 2) {
          function strokeRibbon(width, color, alpha) {
            ctx.save();
            if (alpha !== undefined) ctx.globalAlpha = alpha;
            ctx.beginPath();
            // Draw tail→head so head cap is on top
            ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
            for (let i = pts.length - 2; i >= 1; i--) {
              const mx = (pts[i].x + pts[i-1].x) / 2;
              const my = (pts[i].y + pts[i-1].y) / 2;
              ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
            }
            ctx.lineTo(pts[0].x, pts[0].y);
            ctx.strokeStyle = color;
            ctx.lineWidth   = width;
            ctx.lineCap     = "round";
            ctx.lineJoin    = "round";
            ctx.stroke();
            ctx.restore();
          }

          const skin = SKINS.find(s => s.id === selectedSkinRef.current) || SKINS[0];
          // Shield glow
          if (gs.shieldUntil > performance.now()) {
            const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 150);
            strokeRibbon(BODY_R * 2 + 14, `rgba(100,200,255,${0.25 + pulse * 0.2})`);
            strokeRibbon(BODY_R * 2 + 8,  `rgba(150,230,255,${0.35 + pulse * 0.15})`);
          }

          if (skin.id === "legend") {
            // ── Legend skin: black base + spots locked to body path ──
            strokeRibbon(BODY_R * 2 + 5, "#0a0705");
            strokeRibbon(BODY_R * 2,     "#070503");

            // legendSpots is pre-generated once (see initGame).
            // Each spot has a t=0..1 position along body length.
            // We find the matching point in pts[] and draw there so spots ride the snake.
            for (const sp of (gs.legendSpots || [])) {
              const ptIdx = Math.floor(sp.t * (pts.length - 1));
              const ptA   = pts[Math.min(ptIdx,   pts.length - 1)];
              const ptB   = pts[Math.min(ptIdx+1, pts.length - 1)];
              const frac  = sp.t * (pts.length - 1) - ptIdx;
              const mx2   = ptA.x + (ptB.x - ptA.x) * frac;
              const my2   = ptA.y + (ptB.y - ptA.y) * frac;
              const dx = ptB.x - ptA.x, dy = ptB.y - ptA.y;
              const ln = Math.sqrt(dx*dx + dy*dy) || 1;
              const nx = -dy/ln, ny = dx/ln;
              const cx2 = mx2 + nx * sp.side * BODY_R * 0.7;
              const cy2 = my2 + ny * sp.side * BODY_R * 0.7;
              const bodyAng = Math.atan2(dy, dx) + sp.rot;
              ctx.save();
              ctx.translate(cx2, cy2);
              ctx.rotate(bodyAng);
              for (const seg of sp.segs) {
                ctx.beginPath();
                ctx.ellipse(0, 0, sp.rx + sp.gap, sp.ry + sp.gap, 0, seg.sa, seg.sa + seg.al);
                ctx.lineWidth = sp.ringW; ctx.strokeStyle = sp.ringColor; ctx.stroke();
              }
              const grd = ctx.createRadialGradient(0,0,0,0,0,sp.rx);
              grd.addColorStop(0, sp.c0); grd.addColorStop(0.6, sp.c1); grd.addColorStop(1, sp.c2);
              ctx.beginPath(); ctx.ellipse(0,0,sp.rx,sp.ry,0,0,Math.PI*2);
              ctx.fillStyle = grd; ctx.fill();
              ctx.restore();
            }
            strokeRibbon(BODY_R * 2 + 5, "#000", 0.35);
          } else {
            strokeRibbon(BODY_R * 2 + 5, skin.dark);
            strokeRibbon(BODY_R * 2,     skin.body);
            strokeRibbon(BODY_R * 0.65,  skin.stripe, 0.5);
            strokeRibbon(BODY_R * 0.3,   "#ffffff", 0.15);
          }
        }
      }

      // ── Head ──
      {
        const sx = gs.headX;
        const sy = worldToScreen(gs.headWorldY);
        const lbIdx = (gs.pathHead + Math.min(10, gs.pathCount - 1)) % gs.MAX_PATH_PTS;
        const lbPt  = gs.pathBuf[lbIdx];
        const ang = lbPt
          ? Math.atan2(sy - worldToScreen(lbPt.worldY), sx - lbPt.x)
          : -Math.PI / 2;
        const headSkin = SKINS.find(s => s.id === selectedSkinRef.current) || SKINS[0];
        const isRealHead = headSkin.special === "realhead";

        if (isRealHead) {
          // ── Ball python head: small, rounded, slightly flattened ──
          const perp = ang + Math.PI / 2;
          const pt = (fwd, side) => ({
            x: sx + Math.cos(ang) * fwd + Math.cos(perp) * side,
            y: sy + Math.sin(ang) * fwd + Math.sin(perp) * side,
          });

          // Head dimensions — ball pythons have a small, distinct rounded head
          const HW = BODY_R * 1.1;    // half-width
          const HL = BODY_R * 2.2;    // half-length forward from centre

          // Draw head as a smooth rounded shape using bezier curves
          // Back of head (where it meets neck) is narrow, widens to crown, narrows to snout
          const neckL   = pt(-HL * 0.55,  HW * 0.55);
          const neckR   = pt(-HL * 0.55, -HW * 0.55);
          const crownL  = pt( HL * 0.05,  HW);
          const crownR  = pt( HL * 0.05, -HW);
          const jawL    = pt( HL * 0.55,  HW * 0.7);
          const jawR    = pt( HL * 0.55, -HW * 0.7);
          const snoutTip= pt( HL * 1.0,   0);
          const neckMid = pt(-HL * 0.7,   0);

          // Dark base outline
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(neckMid.x, neckMid.y);
          ctx.bezierCurveTo(neckL.x, neckL.y, crownL.x, crownL.y, crownL.x, crownL.y);
          ctx.bezierCurveTo(jawL.x, jawL.y, jawL.x, jawL.y, snoutTip.x, snoutTip.y);
          ctx.bezierCurveTo(jawR.x, jawR.y, jawR.x, jawR.y, crownR.x, crownR.y);
          ctx.bezierCurveTo(neckR.x, neckR.y, neckMid.x, neckMid.y, neckMid.x, neckMid.y);
          ctx.closePath();
          ctx.fillStyle = "#150d05";
          ctx.fill();
          ctx.restore();

          // Main dark brown head base (inset slightly)
          const niL = pt(-HL*0.5,  HW*0.48);
          const niR = pt(-HL*0.5, -HW*0.48);
          const ciL = pt( HL*0.0,  HW*0.88);
          const ciR = pt( HL*0.0, -HW*0.88);
          const jiL = pt( HL*0.5,  HW*0.62);
          const jiR = pt( HL*0.5, -HW*0.62);
          const sti = pt( HL*0.88, 0);
          const nmi = pt(-HL*0.62, 0);
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(nmi.x, nmi.y);
          ctx.bezierCurveTo(niL.x,niL.y, ciL.x,ciL.y, ciL.x,ciL.y);
          ctx.bezierCurveTo(jiL.x,jiL.y, jiL.x,jiL.y, sti.x,sti.y);
          ctx.bezierCurveTo(jiR.x,jiR.y, jiR.x,jiR.y, ciR.x,ciR.y);
          ctx.bezierCurveTo(niR.x,niR.y, nmi.x,nmi.y, nmi.x,nmi.y);
          ctx.closePath();
          ctx.fillStyle = "#2a1a0a";
          ctx.fill();
          ctx.restore();

          // Tan/caramel blotch on top of head — ball pythons have a characteristic arrow/lance mark
          ctx.save();
          const blotchCentre = pt(HL * 0.1, 0);
          const blotchFront  = pt(HL * 0.65, 0);
          const blotchW = HW * 0.55;
          ctx.beginPath();
          ctx.moveTo(blotchCentre.x - Math.cos(perp)*blotchW*0.3, blotchCentre.y - Math.sin(perp)*blotchW*0.3);
          ctx.bezierCurveTo(
            pt(HL*-0.1,  blotchW*0.7).x, pt(HL*-0.1,  blotchW*0.7).y,
            pt(HL* 0.4,  blotchW).x,     pt(HL* 0.4,  blotchW).y,
            blotchFront.x, blotchFront.y
          );
          ctx.bezierCurveTo(
            pt(HL* 0.4, -blotchW).x,     pt(HL* 0.4, -blotchW).y,
            pt(HL*-0.1, -blotchW*0.7).x, pt(HL*-0.1, -blotchW*0.7).y,
            blotchCentre.x + Math.cos(perp)*blotchW*0.3, blotchCentre.y + Math.sin(perp)*blotchW*0.3
          );
          ctx.closePath();
          ctx.fillStyle = "#c8955a";
          ctx.fill();
          // Dark centre stripe through blotch
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = "#150d05";
          const stripeW = HW * 0.12;
          ctx.beginPath();
          ctx.ellipse(blotchFront.x - Math.cos(ang)*HW*0.2, blotchFront.y - Math.sin(ang)*HW*0.2, HW*0.08, HW*0.32, ang, 0, Math.PI*2);
          ctx.fill();
          ctx.restore();

          // Fine scale texture — tiny hexagon-like dots
          ctx.save();
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = "#000";
          for (let fi = -1; fi <= 1; fi += 0.5) {
            for (let fj = -0.6; fj <= 0.6; fj += 0.5) {
              const sp = pt(HL*fi*0.5, HW*fj*0.7);
              ctx.beginPath(); ctx.arc(sp.x, sp.y, 1.5, 0, Math.PI*2); ctx.fill();
            }
          }
          ctx.restore();

          // Heat pits — characteristic ball python feature, small pits along jaw
          ctx.save();
          ctx.fillStyle = "#0a0a0a";
          [-0.55, -0.25, 0.25, 0.55].forEach(f => {
            const pit = pt(HL * 0.5, HW * f * 0.9);
            ctx.beginPath(); ctx.arc(pit.x, pit.y, 1.2, 0, Math.PI*2); ctx.fill();
          });
          ctx.restore();

          // Nostril — single slightly visible pit near snout
          ctx.save();
          [-0.32, 0.32].forEach(s => {
            const n = pt(HL * 0.78, HW * s * 0.5);
            ctx.beginPath(); ctx.arc(n.x, n.y, 2, 0, Math.PI*2);
            ctx.fillStyle = "#0d0806"; ctx.fill();
          });
          ctx.restore();

          // Eyes — ball python: small, dark, jewel-like with subtle amber ring
          const eyeFwd  = HL * 0.3;
          const eyeLat  = HW * 0.72;
          [-1, 1].forEach(side => {
            const ex = sx + Math.cos(ang)*eyeFwd + Math.cos(perp)*side*eyeLat;
            const ey = sy + Math.sin(ang)*eyeFwd + Math.sin(perp)*side*eyeLat;
            // Dark surround
            ctx.beginPath(); ctx.arc(ex, ey, BODY_R*0.34, 0, Math.PI*2);
            ctx.fillStyle = "#0a0a0a"; ctx.fill();
            // Amber-brown iris
            ctx.beginPath(); ctx.arc(ex, ey, BODY_R*0.25, 0, Math.PI*2);
            ctx.fillStyle = "#6b3a0a"; ctx.fill();
            // Large round pupil (ball pythons have round pupils unlike many snakes)
            ctx.beginPath(); ctx.arc(ex, ey, BODY_R*0.16, 0, Math.PI*2);
            ctx.fillStyle = "#050302"; ctx.fill();
            // Specular shine
            ctx.beginPath(); ctx.arc(ex - Math.cos(ang)*1.5, ey - Math.sin(ang)*1.5, BODY_R*0.07, 0, Math.PI*2);
            ctx.fillStyle = "rgba(255,255,255,0.65)"; ctx.fill();
          });

          // Tongue — slim, dark red
          ctx.strokeStyle = "#cc2222"; ctx.lineWidth = 1.8; ctx.lineCap = "round";
          const tongueBase = pt(HL*1.0, 0);
          const tongueEnd  = pt(HL*1.55, 0);
          ctx.beginPath(); ctx.moveTo(tongueBase.x, tongueBase.y);
          ctx.lineTo(tongueEnd.x, tongueEnd.y); ctx.stroke();
          [-0.42, 0.42].forEach(a => {
            const fork = pt(HL*1.35, 0);
            ctx.beginPath(); ctx.moveTo(fork.x, fork.y);
            ctx.lineTo(fork.x + Math.cos(ang+a)*5, fork.y + Math.sin(ang+a)*5); ctx.stroke();
          });

          // ── Ball python body pattern: tan blotches on dark background ──
          // Draw blotches along the path at regular intervals
          const bpBuf   = gs.pathBuf;
          const bpHead  = gs.pathHead;
          const bpTotal = gs.MAX_PATH_PTS;
          const bpDraw  = Math.min(gs.bodyPts, gs.pathCount);
          const blotchEvery = 20; // every N path points
          ctx.save();
          for (let bi = blotchEvery; bi < bpDraw - blotchEvery; bi += blotchEvery) {
            const idx0 = (bpHead + bi) % bpTotal;
            const idx1 = (bpHead + bi + 4) % bpTotal;
            const bpx  = bpBuf[idx0].x;
            const bpy  = worldToScreen(bpBuf[idx0].worldY);
            const bpx1 = bpBuf[idx1].x;
            const bpy1 = worldToScreen(bpBuf[idx1].worldY);
            const ba   = Math.atan2(bpy - bpy1, bpx - bpx1);
            ctx.save();
            ctx.translate(bpx, bpy);
            ctx.rotate(ba);
            // Outer blotch (tan/caramel)
            ctx.beginPath();
            ctx.ellipse(0, 0, BODY_R*0.95, BODY_R*0.7, 0, 0, Math.PI*2);
            ctx.fillStyle = "#c8955a"; ctx.fill();
            // Inner dark centre spot
            ctx.beginPath();
            ctx.ellipse(0, 0, BODY_R*0.38, BODY_R*0.28, 0, 0, Math.PI*2);
            ctx.fillStyle = "#2a1a0a"; ctx.fill();
            ctx.restore();
          }
          ctx.restore();

        } else {
          // ── Standard round head ──
          ctx.beginPath(); ctx.arc(sx, sy, BODY_R + 3, 0, Math.PI * 2);
          ctx.fillStyle = headSkin.dark; ctx.fill();
          ctx.beginPath(); ctx.arc(sx, sy, BODY_R + 1, 0, Math.PI * 2);
          ctx.fillStyle = headSkin.head; ctx.fill();

          const eyeDist = BODY_R * 0.52;
          [-1, 1].forEach(side => {
            const ex = sx + Math.cos(ang + side * Math.PI / 2) * eyeDist;
            const ey = sy + Math.sin(ang + side * Math.PI / 2) * eyeDist;
            ctx.beginPath(); ctx.arc(ex, ey, BODY_R * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = "#fff"; ctx.fill();
            ctx.beginPath();
            ctx.arc(ex + Math.cos(ang) * BODY_R * 0.1, ey + Math.sin(ang) * BODY_R * 0.1, BODY_R * 0.16, 0, Math.PI * 2);
            ctx.fillStyle = "#111"; ctx.fill();
          });

          ctx.strokeStyle = "#f87171"; ctx.lineWidth = 2; ctx.lineCap = "round";
          const tx = sx + Math.cos(ang) * (BODY_R + 4);
          const ty2 = sy + Math.sin(ang) * (BODY_R + 4);
          ctx.beginPath(); ctx.moveTo(tx, ty2);
          ctx.lineTo(tx + Math.cos(ang) * 9, ty2 + Math.sin(ang) * 9); ctx.stroke();
          const fx = tx + Math.cos(ang) * 9, fy = ty2 + Math.sin(ang) * 9;
          [-0.45, 0.45].forEach(a => {
            ctx.beginPath(); ctx.moveTo(fx, fy);
            ctx.lineTo(fx + Math.cos(ang + a) * 5, fy + Math.sin(ang + a) * 5); ctx.stroke();
          });

          ctx.beginPath();
          ctx.arc(sx - Math.cos(ang) * BODY_R * 0.3, sy - Math.sin(ang) * BODY_R * 0.3, BODY_R * 0.38, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fill();
        }
      }

      // Top fade (new blocks spawn here — already handled by alpha fade)
      const vgTop = ctx.createLinearGradient(0, 0, 0, H * 0.18);
      vgTop.addColorStop(0,   "rgba(30,60,10,0.55)");
      vgTop.addColorStop(1,   "rgba(30,60,10,0)");
      ctx.fillStyle = vgTop; ctx.fillRect(0, 0, W, H * 0.18);
      // Bottom fade
      const vgBot = ctx.createLinearGradient(0, H * 0.82, 0, H);
      vgBot.addColorStop(0,   "rgba(20,40,5,0)");
      vgBot.addColorStop(1,   "rgba(20,40,5,0.5)");
      ctx.fillStyle = vgBot; ctx.fillRect(0, H * 0.82, W, H * 0.18);
      // Side dirt borders
      ctx.fillStyle = "#5c3d1a";
      ctx.fillRect(0, 0, offsetX, H);
      ctx.fillRect(offsetX + COLS * CELL_W, 0, W - (offsetX + COLS * CELL_W), H);
    }

    function loop(ts) {
      draw(ts);
      animRef.current = requestAnimationFrame(loop);
    }
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [gameRunning, screen, username]);

  // ── Draw helpers ──────────────────────────────────────────────────────────
  function drawBox(ctx, x, y, w, h) {
    // Wooden crate body
    ctx.fillStyle = "#a0692a";
    ctx.fillRect(x, y, w, h);

    // Wood grain planks (horizontal)
    const plankH = h / 3;
    ctx.strokeStyle = "#7a4e1e"; ctx.lineWidth = 1.5;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y + plankH * i);
      ctx.lineTo(x + w, y + plankH * i);
      ctx.stroke();
    }

    // Vertical grain lines per plank
    ctx.strokeStyle = "rgba(90,55,15,0.35)"; ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(t => {
      ctx.beginPath(); ctx.moveTo(x + w * t, y); ctx.lineTo(x + w * t, y + h); ctx.stroke();
    });

    // Corner metal brackets
    ctx.fillStyle = "#5a5a5a";
    const bSize = 5;
    [[x,y],[x+w-bSize,y],[x,y+h-bSize],[x+w-bSize,y+h-bSize]].forEach(([bx,by]) => {
      ctx.fillRect(bx, by, bSize, bSize);
    });

    // Top highlight (lighter wood)
    ctx.fillStyle = "rgba(255,220,140,0.18)";
    ctx.fillRect(x + 2, y + 2, w - 4, 5);

    // Outer border
    ctx.strokeStyle = "#7a4e1e"; ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  function drawMouse(ctx, cx, cy) {
    ctx.beginPath(); ctx.ellipse(cx, cy+2, 11, 8, 0, 0, Math.PI*2);
    ctx.fillStyle="#c8a97e"; ctx.fill(); ctx.strokeStyle="#a07850"; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx+10, cy, 7, 6, 0, 0, Math.PI*2);
    ctx.fillStyle="#c8a97e"; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx+14, cy-5, 4, 4, 0, 0, Math.PI*2);
    ctx.fillStyle="#e8c4a0"; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx+13, cy-1, 1.5, 0, Math.PI*2); ctx.fillStyle="#111"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx-11,cy+3); ctx.quadraticCurveTo(cx-18,cy+8,cx-16,cy+14);
    ctx.strokeStyle="#a07850"; ctx.lineWidth=2; ctx.stroke();
    ctx.strokeStyle="rgba(255,255,255,0.6)"; ctx.lineWidth=1;
    [[cx+16,cy+1,cx+23,cy-1],[cx+16,cy+2,cx+23,cy+3]].forEach(([x1,y1,x2,y2])=>{
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });
    const grd = ctx.createRadialGradient(cx,cy,0,cx,cy,18);
    grd.addColorStop(0,"rgba(245,215,110,0.25)"); grd.addColorStop(1,"rgba(245,215,110,0)");
    ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(cx,cy,18,0,Math.PI*2); ctx.fill();
  }

  // ── Touch ──
  const touchStartX = useRef(null);
  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX; // always record for tap drift check
  }
  function onTouchEnd(e) {
    if (controlMode === 'tap') {
      // Tap: only fire if no significant movement (not a swipe)
      const dx = e.changedTouches[0].clientX - (touchStartX.current ?? e.changedTouches[0].clientX);
      if (Math.abs(dx) < 15) {
        changeLane(e.changedTouches[0].clientX < window.innerWidth / 2 ? -1 : 1);
      }
    } else {
      if (touchStartX.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(dx) > 20) changeLane(dx < 0 ? -1 : 1);
      touchStartX.current = null;
    }
  }

  // ─── Screens ──────────────────────────────────────────────────────────────
  if (screen === "login") return (
    <div style={S.root}>
      <div style={S.loginCard}>
        <div style={S.logoWrap}>
          <span style={{fontSize:52}}>🐍</span>
          <h1 style={S.logoTitle}>SNAKE RUNNER</h1>
          <p style={S.logoSub}>Slither. Dodge. Devour.</p>
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Enter your name to play</label>
          <input style={S.input} value={inputName}
            onChange={e => setInputName(e.target.value)}
            onBlur={e => {
              const n = e.target.value.trim();
              if (n.length >= 2) {
                if (!userStatsRef.current) {
                  loadUserStats(n).then(stats => { userStatsRef.current = stats; setUserStats(stats); });
                  loadSelectedSkin(n).then(skinId => {
                    if (selectedSkinRef.current === "classic") {
                      selectedSkinRef.current = skinId; setSelectedSkin(skinId);
                    }
                  });
                }
              }
            }}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="Your username..." maxLength={16} />
          {loginError && <p style={S.error}>{loginError}</p>}
          <button style={S.btnPrimary} onClick={handleLogin}>PLAY</button>
          <button style={{...S.btnSecondary,marginTop:8}} onClick={() => { loadLeaderboard(); setScreen("leaderboard"); }}>🏆 LEADERBOARD</button>
          <button style={{...S.btnSecondary,marginTop:8}} onClick={() => setScreen("achievements")}>🏅 ACHIEVEMENTS</button>
          {username && <button style={{...S.btnSecondary,marginTop:8}} onClick={() => setScreen("account")}>👤 MY ACCOUNT</button>}
        </div>
        {username && (
          <div style={{marginTop:16}}>
            <p style={{...S.label,textAlign:"center",marginBottom:8}}>Snake Skin</p>
            <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
              {SKINS.map(skin => {
                const stats = userStats || userStatsRef.current;
                const unlocked = !skin.unlock || (stats?.unlockedSkins||["classic"]).includes(skin.id);
                const active = selectedSkin === skin.id;
                return (
                  <button key={skin.id} title={unlocked ? skin.name : "Locked"} onClick={() => {
                    if (!unlocked) return;
                    setSelectedSkin(skin.id);
                    selectedSkinRef.current = skin.id;
                    saveSelectedSkin(username.toLowerCase(), skin.id);
                  }} style={{width:40,height:40,borderRadius:8,background:unlocked?skin.body:"#333",border:`2px solid ${active?"#fff":unlocked?skin.dark:"#555"}`,cursor:unlocked?"pointer":"not-allowed",position:"relative",boxShadow:active?"0 0 8px rgba(255,255,255,0.5)":"none",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
                    {!unlocked && <span style={{position:"absolute",fontSize:12}}>🔒</span>}
                    {unlocked && skin.special === "realhead" && <span style={{fontSize:18}}>👑</span>}
                    {unlocked && skin.special !== "realhead" && <span style={{width:18,height:18,borderRadius:"50%",background:skin.head,display:"block",border:`2px solid ${skin.dark}`}}/>}
                  </button>
                );
              })}
            </div>
            {SKINS.filter(s=>s.unlock&&!(userStats?.unlockedSkins||["classic"]).includes(s.id)).length > 0 && (
              <p style={{...S.hint,marginTop:4,fontSize:10}}>🔒 Unlock skins by earning achievements</p>
            )}
          </div>
        )}
        <div style={{marginTop:16}}>
          <p style={{...S.label,textAlign:"center",marginBottom:8}}>Mobile controls</p>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setControlMode('tap')} style={{flex:1,padding:"10px 0",borderRadius:8,border:"2px solid",borderColor:controlMode==='tap'?"#7ab030":"#6b4810",background:controlMode==='tap'?"rgba(90,140,32,0.35)":"rgba(60,35,10,0.4)",color:controlMode==='tap'?"#c8e87a":"#a09060",fontFamily:"inherit",fontSize:14,cursor:"pointer",fontWeight:controlMode==='tap'?700:400}}>
              👆 Tap sides
            </button>
            <button onClick={()=>setControlMode('swipe')} style={{flex:1,padding:"10px 0",borderRadius:8,border:"2px solid",borderColor:controlMode==='swipe'?"#7ab030":"#6b4810",background:controlMode==='swipe'?"rgba(90,140,32,0.35)":"rgba(60,35,10,0.4)",color:controlMode==='swipe'?"#c8e87a":"#a09060",fontFamily:"inherit",fontSize:14,cursor:"pointer",fontWeight:controlMode==='swipe'?700:400}}>
              👈 Swipe
            </button>
          </div>
        </div>
        <p style={{...S.hint,marginTop:12}}>{controlMode==='tap'?"Tap left/right side of screen or ← → keys":"Swipe left/right or use ← → keys"}</p>
        <button style={{background:"none",border:"none",color:"#475569",fontSize:10,cursor:"pointer",marginTop:8,textDecoration:"underline"}} onClick={() => setScreen("privacy")}>Privacy Policy</button>
      </div>
    </div>
  );

  // Returns "current/target" string for each achievement
  function achProgress(ach, stats) {
    if (!stats) return null;
    switch (ach.id) {
      case "score100":   return `${Math.min(stats.bestScore,100)}/100`;
      case "score200":   return `${Math.min(stats.bestScore,200)}/200`;
      case "score500":   return `${Math.min(stats.bestScore,500)}/500`;
      case "survival":   return `${Math.min(stats.bestScore,300)}/300`;
      case "mice50":     return `${Math.min(stats.totalMice,50)}/50`;
      case "mice100":    return `${Math.min(stats.totalMice,100)}/100`;
      case "firstmice":  return `${Math.min(stats.totalMice,1)}/1`;
      case "shieldblock":return `${Math.min(stats.shieldBlocks||0,1)}/1`;
      case "games5":     return `${Math.min(stats.gamesPlayed,5)}/5`;
      case "games20":    return `${Math.min(stats.gamesPlayed,20)}/20`;
      default:           return null;
    }
  }

  if (screen === "account") return (
    <div style={S.root}>
      <div style={{...S.leaderCard,maxWidth:420}}>
        <h2 style={{...S.leaderTitle,color:"#c8e87a"}}>👤 MY ACCOUNT</h2>

        {/* Profile photo */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:20}}>
          <div
            onClick={() => pfpInputRef.current?.click()}
            style={{width:90,height:90,borderRadius:"50%",background:"rgba(60,35,10,0.6)",border:"3px solid #8b6014",cursor:"pointer",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8,boxShadow:"0 4px 16px rgba(0,0,0,0.4)"}}
          >
            {pfpUrl
              ? <img src={pfpUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="pfp"/>
              : <span style={{fontSize:36}}>🐍</span>
            }
          </div>
          <input ref={pfpInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={e => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
              // Resize to 200x200 via canvas to keep storage small
              const img = new Image();
              img.onload = () => {
                const c = document.createElement("canvas");
                c.width = c.height = 200;
                const cx = c.getContext("2d");
                const s = Math.min(img.width, img.height);
                cx.drawImage(img, (img.width-s)/2, (img.height-s)/2, s, s, 0, 0, 200, 200);
                const dataUrl = c.toDataURL("image/jpeg", 0.7);
                setPfpUrl(dataUrl);
                savePfp(username, dataUrl);
              };
              img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
          }}/>
          <p style={{color:"#a09060",fontSize:11,margin:0,fontStyle:"italic"}}>Tap to change photo</p>
          <p style={{color:"#c8e87a",fontSize:18,fontWeight:700,margin:"8px 0 0"}}>{username}</p>
        </div>

        {/* Stats */}
        {(() => {
          const stats = userStats || userStatsRef.current;
          const board = leaderboard;
          const rank = board.findIndex(e => e.username === username) + 1;
          return (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
              {[
                { label:"🏆 Best Score",    value:(stats?.bestScore||0).toLocaleString() },
                { label:"🌍 Global Rank",   value: rank > 0 ? `#${rank}` : "Unranked" },
                { label:"🐭 Mice Caught",   value:(stats?.totalMice||0).toLocaleString() },
                { label:"🎮 Games Played",  value:(stats?.gamesPlayed||0).toLocaleString() },
                { label:"🛡️ Shield Blocks", value:(stats?.shieldBlocks||0).toLocaleString() },
                { label:"🏅 Achievements",  value:`${(stats?.achievements||[]).length}/${ACHIEVEMENTS.length}` },
              ].map(({label,value}) => (
                <div key={label} style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 12px",border:"1px solid rgba(139,96,20,0.25)"}}>
                  <div style={{fontSize:11,color:"#a09060",marginBottom:3}}>{label}</div>
                  <div style={{fontSize:20,fontWeight:800,color:"#c8e87a"}}>{value}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Save & Restore */}
        <div style={{marginBottom:14,padding:"12px 14px",background:"rgba(0,0,0,0.2)",borderRadius:10,border:"1px solid rgba(139,96,20,0.25)"}}>
          <p style={{...S.label,marginBottom:6,color:"#c8e87a"}}>💾 Save Code</p>
          <p style={{fontSize:11,color:"#a09060",margin:"0 0 8px"}}>Copy this code to restore your progress on any device or session.</p>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <input
              readOnly
              value={saveCode}
              style={{...S.input,flex:1,fontSize:10,padding:"8px 10px",fontFamily:"monospace",cursor:"text"}}
              onFocus={e => e.target.select()}
            />
            <button
              style={{...S.btnPrimary,marginTop:0,padding:"8px 12px",fontSize:12,whiteSpace:"nowrap"}}
              onClick={() => { setSaveCode(generateSaveCode()); navigator.clipboard?.writeText(saveCode).catch(()=>{}); }}
            >Copy</button>
          </div>
          <p style={{...S.label,marginBottom:6,color:"#c8e87a"}}>📥 Restore Code</p>
          <div style={{display:"flex",gap:8}}>
            <input
              value={restoreCode}
              onChange={e => { setRestoreCode(e.target.value); setRestoreMsg(''); }}
              placeholder="Paste your save code..."
              style={{...S.input,flex:1,fontSize:10,padding:"8px 10px",fontFamily:"monospace"}}
            />
            <button
              style={{...S.btnPrimary,marginTop:0,padding:"8px 12px",fontSize:12,whiteSpace:"nowrap"}}
              onClick={() => { applyRestoreCode(restoreCode); setRestoreCode(''); }}
            >Restore</button>
          </div>
          {restoreMsg && <p style={{fontSize:12,margin:"6px 0 0",color:restoreMsg.startsWith("✅")?"#86efac":"#f87171"}}>{restoreMsg}</p>}
        </div>

        {/* Change password */}
        <div style={{marginBottom:14}}>
          <p style={{...S.label,marginBottom:6}}>🔑 Change Password</p>
          <div style={{display:"flex",gap:8}}>
            <input
              type="password"
              onChange={e => { setNewPassword(e.target.value); setChangePwMsg(''); }}
              onKeyDown={e => e.key === "Enter" && document.getElementById("savePwBtn").click()}
              placeholder="New password..."
              maxLength={32}
              style={{...S.input,flex:1,padding:"10px 12px",fontSize:14}}
            />
            <button
              id="savePwBtn"
              style={{...S.btnPrimary,marginTop:0,padding:"10px 16px",fontSize:13,whiteSpace:"nowrap"}}
              onClick={async () => {
                setNewPassword('');
                setChangePwMsg("✅ Password saved!");
                setTimeout(() => setChangePwMsg(''), 3000);
              }}
            >Save</button>
          </div>
        </div>

        <div style={{display:"flex",gap:8}}>
          <button style={{...S.btnPrimary,flex:1}} onClick={() => { loadLeaderboard().then(() => setScreen("account")); setScreen("account"); }}>↺ Refresh Rank</button>
          <button style={{...S.btnSecondary,flex:1}} onClick={() => setScreen("login")}>← BACK</button>
        </div>
      </div>
    </div>
  );

  if (screen === "achievements") return (
    <div style={S.root}>
      <div style={{...S.leaderCard,maxWidth:420}}>
        <h2 style={{...S.leaderTitle,color:"#d4a820"}}>🏅 ACHIEVEMENTS</h2>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20,maxHeight:"60vh",overflowY:"auto"}}>
          {ACHIEVEMENTS.map(ach => {
            const stats = userStats || userStatsRef.current;
            const earned = stats?.achievements?.includes(ach.id);
            const skin = SKINS.find(s => s.id === ach.unlocksSkin);
            return (
              <div key={ach.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,background:earned?"rgba(90,140,20,0.2)":"rgba(255,255,255,0.03)",border:`1px solid ${earned?"rgba(139,180,20,0.4)":"rgba(255,255,255,0.05)"}`}}>
                <span style={{fontSize:24,opacity:earned?1:0.3}}>{ach.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14,color:earned?"#c8e87a":"#7a6040"}}>{ach.name}</div>
                  <div style={{fontSize:11,color:"#7a6040",marginTop:2}}>{ach.desc}</div>
                  {skin && <div style={{fontSize:10,color:earned?"#86efac":"#555",marginTop:2}}>{earned?"✓ Unlocked":"🔒"} {skin.name} skin</div>}
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <span style={{fontSize:20}}>{earned?"✅":"⬜"}</span>
                  {!earned && achProgress(ach, userStats||userStatsRef.current) && (
                    <span style={{fontSize:10,color:"#a07040",whiteSpace:"nowrap"}}>{achProgress(ach, userStats||userStatsRef.current)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{fontSize:12,color:"#7a6040",textAlign:"center",marginBottom:12}}>
          {(userStats?.achievements?.length||0)} / {ACHIEVEMENTS.length} earned
          {(userStats?.achievements?.length||0) < ACHIEVEMENTS.length && (
            <div style={{marginTop:4,color:"#b8860b"}}>👑 Complete all to unlock the Legend skin</div>
          )}
          {(userStats?.unlockedSkins||[]).includes("legend") && (
            <div style={{marginTop:4,color:"#ffd700"}}>👑 Legend skin unlocked!</div>
          )}
        </div>
        <button style={S.btnPrimary} onClick={() => setScreen("login")}>← BACK</button>
      </div>
    </div>
  );

  if (screen === "privacy") return (
    <div style={S.root}>
      <div style={{...S.leaderCard,maxWidth:440}}>
        <h2 style={{...S.leaderTitle,fontSize:18}}>🔒 Privacy Policy</h2>
        <div style={{fontSize:12,color:"#c8a060",lineHeight:1.7,maxHeight:"65vh",overflowY:"auto",marginBottom:16}}>
          <p style={{fontWeight:700,color:"#c8e87a",marginTop:0}}>Snake Runner — Privacy Policy</p>
          <p><strong>Last updated:</strong> {new Date().getFullYear()}</p>
          <p><strong>What we collect:</strong> The only data stored is your chosen username and game statistics (high score, mice collected, achievements, selected skin). This data is stored locally in your browser and is not transmitted to any external server.</p>
          <p><strong>What we do NOT collect:</strong> We do not collect your real name, email address, phone number, location, device identifiers, or any personally identifiable information.</p>
          <p><strong>Leaderboard:</strong> If you choose to submit a score to the leaderboard, your username and score are stored in shared browser storage visible to other players of this artifact. No account is required and no password is stored.</p>
          <p><strong>Third-party services:</strong> This app does not use any third-party analytics, advertising networks, or tracking services.</p>
          <p><strong>Children:</strong> This app does not knowingly collect data from children under 13. No personal information is required to play.</p>
          <p><strong>Data deletion:</strong> To delete your data, clear your browser storage or use the Log Out button which removes your session.</p>
          <p><strong>Contact:</strong> For any privacy questions, contact the developer through the platform where this app is distributed.</p>
        </div>
        <button style={S.btnPrimary} onClick={() => setScreen("login")}>← BACK</button>
      </div>
    </div>
  );

  if (screen === "leaderboard") return (
    <div style={S.root}>
      <div style={S.leaderCard}>
        <h2 style={S.leaderTitle}>🏆 LEADERBOARD</h2>
        <div style={S.leaderList}>
          {leaderboard.length === 0 && <p style={{color:"#aaa",textAlign:"center"}}>No scores yet. Be the first!</p>}
          {leaderboard.map((entry, i) => (
            <div key={entry.username} style={{...S.leaderRow, background: i===0?"rgba(250,204,21,0.1)":i===1?"rgba(156,163,175,0.08)":i===2?"rgba(180,120,60,0.08)":"rgba(255,255,255,0.03)"}}>
              <span style={S.rank}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span>
              <span style={{...S.lName,color:entry.username===username?"#4ade80":"#e2e8f0"}}>{entry.username}</span>
              <span style={S.lScore}>{entry.score.toLocaleString()}</span>
              <span style={S.lDate}>{entry.date}</span>
            </div>
          ))}
        </div>
        <button style={S.btnPrimary} onClick={() => setScreen(username?"game":"login")}>{username?"▶ PLAY AGAIN":"← BACK"}</button>
      </div>
    </div>
  );

  if (screen === "gameover") return (
    <div style={S.root}>
      <div style={S.loginCard}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:64,marginBottom:8}}>💀</div>
          <h2 style={{color:"#f87171",fontSize:32,fontWeight:900,letterSpacing:2,margin:0}}>GAME OVER</h2>
          <p style={{color:"#94a3b8",marginTop:4}}>{username}</p>
        </div>
        <div style={{background:"rgba(74,222,128,0.08)",border:"1px solid rgba(74,222,128,0.2)",borderRadius:12,padding:"16px 24px",textAlign:"center",marginBottom:12}}>
          <p style={{color:"#94a3b8",margin:0,fontSize:13,letterSpacing:1}}>FINAL SCORE</p>
          <p style={{color:"#4ade80",fontSize:48,fontWeight:900,margin:"4px 0",letterSpacing:2}}>{finalScore.toLocaleString()}</p>
          {userStats && <p style={{color:"#d4a820",margin:0,fontSize:13}}>🏆 Best: {userStats.bestScore.toLocaleString()}{finalScore>=userStats.bestScore?" 🌟 NEW BEST!":""}</p>}
        </div>
        {newAchievements.length > 0 && (
          <div style={{background:"rgba(212,168,32,0.12)",border:"1px solid rgba(212,168,32,0.3)",borderRadius:10,padding:"10px 16px",marginBottom:12}}>
            <p style={{color:"#d4a820",margin:"0 0 6px",fontWeight:700,fontSize:13}}>🏅 Achievement{newAchievements.length>1?"s":""} Unlocked!</p>
            {newAchievements.map(a => <p key={a.id} style={{margin:"2px 0",fontSize:13,color:"#c8e87a"}}>{a.icon} {a.name}</p>)}
          </div>
        )}
        <button style={S.btnPrimary} onClick={() => setScreen("game")}>▶ PLAY AGAIN</button>
        <button style={{...S.btnSecondary,marginTop:8}} onClick={() => { loadLeaderboard(); setScreen("leaderboard"); }}>🏆 LEADERBOARD</button>
        <button style={{...S.btnSecondary,marginTop:8}} onClick={() => setScreen("login")}>🏠 MENU</button>
        <button style={{...S.btnSecondary,marginTop:8,opacity:0.5}} onClick={() => { usernameRef.current = ""; setUsername(""); setInputName(""); setUserStats(null); userStatsRef.current = null; selectedSkinRef.current = "classic"; setSelectedSkin("classic"); setScreen("login"); }}>← LOG OUT</button>
      </div>
    </div>
  );

  return (
    <div style={S.root} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div style={S.hud}>
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:2}}>
          <span style={S.hudUser}>🐍 {username}</span>
          <span style={{fontSize:11,color:"#c8a060"}}>🐭 {miceDisplay % 15}/15{miceDisplay >= 15 && miceDisplay % 15 === 0 ? " 🌟" : ""}</span>
        </div>
        <div style={S.hudScore}>
          <span style={S.scoreLabel}>SCORE</span>
          <span style={S.scoreVal}>{displayScore.toLocaleString()}</span>
          {shieldSecs > 0 && <span style={{fontSize:11,color:"#60cfff",fontWeight:700,marginTop:2}}>🛡️ {shieldSecs}s</span>}
        </div>
        <div style={{flex:1,display:"flex",justifyContent:"flex-end",gap:6}}>
<button style={S.hudBtn} onClick={toggleMusic}>{musicOn ? "🔊" : "🔇"}</button>
          <button style={S.hudBtn} onClick={() => { setScreen("leaderboard"); loadLeaderboard(); }}>🏆</button>
        </div>
      </div>
      <canvas ref={canvasRef} width={360} height={VISIBLE_ROWS * CELL_H} style={S.canvas} />

      <div style={S.legend}>
        <span>📦 Box = death</span><span>🐭 Mouse = +10</span><span>🟩 Row = +1</span>
      </div>
    </div>
  );
}

const S = {
  root:{minHeight:"100vh",minHeight:"100dvh",background:"linear-gradient(160deg,#2d5a1b 0%,#3d7a25 40%,#2a4f18 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"Georgia,'Times New Roman',serif",color:"#f5e6c8",padding:"max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",boxSizing:"border-box",overflowY:"auto"},
  loginCard:{background:"rgba(60,35,10,0.82)",border:"2px solid #8b6014",borderRadius:12,padding:"36px 40px",width:"100%",maxWidth:360,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",display:"flex",flexDirection:"column"},
  logoWrap:{textAlign:"center",marginBottom:28},
  logoTitle:{margin:"8px 0 4px",fontSize:28,fontWeight:900,letterSpacing:3,color:"#c8e87a",textShadow:"0 2px 6px rgba(0,0,0,0.5)"},
  logoSub:{color:"#a09060",margin:0,fontSize:13,letterSpacing:1,fontStyle:"italic"},
  formGroup:{display:"flex",flexDirection:"column",gap:8},
  label:{color:"#c8a060",fontSize:13,letterSpacing:0.5},
  input:{background:"rgba(255,240,200,0.1)",border:"1px solid #8b6014",borderRadius:6,color:"#f5e6c8",padding:"12px 14px",fontSize:16,outline:"none"},
  error:{color:"#f87171",fontSize:12,margin:"2px 0 0"},
  btnPrimary:{background:"linear-gradient(135deg,#5a8c20,#3d6015)",color:"#e8f5c0",border:"2px solid #7ab030",borderRadius:8,padding:"13px",fontSize:15,fontWeight:700,letterSpacing:1.5,cursor:"pointer",marginTop:4,textShadow:"0 1px 3px rgba(0,0,0,0.4)"},
  btnSecondary:{background:"rgba(100,65,15,0.5)",color:"#c8a060",border:"1px solid #6b4810",borderRadius:8,padding:"11px",fontSize:14,cursor:"pointer",letterSpacing:0.5},
  hint:{color:"#7a9050",fontSize:11,textAlign:"center",marginTop:20,marginBottom:0,fontStyle:"italic"},
  leaderCard:{background:"rgba(60,35,10,0.88)",border:"2px solid #8b6014",borderRadius:12,padding:"28px 24px",width:"100%",maxWidth:440,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"},
  leaderTitle:{margin:"0 0 20px",fontSize:22,fontWeight:900,letterSpacing:2,textAlign:"center",color:"#d4a820"},
  leaderList:{marginBottom:20,display:"flex",flexDirection:"column",gap:6},
  leaderRow:{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:8,border:"1px solid rgba(139,96,20,0.3)"},
  rank:{fontSize:18,minWidth:32,textAlign:"center"},
  lName:{flex:1,fontWeight:600,fontSize:15},
  lScore:{color:"#c8e87a",fontWeight:800,fontSize:17,minWidth:60,textAlign:"right"},
  lDate:{color:"#7a6040",fontSize:11,minWidth:70,textAlign:"right"},
  hud:{display:"flex",alignItems:"center",width:"100%",maxWidth:360,padding:"8px 4px",marginBottom:4},
  hudUser:{color:"#c8e87a",fontWeight:700,fontSize:14,textShadow:"0 1px 3px rgba(0,0,0,0.6)"},
  hudScore:{display:"flex",flexDirection:"column",alignItems:"center"},
  scoreLabel:{color:"#7a9050",fontSize:10,letterSpacing:2},
  scoreVal:{color:"#d4a820",fontSize:24,fontWeight:900,lineHeight:1,textShadow:"0 1px 4px rgba(0,0,0,0.5)"},
  hudBtn:{background:"rgba(60,35,10,0.7)",border:"1px solid #8b6014",borderRadius:6,color:"#d4a820",fontSize:18,padding:"4px 10px",cursor:"pointer"},
  canvas:{display:"block",borderRadius:8,border:"3px solid #5c3d1a",boxShadow:"0 0 0 2px #8b6014, 0 8px 32px rgba(0,0,0,0.6)",maxWidth:"100%"},
  touchControls:{display:"flex",gap:24,marginTop:14},
  touchBtn:{background:"rgba(60,35,10,0.7)",border:"2px solid #8b6014",borderRadius:10,color:"#c8e87a",fontSize:24,padding:"12px 32px",cursor:"pointer",userSelect:"none",WebkitUserSelect:"none",touchAction:"manipulation"},
  legend:{display:"flex",gap:16,marginTop:12,color:"#7a9050",fontSize:12,flexWrap:"wrap",justifyContent:"center",fontStyle:"italic"},
};
