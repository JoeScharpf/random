(function () {
  "use strict";

  const STORAGE_KEY = "dino-hi-score";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const hiScoreEl = document.getElementById("hi-score");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const dinoImage = new Image();
  let dinoImageLoaded = false;
  dinoImage.addEventListener("load", () => {
    dinoImageLoaded = true;
  });
  dinoImage.src = "image_1.png";
  const dinoDeadImage = new Image();
  let dinoDeadImageLoaded = false;
  dinoDeadImage.addEventListener("load", () => {
    dinoDeadImageLoaded = true;
  });
  dinoDeadImage.src = "image_2.png";

  const LOGICAL_WIDTH = 800;
  const LOGICAL_HEIGHT = 200;
  const BASELINE = 168;
  const GROUND_LINE = 4;

  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(LOGICAL_WIDTH * dpr);
    canvas.height = Math.floor(LOGICAL_HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  let highScore = 0;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw != null) highScore = Math.max(0, parseInt(raw, 10) || 0);
  } catch (_) {}
  hiScoreEl.textContent = String(highScore).padStart(5, "0");

  const keys = { duck: false };

  const dino = {
    x: 80,
    y: BASELINE - 48,
    w: 44,
    h: 48,
    vy: 0,
    duckH: 28,
    get onGround() {
      return this.y >= BASELINE - this.h;
    },
  };
  const DINO_SPRITE_SCALE = 1.35;
  const DINO_SPRITE_Y_OFFSET = 10;
  const DINO_DEAD_SPRITE_SCALE = 1.48;

  const GRAVITY = 2400;
  const JUMP_V = -620;
  const SPEED_START = 260;
  const SPEED_MAX = 520;
  const SPEED_RAMP_PER_SEC = 6;

  let obstacles = [];
  let nextSpawnIn = 0;
  let distance = 0;
  let speed = SPEED_START;
  let running = false;
  let gameOver = false;
  let started = false;
  let lastTime = 0;
  let rafId = 0;
  let groundOffset = 0;
  let nightMode = false;
  let blinkPhase = 0;
  let lastNightToggleScore = -1;

  function resetGame() {
    dino.y = BASELINE - dino.h;
    dino.vy = 0;
    obstacles = [];
    nextSpawnIn = 0.9;
    distance = 0;
    speed = SPEED_START;
    gameOver = false;
    groundOffset = 0;
    nightMode = false;
    blinkPhase = 0;
    lastNightToggleScore = -1;
  }

  function showOverlay(title, hintVisible = true) {
    overlayTitle.textContent = title;
    document.getElementById("overlay-hint").style.display = hintVisible
      ? ""
      : "none";
    overlay.classList.add("visible");
  }

  function hideOverlay() {
    overlay.classList.remove("visible");
  }

  function spawnObstacle() {
    const roll = Math.random();
    const fromRight = LOGICAL_WIDTH + 20;

    if (roll < 0.22 && distance > 400) {
      const h = 18;
      const w = 36;
      const yHigh = BASELINE - 70 - h;
      const yLow = BASELINE - 48 - h;
      obstacles.push({
        type: "ptero",
        x: fromRight,
        y: Math.random() < 0.5 ? yHigh : yLow,
        w,
        h,
      });
    } else {
      const cluster = 1 + Math.floor(Math.random() * 3);
      const unitW = 16 + Math.floor(Math.random() * 8);
      const unitH = 36 + Math.floor(Math.random() * 10);
      const gap = 4;
      for (let i = 0; i < cluster; i++) {
        obstacles.push({
          type: "cactus",
          x: fromRight + i * (unitW + gap),
          y: BASELINE - unitH,
          w: unitW,
          h: unitH,
        });
      }
    }
  }

  function minGapForSpeed() {
    const base = 280 + (speed / SPEED_MAX) * 120;
    return Math.min(520, base);
  }

  function trySpawn(dt) {
    nextSpawnIn -= dt;
    if (nextSpawnIn > 0) return;

    const rightmost = obstacles.reduce(
      (m, o) => Math.max(m, o.x + o.w),
      -Infinity
    );
    const gapNeeded =
      rightmost < 0 ? 0 : minGapForSpeed() - (LOGICAL_WIDTH - rightmost);

    if (rightmost >= 0 && gapNeeded > 0) {
      nextSpawnIn = 0.05;
      return;
    }

    spawnObstacle();
    nextSpawnIn = 0.85 + Math.random() * 0.65;
  }

  function dinoHitbox() {
    const duck = keys.duck && dino.onGround;
    const h = duck ? dino.duckH : dino.h;
    const y = duck ? dino.y + (dino.h - dino.duckH) : dino.y;
    const shrink = 6;
    return {
      x: dino.x + shrink * 0.5,
      y: y + shrink * 0.5,
      w: dino.w - shrink,
      h: h - shrink,
    };
  }

  function obstacleHitbox(o) {
    const padX = 4;
    const padY = o.type === "ptero" ? 3 : 5;
    return {
      x: o.x + padX,
      y: o.y + padY,
      w: o.w - padX * 2,
      h: o.h - padY * 2,
    };
  }

  function aabb(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function checkCollisions() {
    const db = dinoHitbox();
    for (const o of obstacles) {
      if (aabb(db, obstacleHitbox(o))) return true;
    }
    return false;
  }

  function updateScoreDisplay() {
    const s = Math.floor(distance / 8);
    scoreEl.textContent = String(s).padStart(5, "0");
    if (s > highScore) {
      highScore = s;
      hiScoreEl.textContent = String(highScore).padStart(5, "0");
      try {
        localStorage.setItem(STORAGE_KEY, String(highScore));
      } catch (_) {}
    }
  }

  function update(dt) {
    if (gameOver || !running) return;

    speed = Math.min(SPEED_MAX, speed + SPEED_RAMP_PER_SEC * dt);
    distance += speed * dt;
    groundOffset = (groundOffset + speed * dt) % 24;

    const scoreNow = Math.floor(distance / 8);
    if (
      scoreNow > 0 &&
      scoreNow % 700 === 0 &&
      scoreNow !== lastNightToggleScore
    ) {
      nightMode = !nightMode;
      lastNightToggleScore = scoreNow;
    }

    dino.vy += GRAVITY * dt;
    dino.y += dino.vy * dt;
    if (dino.y > BASELINE - dino.h) {
      dino.y = BASELINE - dino.h;
      dino.vy = 0;
    }

    trySpawn(dt);

    for (const o of obstacles) {
      o.x -= speed * dt;
    }
    obstacles = obstacles.filter((o) => o.x + o.w > -40);

    if (checkCollisions()) {
      gameOver = true;
      running = false;
      showOverlay("Game over — Tap or Space to restart", true);
    }

    updateScoreDisplay();
  }

  function drawGround() {
    const gy = BASELINE;
    ctx.fillStyle = nightMode ? "#2a2a2a" : "#535353";
    ctx.fillRect(0, gy, LOGICAL_WIDTH, GROUND_LINE);

    ctx.strokeStyle = nightMode ? "#444" : "#ccc";
    ctx.lineWidth = 1;
    for (let x = -groundOffset; x < LOGICAL_WIDTH + 24; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, gy - 1);
      ctx.lineTo(x + 12, gy - 1);
      ctx.stroke();
    }
  }

  function drawDino() {
    const duck = keys.duck && dino.onGround;
    const h = duck ? dino.duckH : dino.h;
    const y = duck ? dino.y + (dino.h - dino.duckH) : dino.y;

    if (!started && !gameOver) {
      if (Math.floor(blinkPhase * 3) % 2 === 0) return;
    }

    const isDeadSprite = gameOver && dinoDeadImageLoaded;
    const spriteImage = isDeadSprite ? dinoDeadImage : dinoImageLoaded ? dinoImage : null;

    if (spriteImage) {
      const spriteScale = isDeadSprite ? DINO_DEAD_SPRITE_SCALE : DINO_SPRITE_SCALE;
      const drawW = dino.w * spriteScale;
      const drawH = h * spriteScale;
      const footY = y + h;
      const drawX = dino.x - (drawW - dino.w) * 0.5;
      const drawY = footY - drawH + DINO_SPRITE_Y_OFFSET;
      ctx.drawImage(spriteImage, drawX, drawY, drawW, drawH);
      return;
    }

    ctx.fillStyle = nightMode ? "#e0e0e0" : "#535353";
    ctx.fillRect(dino.x, y, dino.w, h);
  }

  function drawObstacles() {
    for (const o of obstacles) {
      ctx.fillStyle =
        o.type === "ptero"
          ? nightMode
            ? "#888"
            : "#777"
          : nightMode
            ? "#6a9a6a"
            : "#2d5a2d";
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }
  }

  function draw() {
    ctx.fillStyle = nightMode ? "#1a1a1a" : "#ffffff";
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    drawGround();
    drawObstacles();
    drawDino();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
    lastTime = now;

    if (!started && !gameOver) {
      blinkPhase += dt;
    }

    update(dt);
    draw();
    rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    lastTime = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(frame);
  }

  function handlePrimaryAction() {
    if (!started || gameOver) {
      resetGame();
      started = true;
      running = true;
      hideOverlay();
      startLoop();
      return;
    }
    if (dino.onGround) {
      dino.vy = JUMP_V;
    }
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (e.repeat) return;
      handlePrimaryAction();
    } else if (e.code === "ArrowDown") {
      e.preventDefault();
      keys.duck = true;
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowDown") {
      keys.duck = false;
    }
  });

  window.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      handlePrimaryAction();
    },
    { passive: false }
  );

  window.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    handlePrimaryAction();
  });

  showOverlay("Tap or Space to start", true);
  lastTime = performance.now();
  rafId = requestAnimationFrame(frame);
})();
