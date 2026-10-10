// 2D physics playground API — Node.js + Express
//
// Simulates balls bouncing inside a circular arena with true elastic
// ball-to-ball collisions. Randomness comes from crypto.randomBytes.
// (Originally themed "quantum chaos" — the mechanics are classical 2D
// physics; the README describes what it actually does.)

const express = require('express');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// --- Tunable simulation config (see POST /config) ---
const config = {
    arenaRadius: 300,
    maxBalls: 25,
    spawnOnCollision: true,  // chance to spawn a new ball on wall bounce
    spawnChance: 0.3,        // (originally 0.3 via cryptoRandom() > 0.7)
    wallNoise: 0.2,          // random kick added on wall bounce
    ballNoise: 0.02,         // tiny random kick on ball-ball collision (keeps motion lively)
};

let collisionCount = 0;
let balls = [];
let noiseSeed = crypto.randomBytes(16);
// Per-ball speed retention factor on wall bounce (0.96–1.04)
const speedTable = Array.from({ length: 256 }, (_, i) => 0.96 + (i / 255 * 0.08));

function cryptoRandom() {
    return crypto.randomBytes(4).readUInt32BE() / 4294967296;
}

class Ball {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (cryptoRandom() - 0.5) * 8;
        this.vy = (cryptoRandom() - 0.5) * 8;
        this.radius = 5;
        this.trail = [];
        this.speedFactor = speedTable[Math.floor(cryptoRandom() * 256)];
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 15) this.trail.shift();
    }
}

// Wall bounce: reflect velocity across the contact normal (v - 2(v.n)n),
// keep a per-ball speed factor, add a small random kick.
function handleWallCollision(ball) {
    const R = config.arenaRadius;
    const dx = ball.x - R;
    const dy = ball.y - R;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const overlap = dist + ball.radius - R;

    if (overlap > 0 && dist > 0) {
        noiseSeed = crypto.randomBytes(16);

        const nx = dx / dist;
        const ny = dy / dist;
        const dot = 2 * (ball.vx * nx + ball.vy * ny);

        ball.vx = (ball.vx - dot * nx) * ball.speedFactor;
        ball.vy = (ball.vy - dot * ny) * ball.speedFactor;

        ball.vx += (cryptoRandom() - 0.5) * config.wallNoise;
        ball.vy += (cryptoRandom() - 0.5) * config.wallNoise;

        // push back inside the arena
        ball.x = R + (R - ball.radius - 1) * (ball.x - R) / dist;
        ball.y = R + (R - ball.radius - 1) * (ball.y - R) / dist;

        if (config.spawnOnCollision && balls.length < config.maxBalls && cryptoRandom() > (1 - config.spawnChance)) {
            balls.push(new Ball(ball.x, ball.y));
        }

        collisionCount++;
    }
}

// Ball-to-ball elastic collision (equal masses):
// separate overlap, then exchange the velocity components along the
// contact normal. Verified by test.js (head-on collision swaps velocities).
function handleBallCollisions() {
    for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
            const a = balls[i], b = balls[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = a.radius + b.radius;

            if (dist > 0 && dist < minDist) {
                const nx = dx / dist, ny = dy / dist;

                // positional correction: split the overlap
                const overlap = (minDist - dist) / 2;
                a.x -= nx * overlap; a.y -= ny * overlap;
                b.x += nx * overlap; b.y += ny * overlap;

                // impulse along the normal (elastic, equal mass)
                const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
                if (vn < 0) { // approaching
                    a.vx += vn * nx;
                    a.vy += vn * ny;
                    b.vx -= vn * nx;
                    b.vy -= vn * ny;

                    // tiny noise keeps long-run motion from going perfectly periodic
                    a.vx += (cryptoRandom() - 0.5) * config.ballNoise;
                    a.vy += (cryptoRandom() - 0.5) * config.ballNoise;

                    collisionCount++;
                }
            }
        }
    }
}

function stepOnce() {
    balls.forEach(ball => {
        ball.update();
        handleWallCollision(ball);
    });
    handleBallCollisions();
}

async function generateStateHash() {
    const state = {
        seed: noiseSeed.toString('hex'),
        timestamp: Date.now(),
        balls: balls.map(b => ({
            x: b.x.toFixed(3),
            y: b.y.toFixed(3),
            vx: b.vx.toFixed(5),
            vy: b.vy.toFixed(5),
            trail: b.trail.map(t => ({ x: t.x.toFixed(3), y: t.y.toFixed(3) }))
        }))
    };
    return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

function snapshot(hash) {
    return { balls, hash, collisionCount, radius: config.arenaRadius };
}

// --- API ---

// API index
app.get('/', (req, res) => {
    res.json({
        name: '2D physics playground API',
        endpoints: {
            'POST /start': 'reset and start the simulation (3 balls)',
            'POST /step': 'advance the simulation; body: { steps?: number, default 1 }',
            'GET /state': 'current state without advancing',
            'GET /config': 'current tuning parameters',
            'POST /config': 'tune live; body: any of { arenaRadius, maxBalls, spawnOnCollision, spawnChance, wallNoise, ballNoise }',
        }
    });
});

// Initialize simulation
app.post('/start', (req, res) => {
    const R = config.arenaRadius;
    balls = [
        new Ball(R + 50, R),
        new Ball(R - 50, R),
        new Ball(R, R + 50)
    ];
    collisionCount = 0;
    res.json({ status: 'Simulation started', balls, radius: R, collisionCount });
});

// Step the simulation (optionally multiple ticks per call)
app.post('/step', async (req, res) => {
    const steps = Math.min(Math.max(parseInt(req.body && req.body.steps) || 1, 1), 1000);
    for (let s = 0; s < steps; s++) stepOnce();
    const hash = await generateStateHash();
    res.json(Object.assign({}, snapshot(hash), { steps }));
});

// Current state without stepping
app.get('/state', async (req, res) => {
    const hash = await generateStateHash();
    res.json(snapshot(hash));
});

// Read tuning parameters
app.get('/config', (req, res) => {
    res.json(config);
});

// Tune the simulation live
app.post('/config', (req, res) => {
    const allowed = ['arenaRadius', 'maxBalls', 'spawnOnCollision', 'spawnChance', 'wallNoise', 'ballNoise'];
    for (const key of allowed) {
        if (req.body && req.body[key] !== undefined) config[key] = req.body[key];
    }
    res.json({ status: 'Config updated', config });
});

// Export for tests without starting the server
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Physics playground API running at http://localhost:${port}`);
    });
}

module.exports = { app, Ball, handleBallCollisions, handleWallCollision, stepOnce, config };
