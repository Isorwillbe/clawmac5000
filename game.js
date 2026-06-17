/* ====================================================
   CHORE CLAW 3000 - Game Logic v3
   Now with: ball physics, claw bouncing, miss detection
   ==================================================== */

// ─── CHORE DATA ──────────────────────────────────────────────────────────────
const CHORES = [
  { id: 1,  name: "Do the dishes",      emoji: "🍽️",  difficulty: "easy",   xp: 10, weight: 1  },
  { id: 2,  name: "Take out trash",     emoji: "🗑️",  difficulty: "easy",   xp: 15, weight: 1  },
  { id: 3,  name: "Sweep the floor",    emoji: "🧹",  difficulty: "easy",   xp: 12, weight: 1  },
  { id: 4,  name: "Wipe counters",      emoji: "🧽",  difficulty: "easy",   xp: 10, weight: 1  },
  { id: 5,  name: "Do laundry",         emoji: "👕",  difficulty: "medium", xp: 25, weight: 3  },
  { id: 6,  name: "Mop the floors",     emoji: "🪣",  difficulty: "medium", xp: 30, weight: 3  },
  { id: 7,  name: "Clean the bathroom", emoji: "🚿",  difficulty: "medium", xp: 35, weight: 3  },
  { id: 8,  name: "Organize closet",    emoji: "🗄️",  difficulty: "medium", xp: 28, weight: 3  },
  { id: 9,  name: "Deep clean oven",    emoji: "🔥",  difficulty: "hard",   xp: 60, weight: 10 },
  { id: 10, name: "Clean the gutters",  emoji: "🏠",  difficulty: "hard",   xp: 75, weight: 10 },
  { id: 11, name: "Scrub the toilet",   emoji: "🚽",  difficulty: "hard",   xp: 55, weight: 10 },
  { id: 12, name: "Vacuum everything",  emoji: "🧹",  difficulty: "hard",   xp: 50, weight: 8  },
];

// ─── BALL COLORS BY DIFFICULTY ────────────────────────────────────────────────
const BALL_COLORS = {
  easy:   { fill: '#2a4a1a', stroke: '#9bbc0f', glow: '#9bbc0f' },
  medium: { fill: '#3a3000', stroke: '#f0c000', glow: '#f0c000' },
  hard:   { fill: '#3a0a0a', stroke: '#c44040', glow: '#c44040' },
};

// ─── GAME STATE ───────────────────────────────────────────────────────────────
let state = {
  coins:       3,
  xp:          0,
  streak:      0,
  chores:      [...CHORES],
  completed:   [],
  isAnimating: false,
  clawX:       40,          // px from left of glass window (claw assembly left edge)
  glassWidth:  400,
  glassHeight: 340,
};

// ─── PHYSICS WORLD ────────────────────────────────────────────────────────────
const BALL_R      = 30;    // radius in px
const GRAVITY     = 0.35;
const BOUNCE_DAMP = 0.55;
const FRICTION    = 0.92;
const BALL_DAMP   = 0.88;  // ball-to-ball collision energy loss

let balls = [];            // array of ball objects
let physicsRAF = null;
let physicsCanvas = null;
let physicsCtx = null;

// ─── DOM REFS ─────────────────────────────────────────────────────────────────
const clawAssembly    = document.getElementById('clawAssembly');
const clawWire        = document.getElementById('clawWire');
const choreList       = document.getElementById('choreList');
const completedList   = document.getElementById('completedList');
const xpScore         = document.getElementById('xpScore');
const streakScore     = document.getElementById('streakScore');
const rankLabel       = document.getElementById('rankLabel');
const coinDisplay     = document.getElementById('coins');
const prizeDisplay    = document.getElementById('prizeDisplay');
const messageOverlay  = document.getElementById('messageOverlay');
const messageText     = document.getElementById('messageText');
const msgBtn          = document.getElementById('msgBtn');
const moveLeftBtn     = document.getElementById('moveLeftBtn');
const moveRightBtn    = document.getElementById('moveRightBtn');
const dropBtn         = document.getElementById('dropBtn');
const joystickStick   = document.getElementById('joystickStick');
const glassWindow     = document.getElementById('glassWindow');
const cabinet         = document.getElementById('cabinet');
const prizesContainer = document.getElementById('prizesContainer');

// ─── AUDIO SYSTEM ─────────────────────────────────────────────────────────────
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function playTone(freq, type, duration, gainVal = 0.3, startTime = 0) {
  try {
    const ctx = getAudio(), osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime + startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTime + duration);
    osc.start(ctx.currentTime + startTime); osc.stop(ctx.currentTime + startTime + duration);
  } catch(e) {}
}
function playNoise(duration, gainVal = 0.15) {
  try {
    const ctx = getAudio(), bufLen = ctx.sampleRate * duration;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = buf; src.connect(gain); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    src.start(); src.stop(ctx.currentTime + duration);
  } catch(e) {}
}

