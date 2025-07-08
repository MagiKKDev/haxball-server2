const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

const FIELD_WIDTH = 900;
const FIELD_HEIGHT = 500;
const PLAYER_RADIUS = 20;
const BALL_RADIUS = 12;
const GOAL_WIDTH = 10;
const GOAL_HEIGHT = 150;
const GOAL_Y = (FIELD_HEIGHT - GOAL_HEIGHT) / 2;

const TICK_RATE = 20; // 50 ms

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
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function resetBall() {
  ball.x = FIELD_WIDTH / 2;
  ball.y = FIELD_HEIGHT / 2;
  ball.vx = 0;
  ball.vy = 0;
}

function broadcast(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

function updateBall() {
  ball.x += ball.vx;
  ball.y += ball.vy;

  ball.vx *= 0.98;
  ball.vy *= 0.98;

  // Odbicia od ścianek
  if (ball.x < BALL_RADIUS) {
    // Sprawdź bramkę po lewej
    if (ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_HEIGHT) {
      score.right++;
      broadcast({ type: "goal", score });
      resetBall();
      return;
    }
    ball.vx = -ball.vx;
    ball.x = BALL_RADIUS;
  }

  if (ball.x > FIELD_WIDTH - BALL_RADIUS) {
    // Sprawdź bramkę po prawej
    if (ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_HEIGHT) {
      score.left++;
      broadcast({ type: "goal", score });
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
  // Zapewnij, że zawodnik jest w granicach boiska
  player.x = Math.min(FIELD_WIDTH - PLAYER_RADIUS, Math.max(PLAYER_RADIUS, player.x));
  player.y = Math.min(FIELD_HEIGHT - PLAYER_RADIUS, Math.max(PLAYER_RADIUS, player.y));
}

function gameTick() {
  updateBall();

  // Wykrywanie kolizji piłki z zawodnikami i kopnięcie piłki
  for (const id in players) {
    const p = players[id];
    const dist = distance(p, ball);
    if (dist < PLAYER_RADIUS + BALL_RADIUS) {
      // Odbicie piłki
      const angle = Math.atan2(ball.y - p.y, ball.x - p.x);
      // Dodaj prędkość piłki na podstawie ruchu gracza (proste przybliżenie)
      ball.vx = Math.cos(angle) * 7;
      ball.vy = Math.sin(angle) * 7;
      // Przy okazji przesuń piłkę trochę, żeby nie wpadła w zawodnika
      ball.x = p.x + (PLAYER_RADIUS + BALL_RADIUS + 1) * Math.cos(angle);
      ball.y = p.y + (PLAYER_RADIUS + BALL_RADIUS + 1) * Math.sin(angle);
    }
  }

  // Wysyłaj stan do wszystkich graczy
  broadcast({
    type: "state",
    players: Object.fromEntries(Object.entries(players).map(([id, p]) => [id, { x: p.x, y: p.y, nickname: p.nickname }])),
    ball,
    score,
  });
}

wss.on('connection', (ws) => {
  const playerId = playerIdCounter++;
  players[playerId] = {
    x: playerId === 1 ? 100 : FIELD_WIDTH - 100,
    y: FIELD_HEIGHT / 2,
    nickname: "Anon",
    ws,
  };

  console.log(`Gracz #${playerId} połączony`);

  // Wysłanie początkowego stanu
  ws.send(JSON.stringify({
    type: "init",
    id: playerId,
    players: Object.fromEntries(Object.entries(players).map(([id, p]) => [id, { x: p.x, y: p.y, nickname: p.nickname }])),
    ball,
    score,
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === "join" && typeof data.nickname === "string") {
        players[playerId].nickname = data.nickname.slice(0, 15);
      }
      if (data.type === "move") {
        const p = players[playerId];
        if (p) {
          p.x = data.x;
          p.y = data.y;
          handlePlayerMovement(p);
        }
      }
      if (data.type === "goal") {
        // Opcjonalnie obsługa gola (np. potwierdzenie)
      }
    } catch (e) {
      console.error("Błąd parsowania wiadomości", e);
    }
  });

  ws.on('close', () => {
    console.log(`Gracz #${playerId} rozłączony`);
    delete players[playerId];
  });
});

setInterval(gameTick, 1000 / TICK_RATE);

console.log("Serwer WebSocket działa na porcie 8080");
