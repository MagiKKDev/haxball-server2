const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

const FIELD_WIDTH = 1600;
const FIELD_HEIGHT = 900;

class Player {
  constructor(id, nick) {
    this.id = id;
    this.nick = nick || 'Anon';
    this.x = FIELD_WIDTH / 4;
    this.y = FIELD_HEIGHT / 2;
    this.radius = 30;
    this.vx = 0;
    this.vy = 0;
  }
}

class Ball {
  constructor() {
    this.x = FIELD_WIDTH / 2;
    this.y = FIELD_HEIGHT / 2;
    this.radius = 20;
    this.vx = 0;
    this.vy = 0;
  }
}

const players = new Map();
const sockets = new Map();

const ball = new Ball();
let score = { left: 0, right: 0 };

function resetPositions() {
  let i = 0;
  for (const player of players.values()) {
    player.x = (i === 0) ? FIELD_WIDTH / 4 : FIELD_WIDTH * 3 / 4;
    player.y = FIELD_HEIGHT / 2;
    player.vx = 0;
    player.vy = 0;
    i++;
  }
  ball.x = FIELD_WIDTH / 2;
  ball.y = FIELD_HEIGHT / 2;
  ball.vx = 0;
  ball.vy = 0;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function updatePhysics() {
  // Update ball position and friction
  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.vx *= 0.95;
  ball.vy *= 0.95;

  // Ball bounce top/bottom
  if (ball.y < ball.radius) {
    ball.y = ball.radius;
    ball.vy = -ball.vy;
  }
  if (ball.y > FIELD_HEIGHT - ball.radius) {
    ball.y = FIELD_HEIGHT - ball.radius;
    ball.vy = -ball.vy;
  }

  // Goal detection
  if (
    ball.x - ball.radius < 10 &&
    ball.y > FIELD_HEIGHT / 2 - 100 &&
    ball.y < FIELD_HEIGHT / 2 + 100
  ) {
    score.right++;
    resetPositions();
  }
  if (
    ball.x + ball.radius > FIELD_WIDTH - 10 &&
    ball.y > FIELD_HEIGHT / 2 - 100 &&
    ball.y < FIELD_HEIGHT / 2 + 100
  ) {
    score.left++;
    resetPositions();
  }

  // Update players positions and friction
  for (const player of players.values()) {
    player.x += player.vx;
    player.y += player.vy;
    player.vx *= 0.7;
    player.vy *= 0.7;

    player.x = Math.max(player.radius, Math.min(FIELD_WIDTH - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(FIELD_HEIGHT - player.radius, player.y));
  }

  // Ball collision with players
  for (const player of players.values()) {
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = Math.hypot(dx, dy);
    const minDist = ball.radius + player.radius;
    if (dist < minDist) {
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;

      ball.x += nx * overlap;
      ball.y += ny * overlap;

      ball.vx = nx * 10 + player.vx * 0.5;
      ball.vy = ny * 10 + player.vy * 0.5;
    }
  }

  // Players repel each other
  const arrPlayers = Array.from(players.values());
  for (let i = 0; i < arrPlayers.length; i++) {
    for (let j = i + 1; j < arrPlayers.length; j++) {
      const p1 = arrPlayers[i];
      const p2 = arrPlayers[j];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      const minDist = p1.radius + p2.radius;
      if (dist < minDist) {
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        p1.x -= nx * overlap / 2;
        p1.y -= ny * overlap / 2;
        p2.x += nx * overlap / 2;
        p2.y += ny * overlap / 2;
      }
    }
  }
}

function broadcastGameState() {
  const payload = JSON.stringify({
    type: 'update',
    players: Object.fromEntries(
      [...players].map(([id, p]) => [id, { x: p.x, y: p.y, radius: p.radius, nick: p.nick }])
    ),
    ball: { x: ball.x, y: ball.y, radius: ball.radius },
    score,
  });

  for (const ws of sockets.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function gameLoop() {
  updatePhysics();
  broadcastGameState();
}

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).substr(2, 9);
  players.set(id, new Player(id));
  sockets.set(id, ws);

  ws.send(JSON.stringify({ type: 'id', id }));

  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    const player = players.get(id);
    if (!player) return;

    if (data.type === 'nick') {
      player.nick = data.nick.slice(0, 15);
    }

    if (data.type === 'move') {
      const dx = data.x - player.x;
      const dy = data.y - player.y;
      const maxSpeed = 8;
      const dist = Math.hypot(dx, dy);
      if (dist > maxSpeed) {
        player.vx = (dx / dist) * maxSpeed;
        player.vy = (dy / dist) * maxSpeed;
      } else {
        player.vx = dx;
        player.vy = dy;
      }
    }

    if (data.type === 'kick') {
      const dx = ball.x - player.x;
      const dy = ball.y - player.y;
      const dist = Math.hypot(dx, dy);
      const kickRange = player.radius + ball.radius + 10;
      if (dist < kickRange) {
        const nx = dx / dist;
        const ny = dy / dist;
        ball.vx += nx * 20;
        ball.vy += ny * 20;
      }
    }
  });

  ws.on('close', () => {
    players.delete(id);
    sockets.delete(id);
  });
});

setInterval(gameLoop, 1000 / 60);

console.log('Server started on port 8080');