const SFX = {
  coin()      { playTone(880,'square',0.08,0.2); playTone(1320,'square',0.08,0.2,0.08); },
  move()      { playNoise(0.05,0.06); playTone(200,'sawtooth',0.05,0.08); },
  clawStart() {
    try {
      const ctx=getAudio(),osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination); osc.type='sawtooth';
      osc.frequency.setValueAtTime(80,ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(140,ctx.currentTime+0.4);
      gain.gain.setValueAtTime(0.18,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.5);
      osc.start(); osc.stop(ctx.currentTime+0.5);
    } catch(e) {}
  },
  creak() {
    try {
      const ctx=getAudio(),osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination); osc.type='sawtooth';
      osc.frequency.setValueAtTime(60,ctx.currentTime);
      osc.frequency.setValueAtTime(55,ctx.currentTime+0.05);
      osc.frequency.setValueAtTime(65,ctx.currentTime+0.10);
      osc.frequency.setValueAtTime(50,ctx.currentTime+0.15);
      gain.gain.setValueAtTime(0.22,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.3);
      osc.start(); osc.stop(ctx.currentTime+0.3);
    } catch(e) {}
    playNoise(0.15,0.08);
  },
  grab()   { playTone(220,'square',0.12,0.25); playTone(180,'square',0.12,0.20,0.05); playNoise(0.08,0.12); },
  miss()   { playTone(300,'sawtooth',0.08,0.2); playTone(200,'sawtooth',0.1,0.2,0.08); playNoise(0.12,0.08); },
  bounce() { playTone(440,'square',0.05,0.18); playNoise(0.04,0.1); },
  loosen() { playTone(900,'sine',0.06,0.15); playTone(700,'sine',0.06,0.12,0.06); playNoise(0.1,0.07); },
  win()    { [523,659,784,1047].forEach((f,i) => playTone(f,'square',0.15,0.25,i*0.12)); },
};

let bombAudio = null;
function loadBomb() {
  bombAudio = new Audio('c:\\Users\\alexx\\OneDrive\\Documents\\Starfoxgame\\SFX\\BombDetonate.wav');
  bombAudio.volume = 1.0;
}
function playBomb() { if (bombAudio) { bombAudio.currentTime=0; bombAudio.play().catch(()=>{}); } }

// ─── RANK SYSTEM ─────────────────────────────────────────────────────────────
const RANKS = [
  { min: 0,   label: "ROOKIE",   color: "#9bbc0f" },
  { min: 50,  label: "TRAINEE",  color: "#f0c000" },
  { min: 150, label: "DECENT",   color: "#d87800" },
  { min: 300, label: "HUSTLER",  color: "#c44040" },
  { min: 500, label: "LEGEND",   color: "#7030a0" },
  { min: 800, label: "GOD MODE", color: "#c44040" },
];

const GRAB_MSGS = {
  easy:   ["Easy peasy! 🍋 But hey, you still did it!", "Blink and it's done! ✅ XP earned!", "Barely counts... but XP is XP! 😏"],
  medium: ["Decent work! 💪 The streak grows!", "Not bad... you might be getting good 👀", "Medium difficulty? More like medium awesome. 🎮"],
  hard:   ["OH NO... the claw has SPOKEN. 😱", "THE MACHINE HAS CHOSEN YOUR FATE. 🎰", "YIKES. The hard one. MASSIVE XP! 🏆", "What are the odds?? ...or are you? 😏", "Machine needs a refund. Get scrubbing. 🧽"],
};
const LOOSEN_MSGS = [
  "IT SLIPPED!!! 😭 The claw went limp...",
  "SO CLOSE! The claw is weak and pathetic. 😤",
  "Mechanical malfunction! (touch grass and try again)",
  "THE CLAW BETRAYED YOU. File a complaint with nobody.",
];
const MISS_MSGS = [
  "WHIFF! The claw grabbed pure air. 💨 Nothing there!",
  "Nice try but the claw caught NOTHING. Classic. 😂",
  "MISS! Maybe aim at an actual chore next time?? 🎯",
  "The claw descended into the void and found... nothing. 😶",
];

