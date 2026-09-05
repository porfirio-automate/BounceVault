/* global Phaser */

class BVGrayboxScene extends Phaser.Scene {
  constructor() {
    super('BVGrayboxScene');
    this.bestHeight = 0;
    this.touchPointers = new Map();
  }

  init(data) {
    // Restarting with { skipStart: true } (Restart buttons, the R key) drops
    // straight back into gameplay; a plain restart (Exit buttons, first load)
    // shows the start screen instead.
    this.autoStart = !!(data && data.skipStart);
  }

  resetRunState() {
    const C = window.BV_CONFIG;
    this.gameState = 'START';
    this.attempts = 0;
    this.consecutiveMisses = 0;
    this.armedGrade = 'NORMAL';
    this.lastGrade = 'NORMAL';
    this.lastBounceAt = -Infinity;
    this.inputHeld = false;
    this.currentHeight = 0;
    this.touchPointers.clear();
    this.lives = C.startingLives;
    this.coins = 0;
    this.invulnerableUntil = -Infinity;
    // Just below whatever the current screen shows, regardless of device size.
    this.floorY = this.H + 40;
    this.phaseNextLanding = false;
    this.runStartedAt = Infinity; // set for real in beginRun(); Infinity keeps the floor parked until then
  }

  preload() {
    const base = './assets/sprites/';
    this.load.image('vault_background', base + 'vault_background.png');
    this.load.image('platform_plain', base + 'platform_plain.png');
    this.load.image('platform_striped', base + 'platform_striped.png');
    this.load.image('platform_arrow', base + 'platform_arrow.png');
    for (let i = 0; i <= 4; i++) this.load.image(`platform_fade_${i}`, `${base}platform_fade_${i}.png`);
    this.load.image('hazard_spike_base', base + 'hazard_spike_base.png');
    for (let i = 0; i <= 3; i++) this.load.image(`hazard_spike_top_${i}`, `${base}hazard_spike_top_${i}.png`);
    for (let i = 0; i <= 3; i++) this.load.image(`obstacle_electric_${i}`, `${base}obstacle_electric_${i}.png`);
    this.load.image('vault_floor', base + 'vault_floor.png');
    this.load.image('player_idle', base + 'player_pose_r0_c0.png');
    this.load.image('player_boost', base + 'player_pose_r2_c2.png');
    this.load.image('coin', base + 'coin.png');
    for (let i = 0; i <= 3; i++) this.load.image(`crawler_idle_${i}`, `${base}crawler_idle_${i}.png`);
    for (let i = 0; i <= 5; i++) this.load.image(`crawler_walk_${i}`, `${base}crawler_walk_${i}.png`);
    for (let i = 0; i <= 3; i++) this.load.image(`crawler_death_${i}`, `${base}crawler_death_${i}.png`);
    for (let i = 0; i <= 3; i++) this.load.image(`slime_idle_${i}`, `${base}slime_idle_${i}.png`);
    for (let i = 0; i <= 5; i++) this.load.image(`slime_jump_${i}`, `${base}slime_jump_${i}.png`);
    for (let i = 0; i <= 3; i++) this.load.image(`slime_death_${i}`, `${base}slime_death_${i}.png`);
    for (let i = 0; i <= 3; i++) this.load.image(`turret_idle_${i}`, `${base}turret_idle_${i}.png`);
    for (let i = 0; i <= 3; i++) this.load.image(`turret_aim_${i}`, `${base}turret_aim_${i}.png`);
    for (let i = 0; i <= 3; i++) this.load.image(`turret_shoot_${i}`, `${base}turret_shoot_${i}.png`);
    for (let i = 0; i <= 3; i++) this.load.image(`turret_death_${i}`, `${base}turret_death_${i}.png`);
  }

