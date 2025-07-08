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
  // Gracze respawn na swoich połowach
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

function collideCircles(a, b) {
  const dist = distance(a, b);
  return dist < a.radius + b.radius;
}

function updatePhysics() {
  // Aktualizacja pozycji piłki
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Tłumienie prędkości piłki (friction)
  ball.vx *= 0.95;
  ball.vy *= 0.95;

  // Odbicia od ścian boiska (poza bramkami)
  if (ball.y < ball.radius) {
    ball.y = ball.radius;
    ball.vy = -ball.vy;
  }
  if (ball.y > FIELD_HEIGHT - ball.radius) {
    ball.y = FIELD_HEIGHT - ball.radius;
    ball.vy = -ball.vy;
  }

  // Sprawdź czy jest gol — bramki są na lewej i prawej krawędzi boiska,
  // wysokość bramki: 200 px, środek pola w Y to FIELD_HEIGHT/2

  if (
    ball.x - ball.radius < 10 && 
    ball.y > FIELD_HEIGHT/2 - 100 && ball.y < FIELD_HEIGHT/2 + 100
  ) {
    // Gol dla prawej drużyny
    score.right++;
    resetPositions();
  }

  if (
    ball.x + ball.radius > FIELD_WIDTH - 10 &&
    ball.y > FIELD_HEIGHT/2 - 100 && ball.y < FIELD_HEIGHT/2 + 100
  ) {
    // Gol dla lewej drużyny
    score.left++;
    resetPositions();
  }

  // Gracze aktualizacja prędkości i pozycji (odpychanie się)
  for (const player of players.values()) {
    // Zmiana pozycji na podstawie prędkości
    player.x += player.vx;
    player.y += player.vy;

    // Tłumienie prędkości gracza (friction)
    player.vx *= 0.7;
    player.vy *= 0.7;

    // Granice boiska
    player.x = Math.max(player.radius, Math.min(FIELD_WIDTH - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(FIELD_HEIGHT - player.radius, player.y));
  }

  // Odbicia piłki od graczy
  for (const player of players.values()) {
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = Math.hypot(dx, dy);
    const minDist = ball.radius + player.radius;

    if (dist < minDist) {
      // Normal wektora kolizji
      const nx = dx / dist;
      const ny = dy / dist;

      // Odbij piłkę z siłą
      const overlap = minDist - dist;

      ball.x += nx * overlap;
      ball.y += ny * overlap;

      // Prędkość piłki zmienia się lekko na podstawie ruchu gracza
      ball.vx = nx * 10 + player.vx * 0.5;
      ball.vy = ny * 10 + player.vy * 0.5;
    }
  }

  // Proste odpychanie graczy od siebie (kolizja)
  const arrPlayers = Array.from(players.values());
  for(let i=0; i < arrPlayers.length; i++) {
    for(let j=i+1; j < arrPlayers.length; j++) {
      const p1 = arrPlayers[i];
      const p2 = arrPlayers[j];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      const minDist = p1.radius + p2.radius;
      if(dist < minDist) {
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
    players: Object.fromEntries([...players].map(([id, p]) => [
      id, { x: p.x, y: p.y, radius: p.radius, nick: p.nick }
    ])),
    ball: { x: ball.x, y: ball.y, radius: ball.radius },
    score
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
      // Ogranicz do pola i prędkość max
      const dx = data.x - player.x;
      const dy = data.y - player.y;

      // Limit prędkości (max 8 px/frame)
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
      // Jeśli piłka blisko to dodaj moc do piłki
      const dx = ball.x - player.x;
      const dy = ball.y - player.y;
      const dist = Math.hypot(dx, dy);
      const kickRange = player.radius + ball.radius + 10;
      if (dist < kickRange) {
        // Kierunek kopnięcia
        const nx = dx / dist;
        const ny = dy / dist;

        // Siła kopnięcia większa niż normalne odbicie
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

setInterval(gameLoop, 1000 / 60); // 60 FPS

console.log('Server started on port 8080');