// ─── CANVAS PHYSICS SETUP ────────────────────────────────────────────────────
function setupCanvas() {
  // Remove old canvas if any
  const old = document.getElementById('physicsCanvas');
  if (old) old.remove();

  const cw = glassWindow.offsetWidth  || 420;
  const ch = glassWindow.offsetHeight || 340;
  state.glassWidth  = cw;
  state.glassHeight = ch;

  // The canvas sits inside the glass window, covering the prizes area
  const cnv = document.createElement('canvas');
  cnv.id     = 'physicsCanvas';
  cnv.width  = cw;
  cnv.height = ch;
  cnv.style.cssText = `
    position:absolute; top:0; left:0;
    width:100%; height:100%;
    pointer-events:none; z-index:5;
  `;
  glassWindow.appendChild(cnv);
  physicsCanvas = cnv;
  physicsCtx    = cnv.getContext('2d');
}

// ─── BALL CREATION ────────────────────────────────────────────────────────────
function createBalls() {
  balls = [];
  const cw = state.glassWidth;
  const ch = state.glassHeight;
  const floor = ch - BALL_R - 2;

  state.chores.forEach((chore, i) => {
    // Stagger starting positions across top, staggered heights so they fall nicely
    const cols = Math.floor(cw / (BALL_R * 2 + 8));
    const col  = i % cols;
    const row  = Math.floor(i / cols);
    const x    = BALL_R + 10 + col * (BALL_R * 2 + 8);
    const y    = -(row * (BALL_R * 2 + 10)) - BALL_R - 10;

    balls.push({
      id:    chore.id,
      chore: chore,
      x, y,
      vx: (Math.random() - 0.5) * 2,
      vy: Math.random() * 2,
      r:  BALL_R,
      floor,
      grabbed:   false,
      squish:    1.0,   // y-scale for squish on bounce
      squishVx:  0,
      angle:     Math.random() * Math.PI * 2,
      spin:      (Math.random() - 0.5) * 0.08,
      highlight: 0,     // 0-1 glow intensity for when claw targets it
    });
  });
}

// ─── PHYSICS LOOP ─────────────────────────────────────────────────────────────
function startPhysicsLoop() {
  if (physicsRAF) cancelAnimationFrame(physicsRAF);

  function step() {
    updateBalls();
    drawBalls();
    physicsRAF = requestAnimationFrame(step);
  }
  physicsRAF = requestAnimationFrame(step);
}

function updateBalls() {
  const cw = state.glassWidth;
  const WALL_L = BALL_R;
  const WALL_R_EDGE = cw - BALL_R;

  for (const b of balls) {
    if (b.grabbed) continue;

    b.vy += GRAVITY;
    b.vx *= FRICTION;
    b.x  += b.vx;
    b.y  += b.vy;
    b.angle += b.spin;

    // Squish recovery
    b.squish += (1.0 - b.squish) * 0.2;

    // Floor
    if (b.y + b.r > b.floor + b.r) {
      b.y  = b.floor;
      const impact = Math.abs(b.vy);
      b.vy = -b.vy * BOUNCE_DAMP;
      b.vx *= 0.85;
      b.spin *= 0.7;
      if (impact > 2) {
        b.squish = 0.6 + 0.4 * BOUNCE_DAMP; // squish on hard land
        if (impact > 5) SFX.bounce();
      }
      if (Math.abs(b.vy) < 0.5) b.vy = 0;
    }

    // Left wall
    if (b.x - b.r < 0) {
      b.x  = b.r;
      b.vx = Math.abs(b.vx) * BOUNCE_DAMP;
      b.spin = -b.spin;
    }
    // Right wall
    if (b.x + b.r > WALL_R_EDGE + b.r) {
      b.x  = WALL_R_EDGE;
      b.vx = -Math.abs(b.vx) * BOUNCE_DAMP;
      b.spin = -b.spin;
    }

    // Top (rail area ~30px)
    if (b.y - b.r < 30) {
      b.y  = 30 + b.r;
      b.vy = Math.abs(b.vy) * BOUNCE_DAMP;
    }
  }

  // Ball-to-ball collision
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], bBall = balls[j];
      if (a.grabbed || bBall.grabbed) continue;
      const dx = bBall.x - a.x;
      const dy = bBall.y - a.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const minDist = a.r + bBall.r;
      if (dist < minDist && dist > 0) {
        // Separate
        const overlap = (minDist - dist) / 2;
        const nx = dx / dist, ny = dy / dist;
        a.x -= nx * overlap; a.y -= ny * overlap;
        bBall.x += nx * overlap; bBall.y += ny * overlap;

        // Elastic-ish velocity exchange
        const dvx = a.vx - bBall.vx, dvy = a.vy - bBall.vy;
        const dot = dvx*nx + dvy*ny;
        if (dot > 0) {
          const impulse = dot * BALL_DAMP;
          a.vx    -= impulse * nx; a.vy    -= impulse * ny;
          bBall.vx += impulse * nx; bBall.vy += impulse * ny;
          // Squish both on collision
          a.squish    = 0.75; bBall.squish = 0.75;
          if (Math.abs(dot) > 3) SFX.bounce();
        }
      }
    }
  }
}

