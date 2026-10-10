# 2D Physics Playground API

A Node.js + Express backend that simulates balls bouncing inside a circular arena — with true elastic ball-to-ball collisions, wall reflection, motion trails, and live tuning. A single-page frontend (`index.html`) visualizes it.

An honest note on the name: this repo was originally themed "quantum chaos", but the mechanics are classical 2D physics with `crypto.randomBytes` randomness. What's real here is the physics engine and the API design, and that's what this README describes.

## What it actually does

- **Elastic collisions** — equal-mass balls exchange velocity along the contact normal (verified: head-on collisions swap velocities, momentum and energy conserved — see `test.js`)
- **Wall reflection** — proper `v − 2(v·n)n` reflection off the circular arena, with per-ball speed retention and a small random kick
- **Ball spawning** — wall bounces can spawn new balls up to a configurable cap
- **State hashing** — every step returns a SHA-256 hash of the full simulation state (useful for reproducibility checks)
- **Live tuning** — change arena size, ball cap, noise, and spawn behavior without restarting

## API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | API index |
| `POST` | `/start` | Reset simulation (3 balls) |
| `POST` | `/step` | Advance N ticks: `{ "steps": 10 }` (default 1, max 1000) |
| `GET` | `/state` | Current state without advancing |
| `GET` | `/config` | Current tuning parameters |
| `POST` | `/config` | Tune live, e.g. `{ "maxBalls": 10, "wallNoise": 0.5 }` |

Example:

```bash
npm install
node server.js

curl -X POST http://localhost:3000/start
curl -X POST http://localhost:3000/step -H 'Content-Type: application/json' -d '{"steps": 20}'
curl http://localhost:3000/state
```

Then open `index.html` in a browser for the visualization (it talks to `localhost:3000`).

## Tests

```bash
node test.js
```

Verifies: head-on collisions swap velocities, separating balls are untouched, momentum + kinetic energy conserved in oblique collisions, wall bounce reflects inward and repositions inside the arena.

## Project history

- **v1** — Express server, wall-bounce physics, SHA-256 state hashing, single-page visualizer
- **v2** — added real ball-to-ball elastic collisions (the v1 balls passed through each other), multi-step endpoint, live config tuning, physics test suite, honest documentation

## Tech

Node.js, Express, `crypto` (randomness + hashing), vanilla JS + Canvas frontend. No database, no build step.
