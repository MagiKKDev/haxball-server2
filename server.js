const WebSocket = require('ws');

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });

const FIELD = {
  width: 1000,
  height: 600,
  goalWidth: 20,
  goalHeight: 180,
  goalY: (600 - 180) / 2,
  playerRadius: 25,
  ballRadius: 15,
};

const SPEED_LIMIT = 10;
const FRICTION = 0.95;
const BALL_FRICTION = 0.97;
const KICK_POWER = 12;

let players = {}; // id: {x, y, nickname, ws}
let ball = {
  x: FIELD.width / 2,
  y: FIELD.height / 2,
  vx: 0,
  vy: 0,
};
let score = { left: 0, right: 0 };
let playerCount = 0;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resetBall() {
  ball.x = FIELD.width / 2;
  ball.y = FIELD.height / 2;
  ball.vx = 0;
  ball.vy = 0;
}

function broadcast(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(json);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateBall() {
  ball.x += ball.vx;
  ball.y += ball.vy;

  ball.vx *= BALL_FRICTION;
  ball.vy *= BALL_FRICTION;

  // Odbij od góry/dna
  if (ball.y < FIELD.ballRadius) {
    ball.y = FIELD.ballRadius;
    ball.vy = -ball.vy;
  }
  if (ball.y > FIELD.height - FIELD.ballRadius) {
    ball.y = FIELD.height - FIELD.ballRadius;
    ball.vy = -ball.vy;
  }

  // Lewa bramka i ściana
  if (ball.x < FIELD.ballRadius + FIELD.goalWidth) {
    if (ball.y > FIELD.goalY && ball.y < FIELD.goalY + FIELD.goalHeight) {
      // Gol dla prawego
      score.right++;
      broadcast({ type: 'goal', score });
      resetBall();
    } else if (ball.x < FIELD.ballRadius) {
      ball.x = FIELD.ballRadius;
      ball.vx = -ball.vx;
    }
  }

  // Prawa bramka i ściana
  if (ball.x > FIELD.width - FIELD.ballRadius - FIELD.goalWidth) {
    if (ball.y > FIELD.goalY && ball.y < FIELD.goalY + FIELD.goalHeight) {
      // Gol dla lewego
      score.left++;
      broadcast({ type: 'goal', score });
      resetBall();
    } else if (ball.x > FIELD.width - FIELD.ballRadius) {
      ball.x = FIELD.width - FIELD.ballRadius;
      ball.vx = -ball.vx;
    }
  }
}

function gameLoop() {
  // Aktualizacja piłki
  updateBall();

  // Kolizje piłki z graczami
  Object.values(players).forEach(p => {
    const dist = distance(p, ball);
    if (dist < FIELD.playerRadius + FIELD.ballRadius) {
      // Kopnięcie piłki
      const angle = Math.atan2(ball.y - p.y, ball.x - p.x);
      ball.vx = Math.cos(angle) * KICK_POWER;
      ball.vy = Math.sin(angle) * KICK_POWER;
      // Ustaw piłkę na zewnątrz gracza, żeby nie "wtopiła się"
      ball.x = p.x + (FIELD.playerRadius + FIELD.ballRadius) * Math.cos(angle);
      ball.y = p.y + (FIELD.playerRadius + FIELD.ballRadius) * Math.sin(angle);
    }
  });

  broadcast({
    type: 'state',
    players: Object.fromEntries(Object.entries(players).map(([id, p]) => [id, { x: p.x, y: p.y, nickname: p.nickname }])),
    ball,
    score,
  });
}

wss.on('connection', ws => {
  if (playerCount >= 2) {
    ws.send(JSON.stringify({ type: 'full', message: 'Serwer pełny, spróbuj później.' }));
    ws.close();
    return;
  }

  playerCount++;
  const id = playerCount;
  players[id] = {
    x: id === 1 ? FIELD.playerRadius + FIELD.goalWidth + 50 : FIELD.width - FIELD.playerRadius - FIELD.goalWidth - 50,
    y: FIELD.height / 2,
    nickname: 'Anon',
    ws,
  };

  ws.send(JSON.stringify({
    type: 'init',
    id,
    players: Object.fromEntries(Object.entries(players).map(([pid, p]) => [pid, { x: p.x, y: p.y, nickname: p.nickname }])),
    ball,
    score,
    field: FIELD,
  }));

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      const player = players[id];
      if (!player) return;

      if (data.type === 'join' && typeof data.nickname === 'string') {
        player.nickname = data.nickname.trim().slice(0, 15);
      }

      if (data.type === 'move') {
        // Ogranicz ruch w granicach boiska
        player.x = clamp(data.x, FIELD.playerRadius + FIELD.goalWidth, FIELD.width - FIELD.playerRadius - FIELD.goalWidth);
        player.y = clamp(data.y, FIELD.playerRadius, FIELD.height - FIELD.playerRadius);
      }

      if (data.type === 'kick') {
        // Można tu dodać dodatkową logikę kicka na serwerze, ale obecnie obsługujemy w update ball
      }

    } catch (e) {
      console.error('Błąd parsowania:', e);
    }
  });

  ws.on('close', () => {
    delete players[id];
    playerCount--;
  });
});

setInterval(gameLoop, 1000 / 30);

console.log(`Serwer działa na porcie ${PORT}`);