  create() {
    const C = window.BV_CONFIG;
    // Actual device viewport, not a fixed design resolution — the play field
    // fills whatever screen it's running on (see BV_GameConfig_Shared.js's
    // Scale.RESIZE mode).
    this.W = this.scale.width;
    this.H = this.scale.height;
    this.resetRunState();
    const worldHeight = Math.abs(C.worldTop) + this.H + 200;
    this.physics.world.setBounds(0, C.worldTop, this.W, worldHeight);
    this.cameras.main.setBounds(0, C.worldTop, this.W, worldHeight);

    this.bgTileSprite = this.add.tileSprite(this.W / 2, 0, this.W, this.H + 400, 'vault_background')
      .setDepth(0);

    this.platforms = this.physics.add.staticGroup();
    this.pickups = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group();
    this.projectiles = this.physics.add.group();
    this.hazardCount = 0;
    this.nextPlatformX = this.W / 2;
    this.nextPlatformY = this.floorY - 100;
    this.addPlatform(this.nextPlatformX, this.nextPlatformY, 420, 'solid');
    this.generateBatch(C.platformGenerateAheadCount);

    this.player = this.add.sprite(this.W / 2, this.floorY - 180, 'player_idle').setDisplaySize(44, 58).setDepth(6);
    this.spawnY = this.player.y;
    this.physics.add.existing(this.player);
    this.player.body.setSize(30, 50).setCollideWorldBounds(true);
    this.player.body.setMaxVelocity(C.horizontalAirSpeedCap, 2400);
    this.physics.add.collider(this.player, this.platforms, this.onLanding, (player, platform) => this.canLandOn(player, platform), this);
    this.physics.add.overlap(this.player, this.pickups, this.onPickupCollected, undefined, this);
    this.physics.add.collider(this.player, this.enemies, this.onEnemyCollide, undefined, this);
    this.physics.add.overlap(this.player, this.projectiles, this.onProjectileHit, undefined, this);
    this.physics.add.collider(this.enemies, this.platforms);
    this.applyGlow(this.player, C.colors.player, C.glow.player);

    this.floor = this.add.image(this.W / 2, this.floorY, 'vault_floor')
      .setDisplaySize(this.W, C.platformSpriteHeight).setDepth(4);
    this.applyGlow(this.floor, C.colors.floor, C.glow.floor);

    this.targetRing = this.add.circle(this.player.x, this.player.y + 30, 18 * 0.75, 0xffffff, 0)
      .setStrokeStyle(2, C.colors.perfect, 0.9).setDepth(4);
    this.applyGlow(this.targetRing, C.colors.perfect, C.glow.ring * 0.6);

    this.pulse = this.add.circle(this.player.x, this.player.y + 30, 18, C.colors.normal, 0.14)
      .setStrokeStyle(3, C.colors.normal).setDepth(5);
    this.pulseGlow = this.applyGlow(this.pulse, C.colors.normal, C.glow.ring);
    this.feedback = this.add.text(this.W / 2, 110, '', {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
    // Untextured tap zones: steering still splits left/right of the screen,
    // just without the label text cluttering the view during play.
    this.leftZone = this.add.rectangle(this.W * 0.25, this.H - 90, this.W * 0.5, 180, 0x52d6b3, 0.08)
      .setScrollFactor(0).setDepth(10);
    this.rightZone = this.add.rectangle(this.W * 0.75, this.H - 90, this.W * 0.5, 180, 0x52d6b3, 0.08)
      .setScrollFactor(0).setDepth(10);
    this.hudText = this.add.text(this.W - 16, 18, '', {
      fontFamily: 'monospace', fontSize: '17px', color: '#ffffff', align: 'right',
      backgroundColor: '#00000088', padding: { x: 10, y: 8 }
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(20);

    // Always visible during play — the one clear, constant way to end the
    // run (Pause -> Restart/Exit) no matter what's happening on screen.
    this.pauseButton = this.makeButton(40, 34, 52, 40, '❚❚', () => this.pauseGame(), 16)
      .setScrollFactor(0).setDepth(25);

    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      action: Phaser.Input.Keyboard.KeyCodes.SPACE,
      restart: Phaser.Input.Keyboard.KeyCodes.R,
      mute: Phaser.Input.Keyboard.KeyCodes.M,
      pause: Phaser.Input.Keyboard.KeyCodes.P
    });
    this.input.on('pointerdown', pointer => {
      window.BV_AUDIO?.unlock();
      if (this.gameState === 'PLAYING') this.setTouchPointer(pointer);
    });
    this.input.on('pointermove', pointer => { if (this.gameState === 'PLAYING' && pointer.isDown) this.setTouchPointer(pointer); });
    // Always release on lift, even if a pause/menu interrupted mid-touch —
    // otherwise a stale entry can keep steering the player after resuming.
    this.input.on('pointerup', pointer => this.releaseTouchPointer(pointer));
    this.input.on('pointerupoutside', pointer => this.releaseTouchPointer(pointer));
    this.input.keyboard.on('keydown', () => window.BV_AUDIO?.unlock());

    this.events.on(Phaser.Scenes.Events.RESUME, () => this.physics.resume());
    this.time.addEvent({ delay: C.timingCycleMs, loop: true, callback: () => window.BV_AUDIO?.playTick() });

    // off() first: scene.restart() re-runs create() on the same scene
    // instance without re-creating the ScaleManager, so without this a
    // listener would pile up on every restart.
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);

    this.createStartScreen();
    this.createPauseScreen();
    this.createGameOverScreen();
    this.createExitScreen();
    if (this.autoStart) {
      this.beginRun();
    } else {
      this.gameState = 'START';
      this.physics.pause();
    }
  }

  // Fires on an actual viewport change (browser resize, device rotation) —
  // not every frame — so relaying things out from scratch here is cheap and
  // guarantees everything still fits the new screen size correctly.
  handleResize(gameSize) {
    if (!this.floor) return; // a resize can fire before create() finishes on first boot
    const C = window.BV_CONFIG;
    this.W = gameSize.width;
    this.H = gameSize.height;
    const worldHeight = Math.abs(C.worldTop) + this.H + 200;
    this.physics.world.setBounds(0, C.worldTop, this.W, worldHeight);
    this.cameras.main.setBounds(0, C.worldTop, this.W, worldHeight);

    this.bgTileSprite.setPosition(this.W / 2, this.bgTileSprite.y).setSize(this.W, this.H + 400);
    this.floor.setPosition(this.W / 2, this.floor.y).setDisplaySize(this.W, C.platformSpriteHeight);
    this.hudText.setPosition(this.W - 16, 18);
    this.leftZone.setPosition(this.W * 0.25, this.H - 90).setSize(this.W * 0.5, 180);
    this.rightZone.setPosition(this.W * 0.75, this.H - 90).setSize(this.W * 0.5, 180);

    // Only rebuild an overlay if it's NOT currently on screen. Rebuilding
    // one the player might be mid-click on (destroy + recreate swaps in
    // brand-new button objects) can drop that click or, worse, have it land
    // once the new objects exist but before layout settles — exactly the
    // "restart doesn't respond" / "exit fires the wrong thing" kind of bug.
    // A hidden overlay is safe to refresh so it's correctly laid out the
    // next time it's shown.
    if (!this.startOverlay.visible) {
      this.startOverlay.destroy();
      this.createStartScreen();
      this.startOverlay.setVisible(false);
    }
    if (!this.pauseOverlay.visible) {
      this.pauseOverlay.destroy();
      this.createPauseScreen();
    }
    if (!this.gameOverOverlay.visible) {
      const reason = this.gameOverReasonText.text;
      const stats = this.gameOverStatsText.text;
      this.gameOverOverlay.destroy();
      this.createGameOverScreen();
      this.gameOverReasonText.setText(reason);
      this.gameOverStatsText.setText(stats);
    }
    if (!this.exitOverlay.visible) {
      this.exitOverlay.destroy();
      this.createExitScreen();
    }
  }

  makeButton(x, y, w, h, label, onClick, fontSize = 18) {
    const container = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, w, h, 0x14202e, 0.92).setStrokeStyle(2, 0x52d6b3, 0.9);
    const text = this.add.text(0, 0, label, {
      fontSize: `${fontSize}px`, color: '#eaf6f3', fontStyle: 'bold'
    }).setOrigin(0.5);
    // Phaser's hit-testing for an interactive child uses the CHILD's own
    // scroll factor, not its container's — a container's scrollFactor(0)
    // keeps everything correctly pinned on screen for rendering, but the
    // bg's hit area still defaults to scrollFactor 1 and silently drifts
    // out of alignment with what's drawn as soon as the camera scrolls
    // (i.e. almost immediately during real play). Set it explicitly here so
    // every button made through this helper is immune, regardless of where
    // it's used or how far the camera has moved by the time it's clicked.
    bg.setScrollFactor(0);
    text.setScrollFactor(0);
    container.add([bg, text]);
    container.setSize(w, h);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x1d3648, 0.95));
    bg.on('pointerout', () => bg.setFillStyle(0x14202e, 0.92));
    bg.on('pointerdown', () => onClick());
    return container;
  }

  createStartScreen() {
    const C = window.BV_CONFIG;
    const W = this.W, H = this.H;
    const wrap = { width: W * 0.86, useAdvancedWrap: true };
    const btnW = Math.min(220, W * 0.72);
    const container = this.add.container(0, 0).setScrollFactor(0).setDepth(40);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05080d, 0.88);
    // Softer title: a dark outline for contrast instead of a heavy glow —
    // the old strong glow bloomed the letters into an unreadable smear.
    const title = this.add.text(W / 2, H * 0.2, 'BOUNCE VAULT', {
      fontSize: '36px', color: '#ffd447', fontStyle: 'bold',
      stroke: '#1a1006', strokeThickness: 5, align: 'center', wordWrap: wrap
    }).setOrigin(0.5);
    this.applyGlow(title, C.colors.perfect, 2);

    // A small hero visual echoing the actual gameplay loop: the player
    // hovering over a pulsing timing ring.
    const heroRing = this.add.circle(W / 2, H * 0.4, 34, 0xffffff, 0)
      .setStrokeStyle(3, C.colors.perfect, 0.9);
    this.applyGlow(heroRing, C.colors.perfect, 5);
    const heroPlayer = this.add.image(W / 2, H * 0.4 - 28, 'player_idle').setDisplaySize(52, 68);
    this.tweens.add({ targets: heroPlayer, y: '-=16', duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: heroRing, scaleX: 1.25, scaleY: 1.25, alpha: 0.35, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const instructions = this.add.text(W / 2, H * 0.6,
      'HOLD LEFT OR RIGHT TO STEER\nHOLDING ALSO ARMS YOUR BOUNCE\n' +
      'STOMP ENEMIES FROM ABOVE\nDON\'T LET THE RISING FLOOR CATCH YOU\n\n' +
      'PERFECT BOUNCE: WHILE HOLDING, LAND THE INSTANT\nTHE PULSING RING MATCHES THE GOLD RING\n\n' +
      'DESKTOP: ARROWS/A-D TO STEER, HOLD SPACE TO ARM', {
        fontSize: '16px', color: '#f2faf8', fontStyle: 'bold', align: 'center', lineSpacing: 10, wordWrap: wrap
      }).setOrigin(0.5);
    // A dark panel behind the instructions so they stay readable over the
    // busy background art instead of floating unsupported on top of it.
    const instructionsBg = this.add.rectangle(
      W / 2, instructions.y,
      instructions.width + 36, instructions.height + 28,
      0x0a141f, 0.8
    ).setStrokeStyle(1, 0x2f5a5f, 0.7);

    const startBtn = this.makeButton(W / 2, H * 0.85, btnW, 58, 'TAP TO START', () => this.beginRun(), 20);

    container.add([dim, title, heroRing, heroPlayer, instructionsBg, instructions, startBtn]);
    this.startOverlay = container;
  }

  createPauseScreen() {
    const W = this.W, H = this.H;
    const btnW = Math.min(220, W * 0.72);
    const container = this.add.container(0, 0).setScrollFactor(0).setDepth(40).setVisible(false);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05080d, 0.88);
    const title = this.add.text(W / 2, H * 0.34, 'PAUSED', {
      fontSize: '34px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    const resumeBtn = this.makeButton(W / 2, H * 0.48, btnW, 56, 'RESUME', () => this.resumeGame(), 19);
    const restartBtn = this.makeButton(W / 2, H * 0.58, btnW, 56, 'RESTART', () => this.scene.restart({ skipStart: true }), 19);
    const exitBtn = this.makeButton(W / 2, H * 0.68, btnW, 56, 'EXIT', () => this.exitGame(), 19);
    container.add([dim, title, resumeBtn, restartBtn, exitBtn]);
    this.pauseOverlay = container;
  }

  createGameOverScreen() {
    const W = this.W, H = this.H;
    const wrap = { width: W * 0.86, useAdvancedWrap: true };
    const btnW = Math.min(220, W * 0.72);
    const container = this.add.container(0, 0).setScrollFactor(0).setDepth(40).setVisible(false);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05080d, 0.9);
    const title = this.add.text(W / 2, H * 0.26, 'GAME OVER', {
      fontSize: '36px', color: '#ff6577', fontStyle: 'bold'
    }).setOrigin(0.5);
    const reason = this.add.text(W / 2, H * 0.34, '', {
      fontSize: '15px', color: '#b9c9d8', align: 'center', wordWrap: wrap
    }).setOrigin(0.5);
    const stats = this.add.text(W / 2, H * 0.44, '', {
      fontSize: '18px', color: '#ffd447', fontStyle: 'bold', align: 'center', lineSpacing: 6, wordWrap: wrap
    }).setOrigin(0.5);
    const restartBtn = this.makeButton(W / 2, H * 0.6, btnW, 56, 'RESTART', () => this.scene.restart({ skipStart: true }), 19);
    const exitBtn = this.makeButton(W / 2, H * 0.7, btnW, 56, 'EXIT', () => this.exitGame(), 19);
    container.add([dim, title, reason, stats, restartBtn, exitBtn]);
    this.gameOverOverlay = container;
    this.gameOverReasonText = reason;
    this.gameOverStatsText = stats;
  }

  createExitScreen() {
    const W = this.W, H = this.H;
    const wrap = { width: W * 0.86, useAdvancedWrap: true };
    const btnW = Math.min(220, W * 0.72);
    const container = this.add.container(0, 0).setScrollFactor(0).setDepth(50).setVisible(false);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05080d, 0.96);
    const title = this.add.text(W / 2, H * 0.42, 'THANKS FOR PLAYING', {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold', align: 'center', wordWrap: wrap
    }).setOrigin(0.5);
    const sub = this.add.text(W / 2, H * 0.5, 'You can close this browser tab now.', {
      fontSize: '15px', color: '#b9c9d8', align: 'center', wordWrap: wrap
    }).setOrigin(0.5);
    const backBtn = this.makeButton(W / 2, H * 0.6, btnW, 52, 'BACK TO TITLE', () => this.returnToMenu(), 17);
    container.add([dim, title, sub, backBtn]);
    this.exitOverlay = container;
  }

  beginRun() {
    window.BV_AUDIO?.unlock();
    this.startOverlay.setVisible(false);
    this.gameState = 'PLAYING';
    this.physics.resume();
    // Grace period before the floor starts rising — covers both a fresh
    // start and a Restart (which also calls this), so the floor never
    // begins climbing the instant a run begins.
    this.runStartedAt = this.time.now;
  }

  exitGame() {
    this.gameState = 'EXITED';
    this.physics.pause();
    this.time.paused = true;
    this.tweens.pauseAll();
    this.pauseOverlay.setVisible(false);
    this.gameOverOverlay.setVisible(false);
    this.startOverlay.setVisible(false);
    this.exitOverlay.setVisible(true);
    // Only actually closes the tab if it was opened by a script; browsers
    // block this for a normally-navigated tab, hence the overlay above —
    // it tells the player they're done rather than silently doing nothing.
    try { window.close(); } catch (e) { /* blocked by the browser, ignore */ }
  }

  returnToMenu() {
    this.scene.restart();
  }

  pauseGame() {
    if (this.gameState !== 'PLAYING') return;
    this.gameState = 'PAUSED';
    this.physics.pause();
    this.time.paused = true;
    this.tweens.pauseAll();
    this.pauseOverlay.setVisible(true);
    // Clear any touch still held from the tap that opened this menu (e.g.
    // pressing the pause button itself) so it can't keep steering on resume.
    this.touchPointers.clear();
    this.player.body.setAccelerationX(0);
  }

  resumeGame() {
    if (this.gameState !== 'PAUSED') return;
    this.gameState = 'PLAYING';
    this.pauseOverlay.setVisible(false);
    this.time.paused = false;
    this.tweens.resumeAll();
    this.physics.resume();
  }

  togglePause() {
    if (this.gameState === 'PLAYING') this.pauseGame();
    else if (this.gameState === 'PAUSED') this.resumeGame();
  }

  generateBatch(count) {
    const C = window.BV_CONFIG;
    let x = this.nextPlatformX;
    let y = this.nextPlatformY;

    for (let i = 0; i < count; i++) {
      y -= Phaser.Math.Between(C.platformMinVerticalGap, C.platformMaxVerticalGap);
      const width = Phaser.Math.Between(C.platformMinWidth, C.platformMaxWidth);

      // Mostly reverse direction from the last step (with real magnitude) so the
      // path genuinely zig-zags across the width instead of drifting or
      // re-centering on itself.
      const dir = Math.random() < 0.78 ? -(this.lastStepDir || 1) : (this.lastStepDir || 1);
      const magnitude = Phaser.Math.Between(Math.round(C.platformMaxHorizontalStep * 0.55), C.platformMaxHorizontalStep);
      const step = dir * magnitude;
      this.lastStepDir = dir;
      x = Phaser.Math.Clamp(x + step, width / 2 + 20, this.W - width / 2 - 20);

      const type = this.rollPlatformType();
      const platform = this.spawnPlatformWithExtras(x, y, width, type);

      // A second platform on the same row gives the player a real landing
      // choice instead of one single reachable dot per row. Compute the
      // available space on each side directly so it's never rejected for
      // overlapping — placed only where it's guaranteed to fit.
      if (Math.random() < 0.6) {
        const width2 = Phaser.Math.Between(C.platformMinWidth, Math.round(C.platformMaxWidth * 0.65));
        const minGap = (width + width2) / 2 + 25;
        const spaceLeft = (x - minGap) - (width2 / 2 + 20);
        const spaceRight = (this.W - width2 / 2 - 20) - (x + minGap);
        if (spaceLeft > 0 || spaceRight > 0) {
          const useRight = spaceRight >= spaceLeft;
          const avail = Math.min(useRight ? spaceRight : spaceLeft, 160);
          const extra = Phaser.Math.Between(0, Math.max(0, avail));
          const x2 = useRight ? x + minGap + extra : x - minGap - extra;
          this.spawnPlatformWithExtras(x2, y + Phaser.Math.Between(-15, 15), width2, this.rollPlatformType());
        }
      }
    }

    this.nextPlatformX = x;
    this.nextPlatformY = y;
  }

  rollPlatformType() {
    const roll = Math.random();
    if (roll < 0.1) return 'hazard';
    if (roll < 0.3) return 'disappearing';
    return 'solid';
  }

  spawnPlatformWithExtras(x, y, width, type) {
    const C = window.BV_CONFIG;
    const platform = this.addPlatform(x, y, width, type, type === 'hazard' ? this.hazardCount++ : undefined);
    if (type === 'solid') {
      if (Math.random() < C.enemySpawnChance) {
        this.addEnemy(platform, Phaser.Utils.Array.GetRandom(['crawler', 'turret', 'slime']));
      } else if (Math.random() < C.pickupSpawnChance) {
        this.addPickup(x, y - C.platformSpriteHeight);
      }
    }
    return platform;
  }

  addPlatform(x, y, width, type, hazardIndex) {
    const C = window.BV_CONFIG;
    let texture = Phaser.Utils.Array.GetRandom(['platform_plain', 'platform_striped', 'platform_arrow']);
    let frames = null;
    let hazardKind = null;

    if (type === 'disappearing') {
      texture = 'platform_fade_0';
    } else if (type === 'hazard') {
      hazardKind = hazardIndex % 2 === 0 ? 'spike' : 'electric';
      if (hazardKind === 'spike') {
        texture = 'hazard_spike_base';
        frames = ['hazard_spike_top_0', 'hazard_spike_top_1', 'hazard_spike_top_2', 'hazard_spike_top_3'];
      } else {
        frames = ['obstacle_electric_0', 'obstacle_electric_1', 'obstacle_electric_2', 'obstacle_electric_3'];
        texture = frames[0];
      }
    }

    const platform = this.add.image(x, y, texture).setDisplaySize(width, C.platformSpriteHeight);
    platform.setData('type', type);
    if (frames) {
      platform.setData('hazardKind', hazardKind);
      platform.setData('frames', frames);
      platform.setData('offset', hazardIndex * C.hazardStaggerMs);
      platform.setData('danger', false);
      if (hazardKind === 'spike') {
        const overlay = this.add.image(x, y - C.platformSpriteHeight / 2, 'hazard_spike_top_0')
          .setOrigin(0.5, 1).setDisplaySize(width, 1).setDepth(platform.depth + 1);
        platform.setData('spikeOverlay', overlay);
        platform.setData('spikeScaleY', C.platformSpriteHeight / 126);
        platform.once('destroy', () => overlay.destroy());
        this.applyGlow(overlay, C.colors.danger, C.glow.obstacle);
      } else {
        this.applyGlow(platform, C.colors.danger, C.glow.obstacle);
      }
    }
    this.physics.add.existing(platform, true);
    this.platforms.add(platform);
    return platform;
  }

  addPickup(x, y) {
    const C = window.BV_CONFIG;
    const pickup = this.add.image(x, y, 'coin').setDisplaySize(28, 28);
    this.physics.add.existing(pickup, true);
    this.pickups.add(pickup);
    this.applyGlow(pickup, C.colors.pickup, C.glow.pickup);
  }

  addEnemy(platform, kind) {
    const C = window.BV_CONFIG;
    const x = platform.x;
    const y = platform.y - C.platformSpriteHeight / 2 - 26;
    const enemy = this.add.sprite(x, y, `${kind}_idle_0`).setDisplaySize(52, 52).setDepth(6);
    this.physics.add.existing(enemy);
    // Add to the physics group BEFORE customizing the body: Group.add()
    // resets body config (allowGravity, immovable, ...) to its own defaults,
    // which would silently clobber any per-kind settings applied earlier
    // (the same class of bug fixed for turret projectile velocity before).
    this.enemies.add(enemy);
    enemy.body.setCollideWorldBounds(false);
    enemy.setData('kind', kind);
    enemy.setData('minX', platform.x - platform.displayWidth / 2 + 26);
    enemy.setData('maxX', platform.x + platform.displayWidth / 2 - 26);
    enemy.setData('direction', 1);
    enemy.setData('dying', false);

    if (kind === 'crawler') {
      enemy.body.setAllowGravity(true);
    } else if (kind === 'turret') {
      enemy.body.setAllowGravity(false);
      // Stationary structure: the player bumping into it from the side
      // should never shove it around — only a stomp (handled separately in
      // onEnemyCollide) destroys it.
      enemy.body.setImmovable(true);
      enemy.setData('shootTimer', this.time.addEvent({
        delay: C.turretShootIntervalMs, loop: true,
        callback: () => this.turretShoot(enemy)
      }));
    } else if (kind === 'slime') {
      enemy.body.setAllowGravity(true);
      enemy.setData('nextHopAt', this.time.now + Phaser.Math.Between(500, C.slimeHopIntervalMs));
    }

    return enemy;
  }

  turretShoot(turret) {
    if (!turret.active) return;
    const C = window.BV_CONFIG;
    const dir = this.player.x < turret.x ? -1 : 1;
    turret.setFlipX(dir < 0);
    turret.setTexture('turret_aim_2');
    turret.setDisplaySize(52, 52);
    this.time.delayedCall(200, () => {
      if (!turret.active) return;
      turret.setTexture('turret_shoot_2');
      turret.setDisplaySize(52, 52);
      const projectile = this.add.image(turret.x, turret.y, 'obstacle_electric_3').setDisplaySize(16, 16);
      this.physics.add.existing(projectile);
      this.projectiles.add(projectile);
      projectile.body.setAllowGravity(false);
      projectile.body.setVelocityX(dir * C.turretProjectileSpeed);
      this.applyGlow(projectile, C.colors.danger, 3);
      window.BV_AUDIO?.playTurretFireSound();
      this.time.delayedCall(200, () => {
        if (!turret.active) return;
        turret.setTexture('turret_idle_0');
        turret.setDisplaySize(52, 52);
      });
    });
  }

  onProjectileHit(player, projectile) {
    projectile.destroy();
    window.BV_AUDIO?.playProjectileImpact();
    this.applyHit();
  }

  onEnemyCollide(player, enemy) {
    if (enemy.getData('dying')) return;
    const C = window.BV_CONFIG;
    // Arcade zeroes the player's velocity as part of separation BEFORE this
    // callback fires, so a clean top-landing always reads velocity.y === 0
    // here — checking velocity direction can never detect a stomp (this is
    // what made the turret, now a fully immovable body that separates
    // cleanly in one step, undestroyable). touching.down is Arcade's own
    // record of which side the collision resolved against, so it reflects
    // "landed on top" regardless of what happened to velocity.
    const stomped = this.player.body.touching.down
      && this.player.body.bottom <= enemy.body.top + 10;

    if (stomped) {
      enemy.setData('dying', true);
      enemy.body.enable = false;
      const shootTimer = enemy.getData('shootTimer');
      if (shootTimer) shootTimer.remove();
      this.player.body.setVelocityY(-C.goodBounceVelocity);
      this.coins += C.enemyKillBonusCoins;
      this.refreshHud();
      window.BV_AUDIO?.playHitSfx();
      const kind = enemy.getData('kind');
      let frame = 0;
      const step = () => {
        if (frame > 3) { enemy.destroy(); return; }
        enemy.setTexture(`${kind}_death_${frame}`);
        enemy.setDisplaySize(52, 52);
        frame += 1;
        this.time.delayedCall(C.enemyDeathFrameMs, step);
      };
      step();
    } else {
      this.applyHit();
    }
  }

  updateEnemies(time, delta) {
    const C = window.BV_CONFIG;
    this.enemies.getChildren().slice().forEach(enemy => {
      if (enemy.getData('dying')) return;
      const kind = enemy.getData('kind');
      if (kind === 'crawler') {
        const minX = enemy.getData('minX');
        const maxX = enemy.getData('maxX');
        let dir = enemy.getData('direction');
        if (enemy.x <= minX) dir = 1;
        else if (enemy.x >= maxX) dir = -1;
        enemy.setData('direction', dir);
        enemy.body.setVelocityX(dir * C.enemyCrawlerSpeed);
        // Hard-clamp position too: a velocity-only turn-around can still be
        // outpaced by a large frame delta and walk past the platform edge.
        if (enemy.x < minX) enemy.x = minX;
        else if (enemy.x > maxX) enemy.x = maxX;
        enemy.setFlipX(dir < 0);
        const frame = Math.floor(time / 120) % 6;
        enemy.setTexture(`crawler_walk_${frame}`);
        enemy.setDisplaySize(52, 52);
      } else if (kind === 'slime') {
        const minX = enemy.getData('minX');
        const maxX = enemy.getData('maxX');
        if (time >= enemy.getData('nextHopAt') && enemy.body.blocked.down) {
          const towardPlayer = this.player.x < enemy.x ? -1 : 1;
          const hopX = Phaser.Math.Clamp(enemy.x + towardPlayer * 60, minX, maxX);
          const dir = Math.sign(hopX - enemy.x) || 1;
          enemy.body.setVelocity(dir * C.slimeHopVelocity * 0.3, -C.slimeHopVelocity);
          enemy.setData('nextHopAt', time + C.slimeHopIntervalMs);
        }
        // Hard-clamp position too (same reasoning as the crawler above): the
        // hop's actual flight distance is driven by gravity + velocity, not
        // the 60px aim bias used only to pick a direction, so an unclamped
        // hop can easily carry the slime past its own platform's edge and
        // into open air with nothing left to land on.
        if (enemy.x < minX) enemy.x = minX;
        else if (enemy.x > maxX) enemy.x = maxX;
        const frame = Math.min(5, Math.floor((1 - Math.min(1, Math.max(0, -enemy.body.velocity.y / C.slimeHopVelocity))) * 6));
        enemy.setTexture(enemy.body.velocity.y < -50 || enemy.body.velocity.y > 50 ? `slime_jump_${frame}` : 'slime_idle_2');
        enemy.setDisplaySize(52, 52);
      }
    });

    this.projectiles.getChildren().slice().forEach(p => {
      if (p.x < -50 || p.x > this.W + 50) p.destroy();
    });
  }

  applyGlow(gameObject, color, strength) {
    if (this.sys.game.renderer.type !== Phaser.WEBGL) return null;
    return gameObject.postFX.addGlow(color, strength);
  }

  setTouchPointer(pointer) {
    const side = pointer.x < this.W / 2 ? -1 : 1;
    this.touchPointers.set(pointer.id, side);
  }

  releaseTouchPointer(pointer) {
    this.touchPointers.delete(pointer.id);
  }

  getTouchDirection() {
    let direction = 0;
    for (const side of this.touchPointers.values()) direction += side;
    return Phaser.Math.Clamp(direction, -1, 1);
  }

  timingDistance(now) {
    const C = window.BV_CONFIG;
    const phase = now % C.timingCycleMs;
    return Math.min(phase, C.timingCycleMs - phase);
  }

  gradeTiming(now) {
    const C = window.BV_CONFIG;
    const distance = this.timingDistance(now);
    const catchUp = this.consecutiveMisses >= C.catchUpMisses;
    const learning = this.attempts < C.learningAttempts;
    const perfectWindow = catchUp || learning ? C.learningWindowMs : C.perfectWindowMs;
    if (distance <= perfectWindow / 2) return 'PERFECT';
    if (distance <= perfectWindow / 2 + C.goodWindowMs) return 'GOOD';
    return 'NORMAL';
  }

  canLandOn(player, platform) {
    // A Perfect bounce has a small chance to arm a one-time "vault skip":
    // the very next platform the player would otherwise land on top of gets
    // phased through instead. Returning false here tells Arcade Physics to
    // skip collision separation entirely, so the player just falls through.
    if (this.phaseNextLanding && player.body.velocity.y > 0
      && player.body.bottom <= platform.body.top + 12) {
      this.phaseNextLanding = false;
      return false;
    }
    return true;
  }

  onLanding(player, platform) {
    const now = this.time.now;
    const C = window.BV_CONFIG;
    const landedOnTop = !platform || this.player.body.bottom <= platform.body.top + 8;
    if (!landedOnTop || now - this.lastBounceAt < C.bounceLockoutMs) return;

    if (platform && platform.getData('type') === 'hazard' && platform.getData('danger') === true) {
      this.lastBounceAt = now;
      this.player.body.setVelocityY(-C.normalBounceVelocity);
      this.applyHit();
      return;
    }

    const grade = this.inputHeld || this.keys.action.isDown ? this.gradeTiming(now) : 'NORMAL';
    this.attempts += 1;
    this.lastGrade = grade;
    this.lastBounceAt = now;
    this.consecutiveMisses = grade === 'NORMAL' ? this.consecutiveMisses + 1 : 0;

    const velocity = grade === 'PERFECT' ? C.perfectBounceVelocity
      : grade === 'GOOD' ? C.goodBounceVelocity : C.normalBounceVelocity;
    this.player.body.setVelocityY(-velocity);
    this.showGrade(grade);
    window.BV_AUDIO?.playBounceSound();

    if (grade === 'PERFECT') {
      this.cameras.main.shake(C.screenShakeDurationMs, C.screenShakeIntensity);
      this.physics.pause();
      this.time.delayedCall(C.hitstopDurationMs, () => this.physics.resume());
      window.BV_AUDIO?.playPerfectSting();
      this.player.setTexture('player_boost');
      this.time.delayedCall(220, () => this.player.setTexture('player_idle'));
      this.phaseNextLanding = Math.random() < C.perfectPhaseChance;
    } else if (grade === 'GOOD') {
      this.cameras.main.shake(90, C.screenShakeIntensity * 0.5);
      window.BV_AUDIO?.playGoodSting();
      const sx = this.player.scaleX, sy = this.player.scaleY;
      this.tweens.add({ targets: this.player, scaleX: sx * 1.15, scaleY: sy * 1.15, duration: 100, yoyo: true });
    }

    if (platform && platform.getData('type') === 'disappearing' && !platform.getData('crumbling')) {
      this.crumblePlatform(platform);
    }
  }

  crumblePlatform(platform) {
    platform.setData('crumbling', true);
    let frame = 1;
    const step = () => {
      if (!platform.active) return;
      if (frame > 4) {
        platform.destroy();
        return;
      }
      platform.setTexture(`platform_fade_${frame}`);
      frame += 1;
      this.time.delayedCall(window.BV_CONFIG.disappearFadeFrameMs, step);
    };
    this.time.delayedCall(window.BV_CONFIG.disappearFadeFrameMs, step);
  }

  showGrade(grade) {
    const C = window.BV_CONFIG;
    const color = grade === 'PERFECT' ? '#ffd447' : grade === 'GOOD' ? '#52d6b3' : '#b9c9d8';
    this.feedback.setText(grade).setColor(color).setScale(1.18);
    this.tweens.add({ targets: this.feedback, scale: 1, duration: 160, ease: 'Back.Out' });
  }

  update(time, delta) {
    const C = window.BV_CONFIG;
    if (Phaser.Input.Keyboard.JustDown(this.keys.restart)) this.scene.restart({ skipStart: true });
    if (Phaser.Input.Keyboard.JustDown(this.keys.mute)) window.BV_AUDIO?.toggleMuted();
    if (Phaser.Input.Keyboard.JustDown(this.keys.pause)) this.togglePause();

    if (this.gameState !== 'PLAYING') return;

    this.inputHeld = this.keys.action.isDown || this.touchPointers.size > 0;
    const direction = (this.keys.left.isDown || this.keys.a.isDown ? -1 : 0)
      + (this.keys.right.isDown || this.keys.d.isDown ? 1 : 0)
      || this.getTouchDirection();
    if (direction) {
      this.player.body.setAccelerationX(direction * C.horizontalAcceleration);
      this.player.setFlipX(direction < 0);
    } else {
      this.player.body.setAccelerationX(0);
      const dragAmount = C.horizontalDrag * delta / 1000;
      const vx = this.player.body.velocity.x;
      this.player.body.velocity.x = Math.abs(vx) <= dragAmount ? 0 : vx - Math.sign(vx) * dragAmount;
    }

    const distance = this.timingDistance(time);
    const normalized = distance / (C.timingCycleMs / 2);
    const scale = Phaser.Math.Linear(0.75, 1.65, normalized);
    this.armedGrade = this.gradeTiming(time);
    const pulseColor = this.armedGrade === 'PERFECT' ? C.colors.perfect
      : this.armedGrade === 'GOOD' ? C.colors.good : C.colors.normal;
    this.pulse.setPosition(this.player.x, this.player.y + 30)
      .setScale(scale).setStrokeStyle(3, pulseColor)
      .setAlpha(this.inputHeld ? 1 : 0.25);
    if (this.pulseGlow) this.pulseGlow.color = pulseColor;
    this.targetRing.setPosition(this.player.x, this.player.y + 30)
      .setAlpha(this.inputHeld ? 1 : 0.25);

    this.currentHeight = Math.max(0, Math.round((this.spawnY - this.player.y) / 10));
    this.bestHeight = Math.max(this.bestHeight, this.currentHeight);

    if (time - this.runStartedAt >= C.floorStartDelayMs) {
      this.floorY -= C.floorRiseSpeed * delta / 1000;
    }
    this.floor.setPosition(this.W / 2, this.floorY);

    // The floor is normally the bottom edge of the frame, full stop — the
    // camera rises in lockstep with it so nothing is ever visible below it,
    // and climbing is the only thing that keeps you ahead of it. But a big
    // (e.g. Perfect) bounce can launch the player well above that window
    // faster than the floor rises, so also keep the player within a margin
    // of the top edge — whichever constraint wants the camera higher wins.
    const floorScrollY = this.floorY - this.H;
    const playerScrollY = this.player.y - C.playerTopMargin;
    this.cameras.main.scrollY = Math.min(floorScrollY, playerScrollY);

    this.bgTileSprite.tilePositionX = Math.sin(time / 2000) * 6;
    this.bgTileSprite.tilePositionY = this.cameras.main.scrollY;
    this.bgTileSprite.y = this.cameras.main.scrollY + this.H / 2;

    this.platforms.getChildren().filter(p => p.getData('type') === 'hazard').forEach(hazard => {
      const frames = hazard.getData('frames');
      const offset = hazard.getData('offset');
      const phase = (time + offset) % C.hazardCycleMs;
      const half = C.hazardCycleMs / 2;
      const t = phase < half ? phase / half : (C.hazardCycleMs - phase) / half;
      const frameIndex = Math.min(3, Math.floor(t * 4));
      const frameKey = frames[frameIndex];
      const overlay = hazard.getData('spikeOverlay');
      if (overlay) {
        overlay.setTexture(frameKey);
        const nativeHeight = this.textures.get(frameKey).source[0].height;
        overlay.setDisplaySize(hazard.displayWidth, Math.max(1, nativeHeight * hazard.getData('spikeScaleY')));
      } else {
        hazard.setTexture(frameKey);
      }
      hazard.setData('danger', frameIndex === 3);
    });

    this.updateEnemies(time, delta);

    if (this.player.y - this.nextPlatformY < C.platformGenerateAheadCount * C.platformMinVerticalGap) {
      this.generateBatch(C.platformGenerateAheadCount);
    }
    const cullBelowY = this.player.y + C.platformCullMargin;
    this.platforms.getChildren().slice().forEach(p => { if (p.y > cullBelowY) p.destroy(); });
    this.pickups.getChildren().slice().forEach(p => { if (p.y > cullBelowY) p.destroy(); });
    this.enemies.getChildren().slice().forEach(e => {
      if (e.y > cullBelowY) {
        const shootTimer = e.getData('shootTimer');
        if (shootTimer) shootTimer.remove();
        e.destroy();
      }
    });

    this.refreshHud();

    if (this.player.y + 25 >= this.floorY) this.endRun('CAUGHT BY THE FLOOR');
  }

  applyHit() {
    const now = this.time.now;
    if (now < this.invulnerableUntil) return;
    const C = window.BV_CONFIG;

    this.lives -= 1;
    this.invulnerableUntil = now + C.hitInvulnerabilityMs;
    this.tweens.add({
      targets: this.player, alpha: 0.25, duration: 90, yoyo: true,
      repeat: Math.round(C.hitInvulnerabilityMs / 180)
    });
    this.cameras.main.shake(120, 0.01);
    window.BV_AUDIO?.playHitSfx();
    this.refreshHud();

    if (this.lives <= 0) this.endRun('OUT OF LIVES');
  }

  onPickupCollected(player, pickup) {
    const C = window.BV_CONFIG;
    pickup.destroy();
    this.coins += C.pickupValue;
    window.BV_AUDIO?.playPickupSting();
    this.tweens.add({ targets: this.hudText, scale: 1.12, duration: 120, yoyo: true });
    this.refreshHud();
  }

  refreshHud() {
    this.hudText.setText([
      `LIVES ${'♥'.repeat(Math.max(this.lives, 0))}`,
      `COINS ${this.coins}`,
      `HEIGHT ${this.currentHeight} FT  BEST ${this.bestHeight} FT`
    ]);
  }

  endRun(message) {
    if (this.gameState === 'GAMEOVER') return;
    this.gameState = 'GAMEOVER';
    this.physics.pause();
    this.cameras.main.shake(120, 0.01);
    const isNewBest = this.currentHeight >= this.bestHeight && this.currentHeight > 0;
    this.gameOverReasonText.setText(message);
    this.gameOverStatsText.setText(isNewBest
      ? `HEIGHT ${this.currentHeight} FT — NEW BEST!`
      : `HEIGHT ${this.currentHeight} FT — BEST ${this.bestHeight} FT`);
    this.gameOverOverlay.setVisible(true);
  }
}

window.BVGrayboxScene = BVGrayboxScene;
