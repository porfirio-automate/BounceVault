/* global Phaser */

(() => {
  // Scale.RESIZE measures #game-container's actual laid-out size the moment
  // the Game is constructed. If that happens before the browser has finished
  // its first layout/paint pass, the measurement can come back 0x0 — and a
  // 0-sized WebGL framebuffer doesn't just look wrong, it throws (aborting
  // Phaser's boot entirely, before any scene ever runs). Wait for a real,
  // non-zero measurement first; a couple of rAF ticks is normally enough,
  // but keep retrying (bounded) for a slow first paint.
  // setTimeout, not requestAnimationFrame: rAF is deliberately throttled/
  // paused by the browser for a tab that isn't visible (e.g. opened in the
  // background), which would otherwise leave the game stuck waiting forever
  // and never booting even once the player switches to it.
  const container = document.getElementById('game-container');
  let attempts = 0;
  const tryBoot = () => {
    const rect = container.getBoundingClientRect();
    attempts += 1;
    if ((rect.width < 1 || rect.height < 1) && attempts < 60) {
      setTimeout(tryBoot, 16);
      return;
    }
    boot();
  };
  tryBoot();

  function boot() {
    const config = {
      ...window.BV_PHASER_CONFIG,
      scene: [window.BVGrayboxScene]
    };
    window.BV_GAME = new Phaser.Game(config);
    window.BV_AUDIO = new window.BVAudioManager(window.BV_CONFIG.audio);
    wireVisibilityHandler();
  }

  function wireVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
      const scene = window.BV_GAME.scene.keys.BVGrayboxScene;
      if (!scene || !scene.sys.isActive()) return;
      if (document.hidden) {
        scene.physics.pause();
      } else if (scene.gameState === 'PLAYING') {
        // Don't override a user-initiated pause (or the start/game-over
        // screens) just because the tab regained focus.
        scene.physics.resume();
      }
    });
  }
})();
