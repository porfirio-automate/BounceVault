/* global window */

class BVAudioManager {
  constructor(config) {
    this.config = config;
    this.ctx = null;
    this.masterGain = null;
    this.muted = false;
    this.bedStep = 0;
    this.bedTimerId = null;
    this.nextNoteTime = 0;
    this.bedNotes = [0, 3, 7, 10, 7, 3, 0, -2];
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    this.ctx = new AudioContextClass();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.config.masterVolume;
    this.masterGain.connect(this.ctx.destination);
    this.startBed();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : this.config.masterVolume;
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  playTone({ startFreq, endFreq, duration, type = 'square', gainPeak = 0.18, delay = 0 }) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    if (endFreq && endFreq !== startFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), now + duration);
    }
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + Math.min(0.015, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  startBed() {
    if (this.bedTimerId) return;
    const stepDuration = 60 / this.config.bpm / 4;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    const scheduleAheadTime = 0.12;
    const rootFreq = 110;

    const tick = () => {
      while (this.nextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
        const delay = this.nextNoteTime - this.ctx.currentTime;
        const stepInCycle = this.bedStep % this.bedNotes.length;
        const semitone = this.bedNotes[stepInCycle];
        const freq = rootFreq * Math.pow(2, semitone / 12);
        this.playTone({
          startFreq: freq,
          endFreq: freq,
          duration: stepDuration * 0.85,
          type: 'sawtooth',
          gainPeak: 0.1,
          delay
        });
        if (stepInCycle === 0) {
          this.playTone({
            startFreq: rootFreq / 2,
            endFreq: rootFreq / 2.3,
            duration: stepDuration * 1.6,
            type: 'sawtooth',
            gainPeak: 0.16,
            delay
          });
        }
        this.nextNoteTime += stepDuration;
        this.bedStep += 1;
      }
    };

    tick();
    this.bedTimerId = window.setInterval(tick, 40);
  }

  playPerfectSting() {
    this.playTone({ startFreq: 880, endFreq: 1760, duration: 0.16, type: 'triangle', gainPeak: 0.22 });
  }

  playGoodSting() {
    this.playTone({ startFreq: 660, endFreq: 990, duration: 0.12, type: 'triangle', gainPeak: 0.18 });
  }

  playPickupSting() {
    this.playTone({ startFreq: 660, endFreq: 1100, duration: 0.1, type: 'square', gainPeak: 0.16 });
  }

  playHitSfx() {
    this.playTone({ startFreq: 300, endFreq: 90, duration: 0.22, type: 'sawtooth', gainPeak: 0.2 });
  }

  playTick() {
    this.playTone({ startFreq: 1200, endFreq: 1200, duration: 0.03, type: 'sine', gainPeak: 0.07 });
  }

  playBounceSound() {
    this.playTone({ startFreq: 180, endFreq: 480, duration: 0.09, type: 'sine', gainPeak: 0.16 });
  }

  playTurretFireSound() {
    this.playTone({ startFreq: 1500, endFreq: 180, duration: 0.13, type: 'sawtooth', gainPeak: 0.18 });
  }

  playProjectileImpact() {
    this.playTone({ startFreq: 950, endFreq: 120, duration: 0.09, type: 'square', gainPeak: 0.18 });
  }
}

window.BVAudioManager = BVAudioManager;
