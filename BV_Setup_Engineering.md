# Bounce Vault FEAT-0001 Gray-Box Starter

Status: in progress  
Scope: FEAT-0001 only

## Run locally

Keep all files in the same directory. Start any static web server in that directory, then open `BV_Index_Client.html` through the server. Opening the HTML directly as a `file://` URL is not recommended.

Example with Node installed:

```bash
npx serve .
```

## Controls

- Mobile primary control: press the left or right half of the screen to steer in that direction. Either touch also counts as the rhythm-timing input for the next landing.
- Multi-touch: pressing both halves cancels horizontal steering while keeping the timing input armed.
- Desktop testing fallback: `A`/`D` or arrow keys to steer and `Space` for timing.
- Restart: `R`. Mute audio: `M`.

## Current implementation

- Automatic landing bounce
- Normal, Good, and Perfect bounce grades
- Millisecond-based 600 ms timing cycle
- Three-attempt learning window
- One-attempt catch-up after four misses
- Perfect-bounce hitstop and camera shake
- Horizontal air control
- Responsive portrait canvas with safe-area and overscroll protection
- Full-screen left/right mobile touch zones with multi-touch tracking
- Background-tab physics pause
- On-screen tuning diagnostics
- Height readout with a session-best that survives restarts
- Lives, hardcoded mid-air obstacles, and coin pickups (steer to dodge/collect)
- A rising floor that ends your run instantly if it catches you
- Neon-arcade glow pass (WebGL `postFX.addGlow`) on the timing ring, player, hazards, pickups, and floor — still gray-box shapes, no final art
- Synthesized placeholder audio (Web Audio oscillators): a looping arpeggio bed plus stings on Perfect bounces, pickups, and hits — no composed music/SFX assets yet

## Intentionally excluded

Procedural generation, bonus chambers, inventory, economy, monetization, final art assets, composed audio, and persistence are not part of this pass.