// ─── DRAW BALLS ───────────────────────────────────────────────────────────────
function drawBalls() {
  if (!physicsCtx) return;
  const ctx = physicsCtx;
  ctx.clearRect(0, 0, physicsCanvas.width, physicsCanvas.height);

  for (const b of balls) {
    if (b.grabbed) continue;

    const colors = BALL_COLORS[b.chore.difficulty];
    const r = b.r;
    const sx = 1.0 / b.squish;        // stretch X when squished Y
    const sy = b.squish;

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.scale(sx, sy);

    // Glow ring if highlighted
    if (b.highlight > 0.1) {
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur  = 20 * b.highlight;
    }

    // Ball body
    const grad = ctx.createRadialGradient(-r*0.3, -r*0.35, r*0.1, 0, 0, r);
    grad.addColorStop(0, lighten(colors.fill, 0.5));
    grad.addColorStop(1, colors.fill);
    ctx.beginPath();
    ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Stroke ring
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth   = 2.5;
    ctx.stroke();

    // Difficulty ring pulse on highlight
    if (b.highlight > 0.1) {
      ctx.strokeStyle = colors.glow;
      ctx.lineWidth   = 3 * b.highlight;
      ctx.globalAlpha = b.highlight;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.shadowBlur = 0;
    ctx.rotate(-b.angle); // unrotate so emoji is upright

    // Emoji
    ctx.font = `${r * 0.95}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.chore.emoji, 0, 1);

    ctx.restore();

    // Fade highlight over time (done outside transform)
    b.highlight *= 0.95;
  }
}

function lighten(hex, amt) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), bv = parseInt(hex.slice(5,7),16);
  return `rgb(${Math.min(255,r+amt*80)},${Math.min(255,g+amt*80)},${Math.min(255,bv+amt*80)})`;
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init() {
  renderChoreList();
  updateScoreboard();
  updateCoins();
  loadBomb();

  // Hide prizesContainer (canvas replaces it)
  prizesContainer.style.display = 'none';

  requestAnimationFrame(() => requestAnimationFrame(() => {
    measureGlass();
    setupCanvas();
    createBalls();
    startPhysicsLoop();
    setClawPosition(state.clawX);
  }));

  window.addEventListener('resize', () => {
    measureGlass();
    if (physicsCanvas) {
      physicsCanvas.width  = state.glassWidth;
      physicsCanvas.height = state.glassHeight;
      balls.forEach(b => { b.floor = state.glassHeight - b.r - 2; });
    }
  });
}

function measureGlass() {
  state.glassWidth  = glassWindow.offsetWidth  || 420;
  state.glassHeight = glassWindow.offsetHeight || 340;
}

// ─── RENDER SIDE CHORE LIST ───────────────────────────────────────────────────
function renderChoreList() {
  choreList.innerHTML = '';
  state.chores.forEach(chore => {
    const el = document.createElement('div');
    el.className = `chore-item difficulty-${chore.difficulty}`;
    el.id = `chore-item-${chore.id}`;
    el.innerHTML = `
      <span style="font-size:16px">${chore.emoji}</span>
      <span>${chore.name}</span>
      <span class="chore-diff-badge">${chore.difficulty.toUpperCase()}</span>
      <span class="chore-xp">+${chore.xp} XP</span>
    `;
    choreList.appendChild(el);
  });
}

// ─── SCOREBOARD ───────────────────────────────────────────────────────────────
function updateScoreboard() {
  xpScore.textContent    = state.xp;
  streakScore.textContent = state.streak;
  const rank = [...RANKS].reverse().find(r => state.xp >= r.min) || RANKS[0];
  rankLabel.textContent  = rank.label;
  rankLabel.style.color  = rank.color;
}
function updateCoins() { coinDisplay.textContent = state.coins; }

// ─── CLAW MOVEMENT ────────────────────────────────────────────────────────────
const CLAW_MIN_X = 14;
const CLAW_STEP  = 20;

function getClawMaxX() { return Math.max(state.glassWidth - 60, CLAW_MIN_X + 10); }

function setClawPosition(x) {
  state.clawX = Math.max(CLAW_MIN_X, Math.min(x, getClawMaxX()));
  clawAssembly.style.left = state.clawX + 'px';
  const frac = (state.clawX - CLAW_MIN_X) / (getClawMaxX() - CLAW_MIN_X);
  joystickStick.style.transform = `translateX(${(frac - 0.5) * 14}px)`;
}

moveLeftBtn.addEventListener('click', () => {
  if (state.isAnimating) return; SFX.move(); setClawPosition(state.clawX - CLAW_STEP);
});
moveRightBtn.addEventListener('click', () => {
  if (state.isAnimating) return; SFX.move(); setClawPosition(state.clawX + CLAW_STEP);
});
document.addEventListener('keydown', (e) => {
  if (state.isAnimating) return;
  if (e.key==='ArrowLeft')  { SFX.move(); setClawPosition(state.clawX - CLAW_STEP); e.preventDefault(); }
  if (e.key==='ArrowRight') { SFX.move(); setClawPosition(state.clawX + CLAW_STEP); e.preventDefault(); }
  if (e.key===' '||e.key==='Enter') { dropClaw(); e.preventDefault(); }
});

// ─── MACHINE CREAK ────────────────────────────────────────────────────────────
function machineTwitch(intensity = 1) {
  cabinet.classList.remove('machine-creak');
  void cabinet.offsetWidth;
  cabinet.classList.add('machine-creak');
  cabinet.addEventListener('animationend', () => cabinet.classList.remove('machine-creak'), { once: true });
  nudgeAllBalls(intensity * 2.5);
  SFX.creak();
}

function nudgeAllBalls(intensity) {
  for (const b of balls) {
    if (b.grabbed) continue;
    b.vx += (Math.random() - 0.5) * intensity;
    b.vy += -Math.random() * intensity * 0.4;
  }
}

// ─── THE RIG ALGORITHM ────────────────────────────────────────────────────────
// Returns the best ball to target — rigged toward hard chores.
// Also returns the REAL distance (for miss detection).
function pickTarget() {
  if (balls.length === 0) return null;

  const clawCenter = state.clawX + 20; // center X of claw in glass coords
  const candidates = balls.map(b => {
    const realDist   = Math.abs(b.x - clawCenter);
    const rigFactor  = { easy: 1.0, medium: 0.4, hard: 0.08 }[b.chore.difficulty];
    const riggedDist = realDist * rigFactor;
    return { ball: b, realDist, riggedDist };
  });

  candidates.sort((a, b) => a.riggedDist - b.riggedDist);

  const roll = Math.random();
  let chosen;
  if (roll < 0.80 || candidates.length === 1)      chosen = candidates[0];
  else if (roll < 0.95 || candidates.length === 2) chosen = candidates[1] || candidates[0];
  else                                              chosen = candidates[2] || candidates[0];

  return chosen; // { ball, realDist, riggedDist }
}

// ─── MISS DETECTION ───────────────────────────────────────────────────────────
// If the closest ball to the claw tip (in X) is farther than this threshold,
// the claw misses entirely.
const MISS_THRESHOLD = 30; // px — tight! you gotta actually aim

function getClosestBallDistance() {
  const clawCenter = state.clawX + 20;
  let minDist = Infinity;
  for (const b of balls) {
    const d = Math.abs(b.x - clawCenter);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// ─── LOOSEN CHANCE ────────────────────────────────────────────────────────────
function getLoosenChance(diff) {
  return { easy: 0.35, medium: 0.20, hard: 0.05 }[diff];
}

// ─── DROP THE CLAW ────────────────────────────────────────────────────────────
function dropClaw() {
  if (state.isAnimating) return;
  if (state.coins <= 0) {
    showMessage("NO COINS LEFT! 💸\nEarn more... or just do the chores.", () => {}); return;
  }
  if (balls.length === 0) {
    showMessage("THE MACHINE IS EMPTY. 🎊\nYou cleared it! ...Now actually do them.", () => {}); return;
  }

  state.isAnimating = true;
  state.coins--;
  updateCoins();
  SFX.coin();
  setControlsEnabled(false);

  // Check for miss before even picking
  const closestDist = getClosestBallDistance();
  const isMiss = closestDist > MISS_THRESHOLD;

  if (isMiss) {
    // Pure whiff — claw descends into empty space and comes back up
    SFX.clawStart();
    machineTwitch(0.5);
    const dropPx = state.glassHeight - 100;
    animateClawDrop(dropPx, () => {
      SFX.miss();
      machineTwitch(0.4);
      clawWire.classList.add('wire-stretch');
      setTimeout(() => clawWire.classList.remove('wire-stretch'), 300);
      animateClawAscend(dropPx, () => {
        state.isAnimating = false;
        setControlsEnabled(true);
        const msg = MISS_MSGS[Math.floor(Math.random() * MISS_MSGS.length)];
        showMessage(`❌ MISS!\n\n${msg}\n\n(coin spent. aim better next time)`, () => {});
      });
    });
    return;
  }

  // Pick target
  const picked = pickTarget();
  if (!picked) { state.isAnimating = false; setControlsEnabled(true); return; }

  const targetBall = picked.ball;

  // Highlight the target ball
  targetBall.highlight = 1.0;

  // Highlight in side list
  document.querySelectorAll('.chore-item').forEach(el => el.classList.remove('active-target'));
  const sideItem = document.getElementById(`chore-item-${targetBall.chore.id}`);
  if (sideItem) sideItem.classList.add('active-target');

  // Claw moves toward ball's current X
  const targetClawX = Math.max(CLAW_MIN_X, Math.min(targetBall.x - 20, getClawMaxX()));

  SFX.clawStart();

  animateClawToX(targetClawX, () => {
    machineTwitch(1);
    setTimeout(() => {
      // Calculate drop distance to reach the ball
      // Ball Y in glass-window coords
      const dropPx = Math.max(30, targetBall.y - BALL_R - 50);

      // While descending, push balls that the claw passes over
      startClawBouncePhase(dropPx, targetBall, () => {
        // At bottom — clamp and try grip
        SFX.creak();
        machineTwitch(0.6);
        clawWire.classList.add('wire-stretch');
        setTimeout(() => clawWire.classList.remove('wire-stretch'), 300);

        clawAssembly.classList.add('gripping');
        SFX.grab();

        // Check if ball is actually still close enough (it may have rolled away)
        const clawCenter = state.clawX + 20;
        const ballDist   = Math.abs(targetBall.x - clawCenter);

        if (ballDist > BALL_R * 2.2) {
          // Ball rolled away during descent — loose grip fail
          SFX.loosen();
          clawAssembly.classList.remove('gripping');
          machineTwitch(1);
          animateClawAscend(dropPx, () => {
            document.querySelectorAll('.chore-item').forEach(el => el.classList.remove('active-target'));
            state.isAnimating = false;
            setControlsEnabled(true);
            const msg = LOOSEN_MSGS[Math.floor(Math.random() * LOOSEN_MSGS.length)];
            showMessage(`😤 IT ROLLED AWAY!\n\n${msg}\n\n(ball was too slippery. classic.)`, () => {});
          });
          return;
        }

        setTimeout(() => {
          const slipChance = getLoosenChance(targetBall.chore.difficulty);
          const didSlip    = Math.random() < slipChance;

          if (didSlip) {
            SFX.loosen();
            clawAssembly.classList.remove('gripping');
            // Bounce the ball away
            targetBall.vy = -9;
            targetBall.vx = (Math.random() - 0.5) * 8;
            machineTwitch(1.5);
            animateClawAscend(dropPx, () => {
              document.querySelectorAll('.chore-item').forEach(el => el.classList.remove('active-target'));
              state.isAnimating = false;
              setControlsEnabled(true);
              const msg = LOOSEN_MSGS[Math.floor(Math.random() * LOOSEN_MSGS.length)];
              showMessage(`😬 THE CLAW LOOSENED!\n\n${msg}\n\n(coin spent. F in chat)`, () => {});
            });
          } else {
            // SUCCESS — ball rides up with the claw
            targetBall.grabbed = true;
            animateClawWithBall(targetBall, dropPx, () => {
              clawAssembly.classList.remove('gripping');
              machineTwitch(0.8);
              completeChore(targetBall);
            });
          }
        }, 350);
      });
    }, 200);
  });
}

// ─── CLAW DESCENT WITH BALL BOUNCING ─────────────────────────────────────────
// While the claw descends, any ball too close to its X gets knocked away.
function startClawBouncePhase(dropPx, targetBall, callback) {
  const startH  = parseInt(getComputedStyle(clawWire).height) || 60;
  const targetH = startH + dropPx;
  const totalMs = 500;
  const startT  = performance.now();

  function frame(now) {
    const p    = Math.min((now - startT) / totalMs, 1);
    const curH = startH + (targetH - startH) * easeInOut(p);
    clawWire.style.height = curH + 'px';

    // Claw tip Y in glass-window coords = wire height + head height + rail offset
    const clawTipY   = curH + 50;  // approximate claw head bottom
    const clawCenter = state.clawX + 20;

    // Push non-target balls away if claw overlaps them
    for (const b of balls) {
      if (b === targetBall || b.grabbed) continue;
      const dx   = b.x - clawCenter;
      const dy   = b.y - clawTipY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < b.r + 18 && dist > 0) {
        const force = (b.r + 18 - dist) / (b.r + 18);
        b.vx += (dx / dist) * force * 5;
        b.vy += (dy / dist) * force * 3 - 1;
        b.squish = 0.7;
        SFX.bounce();
      }
    }

    if (p < 1) requestAnimationFrame(frame);
    else callback();
  }
  requestAnimationFrame(frame);
}

// ─── CLAW ASCEND WITH GRABBED BALL ───────────────────────────────────────────
function animateClawWithBall(ball, dropPx, callback) {
  const startH  = parseInt(getComputedStyle(clawWire).height) || 60;
  const targetH = Math.max(60, startH - dropPx);
  const totalMs = 600;
  const startT  = performance.now();

  function frame(now) {
    const p    = Math.min((now - startT) / totalMs, 1);
    const curH = startH + (targetH - startH) * easeInOut(p);
    clawWire.style.height = curH + 'px';

    // Keep ball attached to claw tip
    ball.y = curH + 44;
    ball.x = state.clawX + 20;

    if (p < 1) requestAnimationFrame(frame);
    else {
      clawWire.style.height = '60px';
      callback();
    }
  }
  requestAnimationFrame(frame);
}

// ─── CLAW ANIMATIONS ─────────────────────────────────────────────────────────
function animateClawToX(targetX, callback) {
  const startX  = state.clawX;
  const delta   = targetX - startX;
  const totalMs = Math.max(200, Math.abs(delta) * 3);
  const startT  = performance.now();
  function frame(now) {
    const p = Math.min((now - startT) / totalMs, 1);
    setClawPosition(startX + delta * easeInOut(p));
    if (p < 1) requestAnimationFrame(frame);
    else { setClawPosition(targetX); callback(); }
  }
  requestAnimationFrame(frame);
}

function animateClawDrop(dropPx, callback) {
  const startH  = parseInt(getComputedStyle(clawWire).height) || 60;
  const targetH = startH + dropPx;
  const totalMs = 500;
  const startT  = performance.now();
  function frame(now) {
    const p = Math.min((now - startT) / totalMs, 1);
    clawWire.style.height = (startH + (targetH - startH) * easeInOut(p)) + 'px';
    if (p < 1) requestAnimationFrame(frame); else callback();
  }
  requestAnimationFrame(frame);
}

function animateClawAscend(dropPx, callback) {
  const startH  = parseInt(getComputedStyle(clawWire).height) || 60;
  const targetH = Math.max(60, startH - dropPx);
  const totalMs = 500;
  const startT  = performance.now();
  function frame(now) {
    const p = Math.min((now - startT) / totalMs, 1);
    clawWire.style.height = (startH + (targetH - startH) * easeInOut(p)) + 'px';
    if (p < 1) requestAnimationFrame(frame);
    else { clawWire.style.height = '60px'; callback(); }
  }
  requestAnimationFrame(frame);
}

function easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

// ─── COMPLETE CHORE ───────────────────────────────────────────────────────────
function completeChore(ball) {
  const chore = ball.chore;

  // Remove ball from array
  balls = balls.filter(b => b !== ball);

  state.chores = state.chores.filter(c => c.id !== chore.id);
  state.xp    += chore.xp;
  state.streak++;

  prizeDisplay.textContent = chore.emoji;
  prizeDisplay.animate([
    { transform: 'scale(0) rotate(-180deg)', opacity: 0 },
    { transform: 'scale(1.3) rotate(10deg)', opacity: 1, offset: 0.7 },
    { transform: 'scale(1)   rotate(0deg)',  opacity: 1 },
  ], { duration: 500, fill: 'forwards' });

  state.completed.push(chore);
  renderCompletedList();
  updateScoreboard();

  const item = document.getElementById(`chore-item-${chore.id}`);
  if (item) item.remove();

  const coinReward = { easy: 1, medium: 2, hard: 3 }[chore.difficulty];
  state.coins += coinReward;
  updateCoins();

  SFX.win();
  triggerParticles(chore.difficulty);

  const msgs    = GRAB_MSGS[chore.difficulty];
  const msg     = msgs[Math.floor(Math.random() * msgs.length)];
  const fullMsg = `${chore.emoji} ${chore.name.toUpperCase()}\n\n${msg}\n\n+${chore.xp} XP  |  +${coinReward} 🪙 coin${coinReward > 1 ? 's' : ''}!`;

  setTimeout(() => {
    state.isAnimating = false;
    setControlsEnabled(true);
    document.querySelectorAll('.chore-item').forEach(el => el.classList.remove('active-target'));

    if (balls.length === 0) triggerBoomEnding();
    else showMessage(fullMsg, () => {});
  }, 400);
}

// ─── BOOM ENDING ─────────────────────────────────────────────────────────────
function triggerBoomEnding() {
  playBomb();
  machineTwitch(5); setTimeout(() => machineTwitch(4), 200); setTimeout(() => machineTwitch(6), 400);
  clawAssembly.classList.add('claw-explode');
  triggerBoomParticles();
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:9999;animation:boomFlash 0.6s ease-out forwards;pointer-events:none;';
  document.body.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove());
  setTimeout(() => {
    const rank = [...RANKS].reverse().find(r => state.xp >= r.min) || RANKS[0];
    showMessage(
      `💥 BOOM! THE CLAW EXPLODED! 💥\n\nALL CHORES OBLITERATED\n\nYou are a MACHINE.\nThe claw couldn't handle your energy.\n\nFINAL XP: ${state.xp}\nFINAL RANK: ${rank.label}\n\n🏆 CLAWMACHINE DEFEATED 🏆`,
      () => {}
    );
  }, 900);
}

