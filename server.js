const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

const players = {};
const ball = {
  x: 800,
  y: 450,
  vx: 0,
  vy: 0,
  radius: 15,
};

let score = { left: 0, right: 0 };
const fieldWidth = 1600;
const fieldHeight = 900;
const playerRadius = 25;

function broadcast(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

function resetBall() {
  ball.x = fieldWidth / 2;
  ball.y = fieldHeight / 2;
  ball.vx = (Math.random() < 0.5 ? -1 : 1) * 5;
  ball.vy = (Math.random() - 0.5) * 4;
}

resetBall();

wss.on('connection', ws => {
  let playerId = Math.random().toString(36).substr(2, 9);
  players[playerId] = {
    x: playerId[0] < 'm' ? 300 : 1300,
    y: fieldHeight / 2,
    vx: 0,
    vy: 0,
    radius: playerRadius,
    nick: "Anon",
    kick: false,
  };

  ws.send(JSON.stringify({ type: 'id', id: playerId }));

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'nick') {
        if (players[playerId]) players[playerId].nick = data.nick.slice(0, 15);
      }
      if (data.type === 'input' && players[playerId]) {
        players[playerId].vx = data.vx;
        players[playerId].vy = data.vy;
        players[playerId].kick = data.kick;
      }
    } catch (e) {
      console.error(e);
    }
  });

  ws.on('close', () => {
    delete players[playerId];
  });
});

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function update() {
  // Update players
  for (const id in players) {
    const p = players[id];
    p.x += p.vx * 6;
    p.y += p.vy * 6;

    // keep in bounds
    p.x = Math.max(p.radius, Math.min(fieldWidth - p.radius, p.x));
    p.y = Math.max(p.radius, Math.min(fieldHeight - p.radius, p.y));
  }

  // Ball physics and collision with players
  ball.x += ball.vx;
  ball.y += ball.vy;

  // friction
  ball.vx *= 0.98;
  ball.vy *= 0.98;

  // collision with players - simple elastic collision + kick
  for (const id in players) {
    const p = players[id];
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.hypot(dx, dy);
    const minDist = ball.radius + p.radius;
    if (dist < minDist) {
      // normalize vector from player to ball
      const nx = dx / dist;
      const ny = dy / dist;
      // push ball outside player
      ball.x = p.x + nx * minDist;
      ball.y = p.y + ny * minDist;

      // relative velocity
      let relVx = ball.vx - p.vx * 6;
      let relVy = ball.vy - p.vy * 6;

      // bounce
      const dot = relVx * nx + relVy * ny;
      ball.vx -= 2 * dot * nx;
      ball.vy -= 2 * dot * ny;

      // if player kicks (space pressed) apply stronger force
      if (p.kick) {
        ball.vx += nx * 10;
        ball.vy += ny * 10;
      }
    }
  }

  // Bounce ball off walls
  if (ball.x < ball.radius) {
    ball.x = ball.radius;
    ball.vx = -ball.vx;
  } else if (ball.x > fieldWidth - ball.radius) {
    ball.x = fieldWidth - ball.radius;
    ball.vx = -ball.vx;
  }

  if (ball.y < ball.radius) {
    ball.y = ball.radius;
    ball.vy = -ball.vy;
  } else if (ball.y > fieldHeight - ball.radius) {
    ball.y = fieldHeight - ball.radius;
    ball.vy = -ball.vy;
  }

  // Goals
  // Left goal
  if (
    ball.x - ball.radius < 0 &&
    ball.y > fieldHeight / 2 - 100 &&
    ball.y < fieldHeight / 2 + 100
  ) {
    score.right++;
    resetBall();
  }
  // Right goal
  if (
    ball.x + ball.radius > fieldWidth &&
    ball.y > fieldHeight / 2 - 100 &&
    ball.y < fieldHeight / 2 + 100
  ) {
    score.left++;
    resetBall();
  }

  // Broadcast state
  broadcast({
    type: 'state',
    players,
    ball,
    score,
  });
}

setInterval(update, 1000 / 60);

console.log('Server działa na porcie 8080');
