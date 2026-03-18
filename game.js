// game.js — ready-to-paste (adds death screen with "You Died" text and Play Again button)
// - Background visible immediately, Play overlay with centered green button and "GD Clone" title.
// - While waiting, background and button cycle every 2s.
// - When Play is pressed: music starts unmuted, the player/level appear, pause button becomes functional.
// - When the player dies (spike collision) a death overlay appears with "You Died", score, and Play Again / Main Menu buttons.
// - Place next to an HTML page that contains: <canvas id="game"></canvas>
// - Put your music file as "music.mp3" and player sprite as "player.png" (or change MUSIC_SRC / PLAYER_SRC).

(function () {
  const LOGICAL_W = 900;
  const LOGICAL_H = 300;
  const DEFAULT_MAX_DIM = 48;
  const PLAYER_SRC = 'player.png';
  const MUSIC_SRC = 'music.mp3';

  // Physics
  const GRAVITY = 1400;
  const JUMP_V = -520;
  const GROUND_Y_LOGICAL = 260;
  let BASE_SPEED = 200;

  // Platform tuning
  const PLATFORM_MIN_Y = 120;
  const PLATFORM_MID_Y = 160;
  const PLATFORM_MAX_Y = 200;

  const STAGES = [
    { color: '#7bd389', speedMul: 1.00 },
    { color: '#ff7a18', speedMul: 1.10 },
    { color: '#18b2ff', speedMul: 1.25 },
    { color: '#8a18ff', speedMul: 1.45 },
    { color: '#ff188f', speedMul: 1.70 }
  ];

  const STORAGE_KEY_HIGHSCORE = 'gd_highscore_v1';
  const STORAGE_KEY_MUTED = 'gd_muted_v1';

  window.addEventListener('load', init);

  function init() {
    // page baseline
    document.documentElement.style.height = '100%';
    document.body.style.margin = '0';
    document.body.style.height = '100%';
    document.body.style.background = '#000';

    const canvas = document.getElementById('game');
    if (!canvas) {
      console.error('[game] canvas #game not found');
      return;
    }
    canvas.style.position = 'fixed';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.display = 'block';
    canvas.style.zIndex = '1';
    canvas.style.background = 'transparent';
    canvas.tabIndex = 0;

    const ctx = canvas.getContext('2d');

    // Audio (created but not played until Play pressed)
    let audio = null;
    let audioReady = false;
    let audioPlayPromise = null;
    try {
      audio = new Audio();
      audio.src = MUSIC_SRC;
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0.9;
      audioReady = true;
    } catch (err) {
      console.warn('[game] audio init failed', err);
      audioReady = false;
      audio = null;
    }

    // Game flags
    let started = false; // false until Play pressed
    let paused = false;
    let exited = false;
    let dead = false; // true while death overlay visible

    // Stage / progression
    let worldProgress = 0;
    let currentStage = 0;
    let speed = Math.round(BASE_SPEED * STAGES[currentStage].speedMul);

    // Score
    let score = 0;
    let highScore = Number(localStorage.getItem(STORAGE_KEY_HIGHSCORE) || 0);
    let muted = localStorage.getItem(STORAGE_KEY_MUTED) === '1';

    // Player and level pools (initialized but not drawn until started)
    const player = {
      x: 81,
      y: 0,
      baseW: DEFAULT_MAX_DIM,
      baseH: DEFAULT_MAX_DIM,
      vy: 0,
      onGround: false,
      sprite: null,
      spriteLoaded: false,
      _prevBottom: undefined
    };

    const spikes = [];
    const platforms = [];
    for (let i = 0; i < 6; i++) spikes.push({ x: LOGICAL_W + i * 300, y: GROUND_Y_LOGICAL - 18, w: DEFAULT_MAX_DIM, h: Math.round(DEFAULT_MAX_DIM * 0.45) });
    for (let i = 0; i < 6; i++) platforms.push({ x: LOGICAL_W + i * 400, y: 200, w: DEFAULT_MAX_DIM * 2, h: Math.max(8, Math.round(DEFAULT_MAX_DIM * 0.25)) });

    // Load player sprite (optional)
    const imgEl = document.getElementById('playerAuto');
    if (imgEl && imgEl.complete && imgEl.naturalWidth) setPlayerSpriteFromImage(imgEl);
    else if (imgEl) {
      imgEl.addEventListener('load', () => setPlayerSpriteFromImage(imgEl));
      imgEl.addEventListener('error', () => programmaticLoad());
      setTimeout(() => { if (!player.spriteLoaded) programmaticLoad(); }, 400);
    } else programmaticLoad();

    function programmaticLoad() {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => setPlayerSpriteFromImage(img);
      img.onerror = () => console.warn('[game] player image load failed');
      img.src = `${PLAYER_SRC}?v=${Date.now()}`;
    }

    function setPlayerSpriteFromImage(img) {
      if (!img) return;
      player.sprite = img;
      player.spriteLoaded = true;
      const iw = img.width || DEFAULT_MAX_DIM;
      const ih = img.height || DEFAULT_MAX_DIM;
      const scale = DEFAULT_MAX_DIM / Math.max(iw, ih);
      player.baseW = Math.max(16, Math.round(iw * scale));
      player.baseH = Math.max(16, Math.round(ih * scale));
      player.y = GROUND_Y_LOGICAL - player.baseH;
      player.vy = 0;
      player.onGround = true;
      player._prevBottom = player.y + player.baseH;
    }

    // --- setPaused must exist before pause button listeners ---
    function setPaused(v) {
      if (!started || dead) return;
      paused = !!v;
      pauseOverlayEl.style.display = paused ? 'flex' : 'none';
      pauseBtnEl.title = paused ? 'Resume (Esc)' : 'Pause (Esc)';
      if (paused) {
        try { if (audioReady && audio) audio.pause(); } catch (e) {}
      } else {
        try { if (audioReady && audio) { audio.muted = muted; audio.play().catch(()=>{}); } } catch (e) {}
      }
      last = performance.now();
    }

    // Play overlay: transparent so canvas gradient shows through; green circular button centered
    const playOverlay = document.createElement('div');
    playOverlay.style.position = 'fixed';
    playOverlay.style.left = '0';
    playOverlay.style.top = '0';
    playOverlay.style.width = '100vw';
    playOverlay.style.height = '100vh';
    playOverlay.style.display = 'flex';
    playOverlay.style.alignItems = 'center';
    playOverlay.style.justifyContent = 'center';
    playOverlay.style.zIndex = '10005';
    playOverlay.style.pointerEvents = 'auto';
    playOverlay.style.background = 'transparent'; // let canvas gradient show

    // container to allow absolute-positioned title above button
    const playContainer = document.createElement('div');
    playContainer.style.position = 'relative';
    playContainer.style.display = 'flex';
    playContainer.style.alignItems = 'center';
    playContainer.style.justifyContent = 'center';
    playContainer.style.width = '100%';
    playContainer.style.maxWidth = '100%';
    playContainer.style.pointerEvents = 'none'; // allow only button to receive clicks

    const playBtn = document.createElement('div');
    playBtn.style.width = '120px';
    playBtn.style.height = '120px';
    playBtn.style.borderRadius = '50%';
    playBtn.style.display = 'flex';
    playBtn.style.alignItems = 'center';
    playBtn.style.justifyContent = 'center';
    playBtn.style.cursor = 'pointer';
    playBtn.style.boxShadow = '0 12px 36px rgba(0,0,0,0.45)';
    playBtn.style.transition = 'transform 120ms ease';
    playBtn.style.pointerEvents = 'auto';
    playBtn.style.background = '#2ecc71';

    const triangle = document.createElement('div');
    triangle.style.width = '0';
    triangle.style.height = '0';
    triangle.style.borderLeft = '36px solid white';
    triangle.style.borderTop = '22px solid transparent';
    triangle.style.borderBottom = '22px solid transparent';
    playBtn.appendChild(triangle);

    // Title element above the button
    const titleWrap = document.createElement('div');
    titleWrap.style.position = 'absolute';
    titleWrap.style.top = '-86px'; // sits above the button; adjust if needed
    titleWrap.style.left = '50%';
    titleWrap.style.transform = 'translateX(-50%)';
    titleWrap.style.pointerEvents = 'none';
    titleWrap.style.zIndex = '10006';
    titleWrap.style.textAlign = 'center';
    titleWrap.style.width = '100%';
    titleWrap.style.maxWidth = '420px';

    const titleEl = document.createElement('div');
    titleEl.textContent = 'Temu GD';
    titleEl.style.display = 'inline-block';
    titleEl.style.padding = '6px 14px';
    titleEl.style.fontFamily = '"Press Start 2P", "VT323", monospace, sans-serif';
    titleEl.style.fontWeight = '700';
    titleEl.style.letterSpacing = '2px';
    titleEl.style.fontSize = '18px';
    titleEl.style.color = '#b8ffb0';
    titleEl.style.textTransform = 'uppercase';
    titleEl.style.textShadow = '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000';
    titleEl.style.webkitTextStroke = '1px rgba(0,0,0,0.6)';
    titleEl.style.borderRadius = '6px';
    titleEl.style.background = 'rgba(0,0,0,0.18)';
    titleEl.style.backdropFilter = 'blur(4px)';
    titleEl.style.boxShadow = '0 6px 18px rgba(0,0,0,0.45)';
    titleEl.style.pointerEvents = 'none';

    titleWrap.appendChild(titleEl);

    // small pulsing animation for title
    let titlePulse = null;
    function startTitlePulse() {
      if (titlePulse) return;
      let scale = 1;
      let dir = 1;
      titlePulse = setInterval(() => {
        scale += dir * 0.008;
        if (scale > 1.04) dir = -1;
        if (scale < 0.98) dir = 1;
        titleEl.style.transform = `scale(${scale})`;
      }, 30);
    }
    function stopTitlePulse() {
      if (!titlePulse) return;
      clearInterval(titlePulse);
      titlePulse = null;
      titleEl.style.transform = 'scale(1)';
    }

    // assemble overlay
    playContainer.appendChild(titleWrap);
    playContainer.appendChild(playBtn);
    playOverlay.appendChild(playContainer);
    document.body.appendChild(playOverlay);

    // We'll cycle the stage index every 2 seconds while not started
    let preStartInterval = null;
    function startPreStartCycle() {
      if (preStartInterval) return;
      // set initial style immediately
      const stageColor = STAGES[currentStage].color;
      playBtn.style.background = `linear-gradient(180deg, ${shadeColor(stageColor, -8)}, ${stageColor})`;
      titleEl.style.color = shadeColor(stageColor, 6);
      startTitlePulse();
      preStartInterval = setInterval(() => {
        currentStage = (currentStage + 1) % STAGES.length;
        const sc = STAGES[currentStage].color;
        playBtn.style.background = `linear-gradient(180deg, ${shadeColor(sc, -8)}, ${sc})`;
        titleEl.style.color = shadeColor(sc, 6);
      }, 2000);
    }
    function stopPreStartCycle() {
      if (preStartInterval) {
        clearInterval(preStartInterval);
        preStartInterval = null;
      }
      stopTitlePulse();
    }

    // Pause button (hidden until started)
    const pauseBtnEl = document.createElement('button');
    pauseBtnEl.setAttribute('aria-label', 'Pause game');
    pauseBtnEl.title = 'Pause (Esc)';
    pauseBtnEl.type = 'button';
    pauseBtnEl.style.position = 'fixed';
    pauseBtnEl.style.right = '16px';
    pauseBtnEl.style.top = '16px';
    pauseBtnEl.style.width = '56px';
    pauseBtnEl.style.height = '56px';
    pauseBtnEl.style.padding = '0';
    pauseBtnEl.style.border = 'none';
    pauseBtnEl.style.borderRadius = '50%';
    pauseBtnEl.style.display = 'none';
    pauseBtnEl.style.alignItems = 'center';
    pauseBtnEl.style.justifyContent = 'center';
    pauseBtnEl.style.cursor = 'pointer';
    pauseBtnEl.style.zIndex = 10003;
    pauseBtnEl.style.background = 'transparent';
    pauseBtnEl.style.boxShadow = '0 6px 18px rgba(0,0,0,0.45)';
    pauseBtnEl.style.outline = 'none';

    const barWrap = document.createElement('span');
    barWrap.style.display = 'flex';
    barWrap.style.gap = '6px';
    barWrap.style.alignItems = 'center';
    barWrap.style.justifyContent = 'center';
    barWrap.style.width = '44px';
    barWrap.style.height = '44px';
    barWrap.style.borderRadius = '50%';
    barWrap.style.background = 'linear-gradient(180deg,#072b4a 0%, #0b3b66 100%)';
    barWrap.style.boxShadow = 'inset 0 -4px 8px rgba(0,0,0,0.25)';

    const b1 = document.createElement('span');
    const b2 = document.createElement('span');
    [b1, b2].forEach(b => {
      b.style.display = 'inline-block';
      b.style.width = '6px';
      b.style.height = '18px';
      b.style.borderRadius = '2px';
      b.style.background = 'linear-gradient(180deg,#ffffff 0%, #e6f0ff 100%)';
      b.style.boxShadow = '0 1px 0 rgba(0,0,0,0.12)';
    });
    barWrap.appendChild(b1);
    barWrap.appendChild(b2);
    pauseBtnEl.appendChild(barWrap);

    pauseBtnEl.addEventListener('pointerdown', (ev) => {
      ev.preventDefault && ev.preventDefault();
      setPaused(!paused);
    });

    // Esc key toggles pause only after start
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && !e.repeat) {
        if (started && !dead) {
          e.preventDefault && e.preventDefault();
          setPaused(!paused);
        }
      }
    });

    document.body.appendChild(pauseBtnEl);

    // Pause overlay (menu)
    const pauseOverlayEl = document.createElement('div');
    pauseOverlayEl.style.position = 'fixed';
    pauseOverlayEl.style.left = '0';
    pauseOverlayEl.style.top = '0';
    pauseOverlayEl.style.width = '100vw';
    pauseOverlayEl.style.height = '100vh';
    pauseOverlayEl.style.display = 'none';
    pauseOverlayEl.style.alignItems = 'center';
    pauseOverlayEl.style.justifyContent = 'center';
    pauseOverlayEl.style.zIndex = 10006;
    pauseOverlayEl.style.background = 'rgba(0,0,0,0.55)';
    pauseOverlayEl.style.pointerEvents = 'auto';

    const pauseCardEl = document.createElement('div');
    pauseCardEl.style.background = 'rgba(255,255,255,0.06)';
    pauseCardEl.style.padding = '22px 26px';
    pauseCardEl.style.borderRadius = '12px';
    pauseCardEl.style.textAlign = 'center';
    pauseCardEl.style.color = '#fff';
    pauseCardEl.style.font = '18px sans-serif';
    pauseCardEl.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';
    pauseCardEl.style.display = 'flex';
    pauseCardEl.style.flexDirection = 'column';
    pauseCardEl.style.alignItems = 'center';
    pauseCardEl.style.gap = '12px';

    const pauseTitle = document.createElement('div');
    pauseTitle.style.fontSize = '22px';
    pauseTitle.textContent = 'Paused';
    pauseCardEl.appendChild(pauseTitle);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '10px';

    const resumeBtnEl = document.createElement('button');
    resumeBtnEl.textContent = 'Resume';
    styleActionBtn(resumeBtnEl);
    resumeBtnEl.addEventListener('pointerdown', (e) => { e.preventDefault && e.preventDefault(); setPaused(false); });

    const restartBtnEl = document.createElement('button');
    restartBtnEl.textContent = 'Restart';
    styleActionBtn(restartBtnEl);
    restartBtnEl.addEventListener('pointerdown', (e) => {
      e.preventDefault && e.preventDefault();
      resetRun();
      setPaused(false);
      if (started && audioReady && audio) {
        try { audio.pause(); audio.currentTime = 0; audio.muted = muted; audioPlayPromise = audio.play(); if (audioPlayPromise && typeof audioPlayPromise.then === 'function') audioPlayPromise.catch(()=>{}); } catch (err) {}
      }
    });

    const exitBtnEl = document.createElement('button');
    exitBtnEl.textContent = 'Exit';
    styleActionBtn(exitBtnEl);
    exitBtnEl.style.background = '#d32f2f';
    exitBtnEl.style.border = '1px solid rgba(0,0,0,0.12)';
    exitBtnEl.addEventListener('pointerdown', (e) => {
      e.preventDefault && e.preventDefault();
      exitConfirmEl.style.display = 'flex';
      pauseOverlayEl.style.display = 'none';
    });

    btnRow.appendChild(resumeBtnEl);
    btnRow.appendChild(restartBtnEl);
    btnRow.appendChild(exitBtnEl);
    pauseCardEl.appendChild(btnRow);

    // Mute toggle
    const muteRow = document.createElement('div');
    muteRow.style.display = 'flex';
    muteRow.style.gap = '8px';
    muteRow.style.alignItems = 'center';
    const muteLabel = document.createElement('div');
    muteLabel.textContent = 'Sound:';
    muteLabel.style.opacity = '0.9';
    muteLabel.style.fontSize = '14px';
    const muteToggle = document.createElement('button');
    muteToggle.textContent = muted ? 'Muted' : 'On';
    muteToggle.style.padding = '8px 10px';
    muteToggle.style.borderRadius = '8px';
    muteToggle.style.background = muted ? '#444' : 'rgba(255,255,255,0.08)';
    muteToggle.style.color = '#fff';
    muteToggle.style.border = '1px solid rgba(255,255,255,0.08)';
    muteToggle.style.cursor = 'pointer';
    muteToggle.addEventListener('pointerdown', (e) => {
      e.preventDefault && e.preventDefault();
      muted = !muted;
      localStorage.setItem(STORAGE_KEY_MUTED, muted ? '1' : '0');
      muteToggle.textContent = muted ? 'Muted' : 'On';
      muteToggle.style.background = muted ? '#444' : 'rgba(255,255,255,0.08)';
      if (audioReady && audio) try { audio.muted = muted; } catch (err) {}
    });
    muteRow.appendChild(muteLabel);
    muteRow.appendChild(muteToggle);
    pauseCardEl.appendChild(muteRow);

    pauseOverlayEl.appendChild(pauseCardEl);
    document.body.appendChild(pauseOverlayEl);

    // Exit confirmation
    const exitConfirmEl = document.createElement('div');
    exitConfirmEl.style.position = 'fixed';
    exitConfirmEl.style.left = '0';
    exitConfirmEl.style.top = '0';
    exitConfirmEl.style.width = '100vw';
    exitConfirmEl.style.height = '100vh';
    exitConfirmEl.style.display = 'none';
    exitConfirmEl.style.alignItems = 'center';
    exitConfirmEl.style.justifyContent = 'center';
    exitConfirmEl.style.zIndex = 10007;
    exitConfirmEl.style.background = 'rgba(0,0,0,0.65)';
    exitConfirmEl.style.pointerEvents = 'auto';

    const confirmCard = document.createElement('div');
    confirmCard.style.background = 'rgba(255,255,255,0.06)';
    confirmCard.style.padding = '20px 24px';
    confirmCard.style.borderRadius = '12px';
    confirmCard.style.textAlign = 'center';
    confirmCard.style.color = '#fff';
    confirmCard.style.font = '18px sans-serif';
    confirmCard.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';
    confirmCard.style.display = 'flex';
    confirmCard.style.flexDirection = 'column';
    confirmCard.style.alignItems = 'center';
    confirmCard.style.gap = '12px';

    const confirmText = document.createElement('div');
    confirmText.style.fontSize = '20px';
    confirmText.textContent = 'Are you sure you want to exit?';
    confirmCard.appendChild(confirmText);

    const confirmRow = document.createElement('div');
    confirmRow.style.display = 'flex';
    confirmRow.style.gap = '10px';

    const confirmYes = document.createElement('button');
    confirmYes.textContent = 'Yes';
    styleActionBtn(confirmYes);
    confirmYes.style.background = '#d32f2f';
    confirmYes.style.border = 'none';
    confirmYes.addEventListener('pointerdown', (e) => {
      e.preventDefault && e.preventDefault();
      exitConfirmEl.style.display = 'none';
      exited = true;
      try { window.close(); } catch (err) {}
      try { window.open('', '_self'); window.close(); } catch (err) {}
      setTimeout(() => {
        if (!document.hidden && !document.webkitHidden) {
          canvas.style.display = 'none';
          pauseOverlayEl.style.display = 'none';
          pauseBtnEl.style.display = 'none';
          exitScreenEl.style.display = 'flex';
        }
      }, 250);
    });

    const confirmNo = document.createElement('button');
    confirmNo.textContent = 'No';
    styleActionBtn(confirmNo);
    confirmNo.addEventListener('pointerdown', (e) => {
      e.preventDefault && e.preventDefault();
      exitConfirmEl.style.display = 'none';
      pauseOverlayEl.style.display = 'flex';
    });

    confirmRow.appendChild(confirmYes);
    confirmRow.appendChild(confirmNo);
    confirmCard.appendChild(confirmRow);
    exitConfirmEl.appendChild(confirmCard);
    document.body.appendChild(exitConfirmEl);

    // Exit fallback screen
    const exitScreenEl = document.createElement('div');
    exitScreenEl.style.position = 'fixed';
    exitScreenEl.style.left = '0';
    exitScreenEl.style.top = '0';
    exitScreenEl.style.width = '100vw';
    exitScreenEl.style.height = '100vh';
    exitScreenEl.style.display = 'none';
    exitScreenEl.style.alignItems = 'center';
    exitScreenEl.style.justifyContent = 'center';
    exitScreenEl.style.zIndex = 10008;
    exitScreenEl.style.background = 'linear-gradient(180deg, rgba(0,0,0,0.85), rgba(0,0,0,0.95))';
    exitScreenEl.style.color = '#fff';
    exitScreenEl.style.font = '18px sans-serif';
    exitScreenEl.style.flexDirection = 'column';
    exitScreenEl.style.gap = '16px';

    const exitMsg = document.createElement('div');
    exitMsg.style.fontSize = '22px';
    exitMsg.textContent = 'You have exited the game.';
    const exitSub = document.createElement('div');
    exitSub.style.opacity = '0.9';
    exitSub.textContent = 'If the tab did not close automatically, you can reload or return.';

    const exitControls = document.createElement('div');
    exitControls.style.display = 'flex';
    exitControls.style.gap = '10px';

    const reloadBtn = document.createElement('button');
    reloadBtn.textContent = 'Reload';
    reloadBtn.style.padding = '10px 14px';
    reloadBtn.style.borderRadius = '8px';
    reloadBtn.style.background = '#2e7d32';
    reloadBtn.style.color = '#fff';
    reloadBtn.style.border = 'none';
    reloadBtn.style.cursor = 'pointer';
    reloadBtn.addEventListener('pointerdown', () => location.reload());

    const returnBtn = document.createElement('button');
    returnBtn.textContent = 'Return';
    returnBtn.style.padding = '10px 14px';
    returnBtn.style.borderRadius = '8px';
    returnBtn.style.background = 'rgba(255,255,255,0.08)';
    returnBtn.style.color = '#fff';
    returnBtn.style.border = '1px solid rgba(255,255,255,0.12)';
    returnBtn.style.cursor = 'pointer';
    returnBtn.addEventListener('pointerdown', () => {
      exited = false;
      canvas.style.display = 'block';
      pauseBtnEl.style.display = 'flex';
      exitScreenEl.style.display = 'none';
      setPaused(true);
    });

    exitControls.appendChild(reloadBtn);
    exitControls.appendChild(returnBtn);
    exitScreenEl.appendChild(exitMsg);
    exitScreenEl.appendChild(exitSub);
    exitScreenEl.appendChild(exitControls);
    document.body.appendChild(exitScreenEl);

    // Death overlay (shown when player dies)
    const deathOverlayEl = document.createElement('div');
    deathOverlayEl.style.position = 'fixed';
    deathOverlayEl.style.left = '0';
    deathOverlayEl.style.top = '0';
    deathOverlayEl.style.width = '100vw';
    deathOverlayEl.style.height = '100vh';
    deathOverlayEl.style.display = 'none';
    deathOverlayEl.style.alignItems = 'center';
    deathOverlayEl.style.justifyContent = 'center';
    deathOverlayEl.style.zIndex = 10009;
    deathOverlayEl.style.background = 'rgba(0,0,0,0.72)';
    deathOverlayEl.style.pointerEvents = 'auto';

    const deathCard = document.createElement('div');
    deathCard.style.background = 'rgba(255,255,255,0.04)';
    deathCard.style.padding = '26px 28px';
    deathCard.style.borderRadius = '12px';
    deathCard.style.textAlign = 'center';
    deathCard.style.color = '#fff';
    deathCard.style.font = '18px sans-serif';
    deathCard.style.boxShadow = '0 12px 36px rgba(0,0,0,0.6)';
    deathCard.style.display = 'flex';
    deathCard.style.flexDirection = 'column';
    deathCard.style.alignItems = 'center';
    deathCard.style.gap = '14px';
    deathCard.style.minWidth = '260px';

    const deathTitle = document.createElement('div');
    deathTitle.textContent = 'You Died';
    deathTitle.style.fontSize = '28px';
    deathTitle.style.fontWeight = '700';
    deathTitle.style.color = '#ff6b6b';
    deathTitle.style.textShadow = '0 2px 8px rgba(0,0,0,0.6)';
    deathCard.appendChild(deathTitle);

    const deathScore = document.createElement('div');
    deathScore.textContent = 'Score: 0';
    deathScore.style.fontSize = '16px';
    deathScore.style.opacity = '0.95';
    deathCard.appendChild(deathScore);

    const deathButtons = document.createElement('div');
    deathButtons.style.display = 'flex';
    deathButtons.style.gap = '10px';

    const playAgainBtn = document.createElement('button');
    playAgainBtn.textContent = 'Play Again';
    styleActionBtn(playAgainBtn);
    playAgainBtn.style.background = '#2e7d32';
    playAgainBtn.style.color = '#fff';
    playAgainBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault && e.preventDefault();
      hideDeathOverlayAndRestart();
    });

    const mainMenuBtn = document.createElement('button');
    mainMenuBtn.textContent = 'Main Menu';
    styleActionBtn(mainMenuBtn);
    mainMenuBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault && e.preventDefault();
      returnToMainMenu();
    });

    deathButtons.appendChild(playAgainBtn);
    deathButtons.appendChild(mainMenuBtn);
    deathCard.appendChild(deathButtons);
    deathOverlayEl.appendChild(deathCard);
    document.body.appendChild(deathOverlayEl);

    // Input: only active after started
    let lastGroundTime = -999999;
    let jumpsUsed = 0;
    function canPerformJump(now) {
      const coyoteAllowed = (now - lastGroundTime) <= 0.12 * 1000;
      return jumpsUsed < 2 || coyoteAllowed;
    }
    function doJump(now) {
      if (!started || paused || exited || dead) return;
      if (player.onGround) jumpsUsed = 0;
      if (jumpsUsed < 2) {
        player.vy = JUMP_V;
        jumpsUsed++;
        player.onGround = false;
        player._prevBottom = player.y + player.baseH;
      }
    }

    window.addEventListener('keydown', (e) => {
      if (!started) return;
      if (e.repeat) return;
      const now = performance.now();
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault && e.preventDefault();
        doJump(now);
      }
    });

    window.addEventListener('pointerdown', (e) => {
      if (!started) return;
      if (paused || exited || dead) return;
      if (e.button && e.button !== 0) return;
      doJump(performance.now());
    }, { passive: true });

    canvas.addEventListener('touchstart', (e) => {
      if (!started) return;
      if (paused || exited || dead) return;
      e.preventDefault && e.preventDefault();
      doJump(performance.now());
    }, { passive: false });

    // Resize canvas
    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const vw = Math.max(1, Math.floor(window.innerWidth));
      const vh = Math.max(1, Math.floor(window.innerHeight));
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      canvas.style.width = vw + 'px';
      canvas.style.height = vh + 'px';
      // draw initial gradient so Play overlay sits on top of stage background
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const stageColor = STAGES[currentStage].color;
        const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGrad.addColorStop(0, shadeColor(stageColor, -12));
        bgGrad.addColorStop(0.5, stageColor);
        bgGrad.addColorStop(1, shadeColor(stageColor, -30));
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } catch (err) { console.warn('[game] resizeCanvas draw failed', err); }
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Level helpers
    function spawnPlatformAt(x, prevPlat) {
      const base = player.baseW || DEFAULT_MAX_DIM;
      const width = Math.max(base, Math.round(base * (1.6 + Math.random() * 0.8)));
      const r = Math.random();
      let bandY = (r < 0.25) ? PLATFORM_MIN_Y : (r < 0.75 ? PLATFORM_MID_Y : PLATFORM_MAX_Y);
      const offset = Math.round((Math.random() - 0.5) * 16);
      let targetY = bandY + offset;
      if (prevPlat && typeof prevPlat.y === 'number') {
        if (targetY < prevPlat.y - 36) targetY = prevPlat.y - 36;
        if (targetY > prevPlat.y + 36) targetY = prevPlat.y + 36;
      }
      const y = clamp(targetY, PLATFORM_MIN_Y, PLATFORM_MAX_Y);
      return { x, y, w: width, h: Math.max(8, Math.round((player.baseH || DEFAULT_MAX_DIM) * 0.25)) };
    }
    function spawnSpikeAt(x) {
      const w = Math.max(12, Math.round((player.baseW || DEFAULT_MAX_DIM) * 0.9));
      const h = Math.max(10, Math.round((player.baseH || DEFAULT_MAX_DIM) * 0.45));
      return { x: Math.round(x), y: GROUND_Y_LOGICAL - h, w, h };
    }
    function computeNextX(prevPlat) {
      const horizSpeed = speed;
      const vy = -JUMP_V;
      const tUp = vy / GRAVITY;
      const maxDist = horizSpeed * (2 * tUp);
      const minGap = Math.max(48, Math.round(maxDist * 0.30));
      const maxGap = Math.max(minGap + 20, Math.round(maxDist * 0.65));
      const gap = Math.round(minGap + Math.random() * (maxGap - minGap));
      return prevPlat.x + prevPlat.w + gap;
    }

    // seed level
    function seedLevel() {
      platforms[0] = { x: 220, y: clamp(Math.round(LOGICAL_H * 0.66), PLATFORM_MIN_Y, PLATFORM_MAX_Y), w: Math.max(player.baseW, 140), h: Math.max(8, Math.round(player.baseH * 0.25)) };
      for (let i = 1; i < platforms.length; i++) {
        const rightmost = platforms[i - 1];
        const nextX = computeNextX(rightmost);
        platforms[i] = spawnPlatformAt(nextX, rightmost);
      }
      for (let i = 0; i < spikes.length; i++) {
        const base = platforms[Math.floor(Math.random() * platforms.length)];
        const sx = base.x + base.w + 80 + Math.random() * 160;
        spikes[i] = spawnSpikeAt(Math.round(sx));
      }
    }

    // reset run
    function resetRun() {
      for (let i = 0; i < spikes.length; i++) spikes[i].x = LOGICAL_W + 400 * i + 80;
      for (let i = 0; i < platforms.length; i++) {
        platforms[i].x = LOGICAL_W + 300 * i + 120;
        platforms[i].y = clamp(Math.round(160 + Math.random() * 80), PLATFORM_MIN_Y, PLATFORM_MAX_Y);
        platforms[i].w = Math.max(player.baseW, Math.round(player.baseW * (1.6 + Math.random() * 0.8)));
        platforms[i].h = Math.max(8, Math.round(player.baseH * 0.25));
      }
      player.x = 81;
      player.y = GROUND_Y_LOGICAL - player.baseH;
      player.vy = 0;
      player.onGround = true;
      player._prevBottom = player.y + player.baseH;
      jumpsUsed = 0;
      worldProgress = 0;
      currentStage = 0;
      speed = Math.round(BASE_SPEED * STAGES[currentStage].speedMul);
      score = 0;
    }

    // Update (only when started)
    function update(dt) {
      if (typeof player._prevBottom === 'undefined') player._prevBottom = player.y + player.baseH;

      player.vy += GRAVITY * dt;
      player.y += player.vy * dt;

      let landed = false;
      for (let p of platforms) {
        if (platformCollision(player, p)) {
          player.y = p.y - player.baseH;
          player.vy = 0;
          player.onGround = true;
          landed = true;
          jumpsUsed = 0;
          lastGroundTime = performance.now();
          break;
        }
      }

      if (!landed && player.y + player.baseH >= GROUND_Y_LOGICAL) {
        player.y = GROUND_Y_LOGICAL - player.baseH;
        player.vy = 0;
        player.onGround = true;
        jumpsUsed = 0;
        lastGroundTime = performance.now();
      } else if (!landed && player.y + player.baseH < GROUND_Y_LOGICAL) {
        if (player.onGround) lastGroundTime = performance.now();
        player.onGround = false;
      }

      const stage = STAGES[currentStage];
      for (let o of [...spikes, ...platforms]) {
        o.x -= speed * dt;
        if (o.x + (o.w || 0) < -200) {
          if (platforms.includes(o)) {
            const rightmost = platforms.reduce((a, b) => (a.x + a.w > b.x + b.w ? a : b));
            const nextX = computeNextX(rightmost);
            const newPlat = spawnPlatformAt(nextX, rightmost);
            o.x = newPlat.x; o.y = newPlat.y; o.w = newPlat.w; o.h = newPlat.h;
          } else {
            const rightmostPlat = platforms.reduce((a, b) => (a.x + a.w > b.x + b.w ? a : b));
            const sx = rightmostPlat.x + rightmostPlat.w + 80 + Math.random() * 240;
            const newSpike = spawnSpikeAt(Math.round(sx));
            o.x = newSpike.x; o.y = newSpike.y; o.w = newSpike.w; o.h = newSpike.h;
          }
        }
      }

      for (let s of spikes) {
        if (spikeCollision(player, s)) {
          // collision: handle death
          handlePlayerDeath();
          return;
        }
      }

      worldProgress += speed * dt;
      score = Math.floor(worldProgress / 10);
      if (score > highScore) {
        highScore = score;
        try { localStorage.setItem(STORAGE_KEY_HIGHSCORE, String(highScore)); } catch (err) {}
      }

      const nextStage = Math.floor(worldProgress / 2400) % STAGES.length;
      if (nextStage !== currentStage) {
        currentStage = nextStage;
        speed = Math.round(BASE_SPEED * STAGES[currentStage].speedMul);
      }

      player._prevBottom = player.y + player.baseH;
    }

    // Handle player death: show death overlay, stop audio, set dead flag
    function handlePlayerDeath() {
      if (!started) return;
      dead = true;
      paused = false; // ensure paused flag doesn't interfere
      // stop audio and reset to start (so Play Again restarts from beginning)
      if (audioReady && audio) {
        try { audio.pause(); audio.currentTime = 0; } catch (err) {}
      }
      // show death overlay with score
      deathScore.textContent = `Score: ${score}`;
      deathOverlayEl.style.display = 'flex';
      // hide pause button while dead
      pauseBtnEl.style.display = 'none';
    }

    // Hide death overlay and restart run immediately
    function hideDeathOverlayAndRestart() {
      deathOverlayEl.style.display = 'none';
      dead = false;
      // restart run and audio
      resetRun();
      if (audioReady && audio) {
        try { audio.muted = muted; audio.currentTime = 0; audioPlayPromise = audio.play(); if (audioPlayPromise && typeof audioPlayPromise.then === 'function') audioPlayPromise.catch(()=>{}); } catch (err) {}
      }
      // ensure pause button visible
      pauseBtnEl.style.display = 'flex';
      last = performance.now();
    }

    // Return to main menu (show Play overlay and pre-start cycle)
    function returnToMainMenu() {
      deathOverlayEl.style.display = 'none';
      dead = false;
      started = false;
      paused = false;
      // hide pause button
      pauseBtnEl.style.display = 'none';
      // show play overlay and restart pre-start cycle
      playOverlay.style.display = 'flex';
      startPreStartCycle();
      // reset run state
      resetRun();
      // stop audio
      if (audioReady && audio) {
        try { audio.pause(); audio.currentTime = 0; } catch (err) {}
      }
      last = performance.now();
    }

    // Collision helpers
    function platformCollision(pl, p) {
      if (typeof pl._prevBottom === 'undefined') pl._prevBottom = pl.y + pl.baseH;
      const prevBottom = pl._prevBottom;
      const curBottom = pl.y + pl.baseH;
      const footLeft = pl.x + 2;
      const footRight = pl.x + pl.baseW - 2;
      const withinX = footRight > p.x && footLeft < p.x + p.w;
      const topTolerance = 12;
      const smallOverlap = 6;
      const curAtOrBelowTop = curBottom >= p.y - smallOverlap;
      const prevAboveOrNear = prevBottom <= p.y + topTolerance;
      const movingDownish = pl.vy >= -120;
      return withinX && curAtOrBelowTop && prevAboveOrNear && movingDownish;
    }

    function spikeCollision(pl, s) {
      if (!rectsOverlap(pl, s)) return false;
      const px = pl.x + pl.baseW / 2;
      const py = pl.y + pl.baseH;
      const relX = (px - s.x) / s.w;
      if (relX < 0 || relX > 1) return false;
      const boundaryY = s.y + s.h * (1 - 2 * Math.abs(relX - 0.5));
      return py > boundaryY;
    }

    function rectsOverlap(a, b) {
      return a.x < b.x + b.w && a.x + a.baseW > b.x && a.y < b.y + b.h && a.y + a.baseH > b.y;
    }

    // Drawing
    function drawLogical() {
      if (!started) return;

      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, GROUND_Y_LOGICAL, LOGICAL_W, LOGICAL_H - GROUND_Y_LOGICAL);

      for (let p of platforms) {
        ctx.fillStyle = '#c62828';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(p.x, p.y, p.w, 4);
      }

      for (let s of spikes) {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y + s.h);
        ctx.lineTo(s.x + s.w / 2, s.y);
        ctx.lineTo(s.x + s.w, s.y + s.h);
        ctx.closePath();
        ctx.fillStyle = '#111';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s.x + 2, s.y + s.h);
        ctx.lineTo(s.x + s.w / 2, s.y + 2);
        ctx.lineTo(s.x + s.w - 2, s.y + s.h);
        ctx.closePath();
        ctx.fillStyle = '#eee';
        ctx.globalAlpha = 0.08;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (player.spriteLoaded && player.sprite) {
        ctx.drawImage(player.sprite, player.x, player.y, player.baseW, player.baseH);
      } else {
        ctx.fillStyle = 'cyan';
        ctx.fillRect(player.x, player.y, player.baseW, player.baseH);
      }
    }

    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const stageColor = STAGES[currentStage].color;
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, shadeColor(stageColor, -12));
      bgGrad.addColorStop(0.5, stageColor);
      bgGrad.addColorStop(1, shadeColor(stageColor, -30));
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // If not started, ensure play button background matches current stage (interval also updates it)
      if (!started) {
        playBtn.style.background = `linear-gradient(180deg, ${shadeColor(stageColor, -8)}, ${stageColor})`;
      }

      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.width / dpr;
      const cssH = canvas.height / dpr;
      const scaleX = cssW / LOGICAL_W;
      const scaleY = cssH / LOGICAL_H;
      const scale = Math.min(scaleX, scaleY);
      const scaledW = LOGICAL_W * scale;
      const scaledH = LOGICAL_H * scale;
      const offsetX = (cssW - scaledW) / 2;
      const offsetY = (cssH - scaledH) / 2;

      ctx.scale(dpr, dpr);
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      drawLogical();

      if (paused) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawHUD(ctx, canvas.width, canvas.height);
    }

    function drawHUD(ctx, pixelW, pixelH) {
      const dpr = window.devicePixelRatio || 1;
      const cssW = pixelW / dpr;
      const pad = 12;
      const fontSize = Math.max(12, Math.round(14 * (cssW / 900)));
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textBaseline = 'top';
      const text1 = `Score: ${score}`;
      const text2 = `High: ${highScore}`;
      const w1 = ctx.measureText(text1).width;
      const w2 = ctx.measureText(text2).width;
      const boxW = Math.max(w1, w2) + pad * 2;
      const boxH = fontSize * 2 + pad;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(pad, pad, boxW, boxH);
      ctx.fillStyle = '#fff';
      ctx.fillText(text1, pad * 1.5, pad * 1.1);
      ctx.fillText(text2, pad * 1.5, pad * 1.1 + fontSize);
      ctx.restore();

      ctx.save();
      ctx.scale(dpr, dpr);
      const muteText = muted ? 'Muted' : 'Sound';
      ctx.font = `${Math.max(12, Math.round(12 * (cssW / 900)))}px sans-serif`;
      const mtW = ctx.measureText(muteText).width;
      const mx = cssW - mtW - pad * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(mx, pad, mtW + pad, fontSize + 8);
      ctx.fillStyle = '#fff';
      ctx.fillText(muteText, mx + pad / 2, pad + 4);
      ctx.restore();
    }

    function shadeColor(hex, percent) {
      const f = hex.slice(1);
      const t = percent < 0 ? 0 : 255;
      const p = Math.abs(percent) / 100;
      const R = parseInt(f.substring(0, 2), 16);
      const G = parseInt(f.substring(2, 4), 16);
      const B = parseInt(f.substring(4, 6), 16);
      const newR = Math.round((t - R) * p) + R;
      const newG = Math.round((t - G) * p) + G;
      const newB = Math.round((t - B) * p) + B;
      return `rgb(${newR},${newG},${newB})`;
    }

    // start game and music when Play pressed
    function startGameAndMusic() {
      if (started) return;
      started = true;
      stopPreStartCycle();
      playOverlay.style.display = 'none';
      pauseBtnEl.style.display = 'flex';
      try { seedLevel(); } catch (e) { console.warn('[game] seedLevel failed on start', e); }
      resetRun();
      last = performance.now();
      if (audioReady && audio) {
        try {
          audio.muted = false;
          audio.currentTime = 0;
          audioPlayPromise = audio.play();
          if (audioPlayPromise && typeof audioPlayPromise.then === 'function') audioPlayPromise.catch(()=>{});
        } catch (err) { console.warn('[game] audio play failed', err); }
      }
    }

    // Utility helpers
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function styleActionBtn(el) {
      el.style.padding = '10px 14px';
      el.style.font = '16px sans-serif';
      el.style.borderRadius = '8px';
      el.style.background = 'rgba(255,255,255,0.08)';
      el.style.color = '#fff';
      el.style.border = '1px solid rgba(255,255,255,0.12)';
      el.style.cursor = 'pointer';
    }

    // initial seed so background has content
    try { seedLevel(); } catch (err) { console.warn('[game] seedLevel threw', err); }
    resetRun();

    // start pre-start cycle immediately so the Play area changes every 2s
    startPreStartCycle();

    // wire play button interactions
    playBtn.addEventListener('pointerdown', (e) => { e.preventDefault && e.preventDefault(); playBtn.style.transform = 'translateY(2px)'; });
    playBtn.addEventListener('pointerup', (e) => { e.preventDefault && e.preventDefault(); playBtn.style.transform = 'translateY(0)'; startGameAndMusic(); });
    playBtn.addEventListener('pointerleave', () => { playBtn.style.transform = 'translateY(0)'; });

    // main loop
    let last = performance.now();
    requestAnimationFrame(function loop(ts) {
      if (!last || typeof last !== 'number') last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;

      if (!started) {
        // subtle progression while waiting (keeps stageColor consistent if you want to use worldProgress)
        worldProgress += 40 * dt;
      } else {
        if (!paused && !exited && !dead) update(dt);
      }

      draw();
      requestAnimationFrame(loop);
    });

    // Expose small debug API
    window.__gd_debug = {
      start: startGameAndMusic,
      reset: resetRun,
      setMuted: (v) => { muted = !!v; if (audioReady && audio) audio.muted = muted; localStorage.setItem(STORAGE_KEY_MUTED, muted ? '1' : '0'); },
      logState: () => console.log({ started, paused, dead, currentStage, score, highScore })
    };
  } // end init
})(); // end IIFE