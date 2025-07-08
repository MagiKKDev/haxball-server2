const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const FIELD_WIDTH = 900;
const FIELD_HEIGHT = 500;
const PLAYER_RADIUS = 20;
const BALL_RADIUS = 12;
const GOAL_WIDTH = 10;
const GOAL_HEIGHT = 150;
const GOAL_Y = (FIELD_HEIGHT - GOAL_HEIGHT) / 2;

const TICK_RATE = 20; // 50ms

let players = {}; // id -> { x, y, nickname, ws }
let ball = {
  x: FIELD_WIDTH / 2,
  y: FIELD_HEIGHT / 2,
  vx: 0,
  vy: 0,
};
let score = { left: 0, right: 0 };

let playerIdCounter = 1;

function distance(a, b) {
  return Math.sqrt((a.x - b.x)**2 + (a.y - b.y)**2);
}

function resetBall() {
  ball.x = FIELD_WIDTH / 2;
  ball.y = FIELD_HEIGHT / 2;
  ball.vx = 0;
  ball.vy = 0;
}

function broadcast(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(json);
  });
}

function updateBall() {
  ball.x += ball.vx;
  ball.y += ball.vy;

  ball.vx *= 0.98;
  ball.vy *= 0.98;

  // Odbicia od ścian i bramek
  if (ball.x < BALL_RADIUS) {
    if (ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_HEIGHT) {
      // Gol dla prawej drużyny
      score.right++;
      broadcast({ type: 'goal', score });
      resetBall();
      return;
    }
    ball.vx = -ball.vx;
    ball.x = BALL_RADIUS;
  }
  if (ball.x > FIELD_WIDTH - BALL_RADIUS) {
    if (ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_HEIGHT) {
      // Gol dla lewej drużyny
      score.left++;
      broadcast({ type: 'goal', score });
      resetBall();
      return;
    }
    ball.vx = -ball.vx;
    ball.x = FIELD_WIDTH - BALL_RADIUS;
  }
  if (ball.y < BALL_RADIUS) {
    ball.vy = -ball.vy;
    ball.y = BALL_RADIUS;
  }
  if (ball.y > FIELD_HEIGHT - BALL_RADIUS) {
    ball.vy = -ball.vy;
    ball.y = FIELD_HEIGHT - BALL_RADIUS;
  }
}

function handlePlayerMovement(player) {
  player.x = Math.min(FIELD_WIDTH - PLAYER_RADIUS, Math.max(PLAYER_RADIUS, player.x));
  player.y = Math.min(FIELD_HEIGHT - PLAYER_RADIUS, Math.max(PLAYER_RADIUS, player.y));
}

function gameTick() {
  updateBall();

  for (const id in players) {
    const p = players[id];
    const dist = distance(p, ball);
    if (dist < PLAYER_RADIUS + BALL_RADIUS) {
      // Kopnięcie piłki przy kontakcie
      const angle = Math.atan2(ball.y - p.y, ball.x - p.x);
      ball.vx = Math.cos(angle) * 7;
      ball.vy = Math.sin(angle) * 7;
      ball.x = p.x + (PLAYER_RADIUS + BALL_RADIUS + 1) * Math.cos(angle);
      ball.y = p.y + (PLAYER_RADIUS + BALL_RADIUS + 1) * Math.sin(angle);
    }
  }

  broadcast({
    type: 'state',
    players: Object.fromEntries(Object.entries(players).map(([id, p]) => [id, { x: p.x, y: p.y, nickname: p.nickname }])),
    ball,
    score,
  });
}

wss.on('connection', ws => {
  if (Object.keys(players).length >= 2) {
    ws.send(JSON.stringify({ type: 'full', message: 'Serwer pełny. Spróbuj później.' }));
    ws.close();
    return;
  }

  const playerId = playerIdCounter++;
  players[playerId] = {
    x: playerId === 1 ? 100 : FIELD_WIDTH - 100,
    y: FIELD_HEIGHT / 2,
    nickname: 'Anon',
    ws,
  };

  ws.send(JSON.stringify({
    type: 'init',
    id: playerId,
    players: Object.fromEntries(Object.entries(players).map(([id, p]) => [id, { x: p.x, y: p.y, nickname: p.nickname }])),
    ball,
    score,
  }));

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);
      const p = players[playerId];
      if (!p) return;

      if (data.type === 'join' && typeof data.nickname === 'string') {
        p.nickname = data.nickname.slice(0, 15);
      }
      if (data.type === 'move') {
        p.x = data.x;
        p.y = data.y;
        handlePlayerMovement(p);
      }
      if (data.type === 'kick') {
        // Opcjonalnie można dodać kopnięcie na serwerze (na razie ignorujemy)
      }
    } catch (e) {
      console.error('Błąd parsowania wiadomości:', e);
    }
  });

  ws.on('close', () => {
    delete players[playerId];
  });
});

setInterval(gameTick, 1000 / TICK_RATE);

console.log(`Serwer WebSocket działa na porcie ${PORT}`);
