const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

const FIELD_WIDTH = 2000;
const FIELD_HEIGHT = 1200;

const playerRadius = 22;
const ballRadius = 18;

const maxBallSpeed = 20;

let players = {};
let ball = {
  x: FIELD_WIDTH / 2,
  y: FIELD_HEIGHT / 2,
  speedX: 0,
  speedY: 0,
  radius: ballRadius,
};
let score = { left: 0, right: 0 };

function randomId() {
  return Math.random().toString(36).substr(2, 9);
}

function resetBall() {
  ball.x = FIELD_WIDTH / 2;
  ball.y = FIELD_HEIGHT / 2;
  ball.speedX = (Math.random() < 0.5 ? -1 : 1) * 10;
  ball.speedY = (Math.random() * 6) - 3;
}

resetBall();

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function handleBallCollision(player) {
  const dx = ball.x - player.x;
  const dy = ball.y - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = ball.radius + player.radius;

  if (dist < minDist) {
    // Normalizowany wektor od gracza do piłki
    const nx = dx / dist;
    const ny = dy / dist;

    // Sprawdź czy piłka zbliża się do gracza (dot < 0)
    const dot = ball.speedX * nx + ball.speedY * ny;

    if (dot < 0) {
      // Odbij prędkość piłki względem normalnej
      ball.speedX = ball.speedX - 2 * dot * nx;
      ball.speedY = ball.speedY - 2 * dot * ny;

      // Dodaj wpływ ruchu gracza
      ball.speedX += player.moveX * 1.0;
      ball.speedY += player.moveY * 1.0;

      // Ustaw piłkę tuż poza graczem, żeby nie "przyklejała się"
      ball.x = player.x + nx * minDist;
      ball.y = player.y + ny * minDist;

      // Ogranicz prędkość piłki
      const speed = Math.sqrt(ball.speedX * ball.speedX + ball.speedY * ball.speedY);
      if (speed > maxBallSpeed) {
        ball.speedX = (ball.speedX / speed) * maxBallSpeed;
        ball.speedY = (ball.speedY / speed) * maxBallSpeed;
      }
    }
  }
}

function update() {
  // Update player positions
  for (const id in players) {
    const p = players[id];
    p.x += p.moveX * p.speed;
    p.y += p.moveY * p.speed;

    p.x = clamp(p.x, playerRadius, FIELD_WIDTH - playerRadius);
    p.y = clamp(p.y, playerRadius, FIELD_HEIGHT - playerRadius);
  }

  // Update ball position
  ball.x += ball.speedX;
  ball.y += ball.speedY;

  // Odbicie od ścian (górna/dolna)
  if (ball.y < ball.radius) {
    ball.y = ball.radius;
    ball.speedY = -ball.speedY;
  }
  if (ball.y > FIELD_HEIGHT - ball.radius) {
    ball.y = FIELD_HEIGHT - ball.radius;
    ball.speedY = -ball.speedY;
  }

  // Bramki (po lewej i prawej)
  const goalTop = FIELD_HEIGHT / 2 - 120;
  const goalBottom = FIELD_HEIGHT / 2 + 120;

  if (
    ball.x < ball.radius &&
    ball.y > goalTop &&
    ball.y < goalBottom
  ) {
    // Punkt dla prawej drużyny
    score.right++;
    resetBall();
  } else if (
    ball.x > FIELD_WIDTH - ball.radius &&
    ball.y > goalTop &&
    ball.y < goalBottom
  ) {
    // Punkt dla lewej drużyny
    score.left++;
    resetBall();
  }

  // Odbicia piłki od graczy
  for (const id in players) {
    handleBallCollision(players[id]);
  }
}

function broadcastState() {
  const state = {
    type: 'update',
    players,
    ball,
    score,
  };
  const msg = JSON.stringify(state);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

wss.on('connection', ws => {
  const id = randomId();
  players[id] = {
    id,
    nick: 'Anon',
    x: id.endsWith('a') ? 150 : FIELD_WIDTH - 150,
    y: FIELD_HEIGHT / 2,
    radius: playerRadius,
    moveX: 0,
    moveY: 0,
    speed: 10,
  };

  ws.send(JSON.stringify({ type: 'id', id }));

  ws.on('message', message => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (!players[id]) return;

    if (data.type === 'nick') {
      players[id].nick = data.nick.substring(0, 15);
    }

    if (data.type === 'move') {
      // Dane moveX, moveY to wartości od -1 do 1
      players[id].moveX = clamp(data.moveX, -1, 1);
      players[id].moveY = clamp(data.moveY, -1, 1);
    }

    if (data.type === 'kick') {
      // Spacja - silniejszy kopnięcie piłki, jeśli gracz blisko piłki
      const p = players[id];
      const dx = ball.x - p.x;
      const dy = ball.y - p.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < ball.radius + p.radius + 20) {
        // Dodajemy mocne uderzenie
        const nx = dx / dist;
        const ny = dy / dist;
        ball.speedX += nx * 25;
        ball.speedY += ny * 25;
      }
    }
  });

  ws.on('close', () => {
    delete players[id];
  });
});

// Główna pętla 60fps
setInterval(() => {
  update();
  broadcastState();
}, 1000 / 60);

console.log('Serwer uruchomiony na porcie 8080');
