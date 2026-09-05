/* global Phaser */

window.BV_CONFIG = Object.freeze({
  gravity: 2200,
  normalBounceVelocity: 950,
  goodBounceVelocity: 1400,
  perfectBounceVelocity: 2150,
  horizontalAirSpeedCap: 300,
  horizontalAcceleration: 1800,
  horizontalDrag: 1500,
  timingCycleMs: 600,
  perfectWindowMs: 120,
  goodWindowMs: 80,
  learningWindowMs: 160,
  learningAttempts: 3,
  catchUpMisses: 4,
  hitstopDurationMs: 70,
  screenShakeDurationMs: 150,
  screenShakeIntensity: 0.006,
  bounceLockoutMs: 100,
  perfectPhaseChance: 0.15,
  playerTopMargin: 220,
  startingLives: 3,
  hitInvulnerabilityMs: 900,
  floorRiseSpeed: 32,
  floorStartDelayMs: 2500,
  pickupValue: 1,
  platformSpriteHeight: 40,
  disappearFadeFrameMs: 400,
  hazardCycleMs: 2200,
  hazardStaggerMs: 350,
  worldTop: -1000000,
  platformMinWidth: 140,
  platformMaxWidth: 260,
  platformMinVerticalGap: 150,
  platformMaxVerticalGap: 190,
  platformMaxHorizontalStep: 145,
  platformGenerateAheadCount: 12,
  platformCullMargin: 1400,
  pickupSpawnChance: 0.35,
  enemySpawnChance: 0.18,
  enemyCrawlerSpeed: 70,
  enemyKillBonusCoins: 2,
  enemyDeathFrameMs: 90,
  turretShootIntervalMs: 2600,
  turretProjectileSpeed: 500,
  slimeHopIntervalMs: 1800,
  slimeHopVelocity: 700,
  colors: {
    background: 0x08111f,
    player: 0xf1c453,
    normal: 0x91a4b7,
    good: 0x52d6b3,
    perfect: 0xffd447,
    danger: 0xff6577,
    pickup: 0x52e0ff,
    floor: 0xff3355
  },
  glow: {
    ring: 4,
    player: 2,
    obstacle: 6,
    pickup: 4,
    floor: 5
  },
  audio: {
    bpm: 100,
    masterVolume: 0.5
  }
});

window.BV_PHASER_CONFIG = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: window.BV_CONFIG.colors.background,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: window.BV_CONFIG.gravity },
      debug: false
    }
  },
  scale: {
    // RESIZE (rather than a fixed-resolution FIT/letterbox) makes the canvas
    // always exactly match the device's actual viewport, so the play field
    // genuinely fills the screen instead of a fixed 540x960 box scaled (with
    // bars) to fit whatever device it lands on.
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight
  },
  input: { activePointers: 3 }
};
