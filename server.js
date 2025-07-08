const WebSocket = require('ws');

const FIELD_WIDTH = 2000;
const FIELD_HEIGHT = 1200;

const wss = new WebSocket.Server({ port: 8080 });

let players = {};
let ball = {
  x: FIELD_WIDTH / 2,
  y: FIELD_HEIGHT / 2,
  speedX: 0,
  speedY: 0,
  radius: 18
};

let score = { left: 0, right: 0 };

function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

function limit(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function updateBall() {
  ball.x += ball.speedX;
  ball.y += ball.speedY;

  // Limit speed
  const maxBallSpeed = 15;
  ball.speedX = limit(ball.speedX, -maxBallSpeed, maxBallSpeed);
  ball.speedY = limit(ball.speedY, -maxBallSpeed, maxBallSpeed);

  // Friction
  ball.speedX *= 0.93;
  ball.speedY *= 0.93;

  // Bounce top/bottom
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.speedY = -ball.speedY * 0.9;
  }
  if (ball.y + ball.radius > FIELD_HEIGHT) {
    ball.y = FIELD_HEIGHT - ball.radius;
    ball.speedY = -ball.speedY * 0.9;
  }

  // Goal detection and reset
  if (ball.x - ball.radius < 0) {
    score.right++;
    resetBall();
  } else if (ball.x + ball.radius > FIELD_WIDTH) {
    score.left++;
    resetBall();
  }

  // Bounce from players (delikatne odbicie)
  for (const id in players) {
    const p = players[id];
    handleBallCollision(p);
  }
}

function resetBall() {
  ball.x = FIELD_WIDTH / 2;
  ball.y = FIELD_HEIGHT / 2;
  ball.speedX = 0;
  ball.speedY = 0;
}

function handleBallCollision(player) {
  const dx = ball.x - player.x;
  const dy = ball.y - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = ball.radius + player.radius;

  if (dist < minDist) {
    const overlap = minDist - dist;

    // Normalizuj kierunek odbicia
    const nx = dx / dist;
    const ny = dy / dist;

    // Wypchnij piłkę poza gracza, żeby nie wchodziła w niego
    ball.x += nx * overlap;
    ball.y += ny * overlap;

    // Odbij wektor prędkości piłki względem normalnej kolizji
    const dot = ball.speedX * nx + ball.speedY * ny;
    ball.speedX = ball.speedX - 2 * dot * nx;
    ball.speedY = ball.speedY - 2 * dot * ny;

    // Dodaj wpływ ruchu gracza na piłkę, ale tylko delikatnie (płynnie)
    ball.speedX += player.moveX * 0.8;
    ball.speedY += player.moveY * 0.8;

    // Limit prędkości piłki po odbiciu
    const maxSpeed = 20;
    const speed = Math.sqrt(ball.speedX * ball.speedX + ball.speedY * ball.speedY);
    if (speed > maxSpeed) {
      ball.speedX = (ball.speedX / speed) * maxSpeed;
      ball.speedY = (ball.speedY / speed) * maxSpeed;
    }
  }
}

wss.on('connection', ws => {
  const id = Date.now().toString() + Math.random().toString(36).substring(2, 7);
  players[id] = {
    x: 150,
    y: FIELD_HEIGHT / 2,
    radius: 22,
    id,
    nick: 'anon',
    moveX: 0,
    moveY: 0
  };

  // Jeśli jest 2 graczy, ustaw drugiego po prawej stronie
  if (Object.keys(players).length === 2) {
    const keys = Object.keys(players);
    players[keys[0]].x = 150;
    players[keys[1]].x = FIELD_WIDTH - 150;
    players[keys[1]].y = FIELD_HEIGHT / 2;
  }

  ws.send(JSON.stringify({ type: 'id', id }));

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'move' && players[id]) {
        players[id].x = limit(data.x, players[id].radius, FIELD_WIDTH - players[id].radius);
        players[id].y = limit(data.y, players[id].radius, FIELD_HEIGHT - players[id].radius);

        // Ruch gracza (wektor) - do odbijania piłki
        players[id].moveX = data.moveX || 0;
        players[id].moveY = data.moveY || 0;
      } else if (data.type === 'kick' && players[id]) {
        // Kopnięcie piłki - dodaj silny impuls
        const p = players[id];
        const dx = ball.x - p.x;
        const dy = ball.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < p.radius + ball.radius + 10) {
          const force = 15;
          ball.speedX += (dx / dist) * force;
          ball.speedY += (dy / dist) * force;

          // Limituj prędkość piłki po kopnięciu
          const maxForce = 25;
          const speed = Math.sqrt(ball.speedX * ball.speedX + ball.speedY * ball.speedY);
          if (speed > maxForce) {
            ball.speedX = (ball.speedX / speed) * maxForce;
            ball.speedY = (ball.speedY / speed) * maxForce;
          }
        }
      } else if (data.type === 'nick' && players[id]) {
        players[id].nick = data.nick.trim().substring(0, 15) || 'anon';
      }
    } catch (e) {
      console.error('Błąd parsowania wiadomości:', e);
    }
  });

  ws.on('close', () => {
    delete players[id];
    console.log('Gracz rozłączony:', id);
  });
});

// 60 FPS
setInterval(() => {
  updateBall();
  broadcast({ type: 'update', players, ball, score });
}, 1000 / 60);

console.log('Server działa na ws://localhost:8080');