function triggerBoomParticles() {
  const pc = document.getElementById('particles');
  const icons = ['💥','🔥','⭐','🏆','🎊','💣','✨','🌟','💀','🎉'];
  for (let i = 0; i < 50; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'particle';
      p.textContent = icons[Math.floor(Math.random() * icons.length)];
      p.style.left = (Math.random()*95)+'vw'; p.style.top = (Math.random()*60)+'vh';
      p.style.animationDuration = (0.8+Math.random()*2.5)+'s';
      p.style.fontSize = (18+Math.random()*28)+'px';
      pc.appendChild(p); p.addEventListener('animationend', () => p.remove());
    }, i * 40);
  }
}

// ─── RENDER COMPLETED LIST ────────────────────────────────────────────────────
function renderCompletedList() {
  if (state.completed.length === 0) {
    completedList.innerHTML = '<p class="empty-msg">Nothing yet... get to work!</p>'; return;
  }
  completedList.innerHTML = '';
  [...state.completed].reverse().forEach(chore => {
    const el = document.createElement('div');
    el.className = 'completed-item';
    el.innerHTML = `<span>${chore.emoji}</span> <span>${chore.name}</span> <span style="margin-left:auto;font-size:6px;color:var(--gbc-yellow)">+${chore.xp}xp</span>`;
    completedList.appendChild(el);
  });
}

