const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const WIDTH = 900;
const HEIGHT = 600;
const PLAYER_RADIUS = 25;
const BALL_RADIUS = 15;
const PLAYER_SPEED = 6;
const GOAL_WIDTH = 150;
const GOAL_HEIGHT = 120;

let players = {};
let ball = {
  x: WIDTH / 2,
  y: HEIGHT / 2,
  vx: 0,
  vy: 0,
  radius: BALL_RADIUS,
};

let scores = {
  left: 0,
  right: 0,
};

function broadcast(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

function resetBall() {
  ball.x = WIDTH / 2;
  ball.y = HEIGHT / 2;
  ball.vx = 0;
  ball.vy = 0;
}

function startBall(direction = 1) {
  const speed = 7;
  const angle = (Math.random() * 0.6 - 0.3);
  ball.vx = speed * direction;
  ball.vy = speed * angle;
}

function update() {
  for (const id in players) {
    const p = players[id];
    if (p.keys.up) p.y -= PLAYER_SPEED;
    if (p.keys.down) p.y += PLAYER_SPEED;
    if (p.keys.left) p.x -= PLAYER_SPEED;
    if (p.keys.right) p.x += PLAYER_SPEED;

    p.x = Math.max(PLAYER_RADIUS, Math.min(WIDTH - PLAYER_RADIUS, p.x));
    p.y = Math.max(PLAYER_RADIUS, Math.min(HEIGHT - PLAYER_RADIUS, p.y));
  }

  ball.x += ball.vx;
  ball.y += ball.vy;

  // Ball bounce top/bottom
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.vy = -ball.vy;
  }
  if (ball.y + ball.radius > HEIGHT) {
    ball.y = HEIGHT - ball.radius;
    ball.vy = -ball.vy;
  }

  // Goal detection
  const goalTop = (HEIGHT - GOAL_HEIGHT) / 2;
  const goalBottom = goalTop + GOAL_HEIGHT;

  if (
    ball.x - ball.radius < 0 &&
    ball.y > goalTop &&
    ball.y < goalBottom
  ) {
    scores.right++;
    resetBall();
    setTimeout(() => startBall(1), 1000);
  }

  if (
    ball.x + ball.radius > WIDTH &&
    ball.y > goalTop &&
    ball.y < goalBottom
  ) {
    scores.left++;
    resetBall();
    setTimeout(() => startBall(-1), 1000);
  }

  // Ball bounce side walls outside goals
  if (ball.x - ball.radius < 0 && (ball.y < goalTop || ball.y > goalBottom)) {
    ball.x = ball.radius;
    ball.vx = -ball.vx;
  }
  if (ball.x + ball.radius > WIDTH && (ball.y < goalTop || ball.y > goalBottom)) {
    ball.x = WIDTH - ball.radius;
    ball.vx = -ball.vx;
  }

  // Ball-player collision
  for (const id in players) {
    const p = players[id];
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (dist < ball.radius + PLAYER_RADIUS) {
      const angle = Math.atan2(dy, dx);
      const speed = Math.min(15, Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy) + 2);
      ball.vx = speed * Math.cos(angle);
      ball.vy = speed * Math.sin(angle);

      const overlap = ball.radius + PLAYER_RADIUS - dist;
      ball.x += Math.cos(angle) * overlap;
      ball.y += Math.sin(angle) * overlap;
    }
  }
}

wss.on('connection', (ws) => {
  if (Object.keys(players).length >= 2) {
    ws.send(JSON.stringify({ type: 'error', message: 'Maksymalna liczba graczy (2) osiągnięta' }));
    ws.close();
    return;
  }

  const id = Date.now().toString() + Math.floor(Math.random() * 1000);
  const side = Object.keys(players).length === 0 ? 'left' : 'right';
  const startX = side === 'left' ? 100 : WIDTH - 100;
  const startY = HEIGHT / 2;

  players[id] = {
    x: startX,
    y: startY,
    radius: PLAYER_RADIUS,
    keys: { up: false, down: false, left: false, right: false },
    id,
    nick: 'Anon',
    side,
  };

  ws.send(JSON.stringify({ type: 'id', id }));
  ws.send(JSON.stringify({ type: 'scores', scores }));
  console.log(`Player connected: ${id} (${side})`);

  if (Object.keys(players).length === 2 && ball.vx === 0 && ball.vy === 0) {
    startBall(Math.random() < 0.5 ? 1 : -1);
  }

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!players[id]) return;

      if (data.type === 'keys') {
        players[id].keys = data.keys;
      }

      if (data.type === 'nick' && typeof data.nick === 'string') {
        players[id].nick = data.nick.slice(0, 15);
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });

  ws.on('close', () => {
    delete players[id];
    console.log(`Player disconnected: ${id}`);
    if (Object.keys(players).length < 2) resetBall();
  });
});

setInterval(() => {
  update();
  broadcast({ type: 'update', players, ball, scores });
}, 1000 / 60);

console.log(`Server running on ws://localhost:${PORT}`);