// ─── PARTICLES ───────────────────────────────────────────────────────────────
function triggerParticles(difficulty) {
  const pc = document.getElementById('particles');
  const icons = {
    easy:   ['✅','⭐','💚','🎮'],
    medium: ['🎉','⚡','💛','🎯'],
    hard:   ['🏆','🔥','💜','💥','🎊','🌟'],
  }[difficulty];
  const count = difficulty==='hard' ? 18 : difficulty==='medium' ? 12 : 8;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'particle';
      p.textContent = icons[Math.floor(Math.random()*icons.length)];
      p.style.left = (Math.random()*95)+'vw'; p.style.top = (Math.random()*-10)+'vh';
      p.style.animationDuration = (1.5+Math.random()*2)+'s';
      p.style.fontSize = (14+Math.random()*16)+'px';
      pc.appendChild(p); p.addEventListener('animationend', () => p.remove());
    }, i * 60);
  }
}

// ─── MESSAGE BOX ─────────────────────────────────────────────────────────────
function showMessage(text, onClose) {
  messageText.innerHTML = text.replace(/\n/g, '<br>');
  messageOverlay.style.display = 'flex';
  const close = () => {
    messageOverlay.style.display = 'none';
    msgBtn.removeEventListener('click', close);
    onClose && onClose();
  };
  msgBtn.addEventListener('click', close);
}

// ─── CONTROLS TOGGLE ─────────────────────────────────────────────────────────
function setControlsEnabled(enabled) {
  moveLeftBtn.disabled = !enabled;
  moveRightBtn.disabled = !enabled;
  dropBtn.disabled = !enabled;
}

dropBtn.addEventListener('click', dropClaw);

// ─── BOOT ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  init();
  setTimeout(() => {
    showMessage(
      "🕹️ CHORE CLAW 3000\n\nUse ◀ ▶ to aim the claw,\nthen DROP CLAW to grab a chore!\n\n⚠️ CAUTION:\nChores are now BALLS.\nThey bounce. They roll. They flee.\n\nAim carefully — miss too far\nand the claw grabs NOTHING.\n\nComplete ALL chores for a\nvery special surprise... 💥",
      () => {}
    );
  }, 600);
});
