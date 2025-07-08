const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const FIELD_WIDTH = 1600;
const FIELD_HEIGHT = 900;

let players = {};
let ball = {
  x: FIELD_WIDTH / 2,
  y: FIELD_HEIGHT / 2,
  radius: 15,
  speedX: 0,
  speedY: 0
};
let score = { left: 0, right: 0 };

function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

function resetBall() {
  ball.x = FIELD_WIDTH / 2;
  ball.y = FIELD_HEIGHT / 2;
  ball.speedX = 0;
  ball.speedY = 0;
}

function updateBall() {
  ball.x += ball.speedX;
  ball.y += ball.speedY;

  // opór powietrza / tłumienie prędkości
  ball.speedX *= 0.98;
  ball.speedY *= 0.98;

  // odbicie od góry i dołu boiska
  if (ball.y < ball.radius) {
    ball.y = ball.radius;
    ball.speedY = -ball.speedY;
  }
  if (ball.y > FIELD_HEIGHT - ball.radius) {
    ball.y = FIELD_HEIGHT - ball.radius;
    ball.speedY = -ball.speedY;
  }

  // bramki (lewa i prawa)
  if (ball.x < ball.radius) {
    score.right++;
    resetBall();
  }
  if (ball.x > FIELD_WIDTH - ball.radius) {
    score.left++;
    resetBall();
  }

  // kolizja piłki z graczami (odbicie)
  for (const id in players) {
    const p = players[id];
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = ball.radius + p.radius;

    if (dist < minDist) {
      // odbicie piłki
      const nx = dx / dist;
      const ny = dy / dist;

      // popraw pozycję piłki, żeby się nie wbiła w gracza
      ball.x = p.x + nx * minDist;
      ball.y = p.y + ny * minDist;

      // delikatne odbicie od piłki (lekka siła)
      const force = 3;
      ball.speedX += nx * force;
      ball.speedY += ny * force;
    }
  }
}

function resolvePlayerCollision(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = p1.radius + p2.radius;

  if (dist < minDist && dist > 0) {
    // przesuwamy graczy, żeby się nie nakładali
    const overlap = minDist - dist;
    const nx = dx / dist;
    const ny = dy / dist;

    // przesuwamy połowę odległości każdego gracza w przeciwną stronę
    p1.x -= nx * overlap / 2;
    p1.y -= ny * overlap / 2;
    p2.x += nx * overlap / 2;
    p2.y += ny * overlap / 2;

    // Ograniczamy pozycje w obrębie boiska
    p1.x = Math.max(p1.radius, Math.min(FIELD_WIDTH - p1.radius, p1.x));
    p1.y = Math.max(p1.radius, Math.min(FIELD_HEIGHT - p1.radius, p1.y));
    p2.x = Math.max(p2.radius, Math.min(FIELD_WIDTH - p2.radius, p2.x));
    p2.y = Math.max(p2.radius, Math.min(FIELD_HEIGHT - p2.radius, p2.y));
  }
}

wss.on('connection', ws => {
  const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
  players[id] = { x: 100, y: FIELD_HEIGHT / 2, radius: 20, nick: 'Anon' };

  ws.send(JSON.stringify({ type: 'id', id }));

  ws.on('message', msg => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    if (data.type === 'move') {
      // aktualizuj pozycję gracza, ogranicz w granicach boiska
      players[id].x = Math.max(players[id].radius, Math.min(FIELD_WIDTH - players[id].radius, data.x));
      players[id].y = Math.max(players[id].radius, Math.min(FIELD_HEIGHT - players[id].radius, data.y));
    }

    if (data.type === 'nick') {
      players[id].nick = data.nick ? data.nick.substring(0, 15) : 'Anon';
    }

    if (data.type === 'kick') {
      // jeśli piłka blisko, kopnij mocniej piłkę
      const dx = ball.x - players[id].x;
      const dy = ball.y - players[id].y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < ball.radius + players[id].radius + 10) {
        const force = 10;
        ball.speedX += (dx / dist) * force;
        ball.speedY += (dy / dist) * force;
      }
    }
  });

  ws.on('close', () => {
    delete players[id];
  });
});

// Główna pętla aktualizująca stan i wysyłająca do klientów
setInterval(() => {
  updateBall();

  // rozwiązanie kolizji gracz - gracz
  const playerIds = Object.keys(players);
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      resolvePlayerCollision(players[playerIds[i]], players[playerIds[j]]);
    }
  }

  broadcast({ type: 'update', players, ball, score });
}, 1000 / 60);

console.log('Serwer WebSocket działa na ws://localhost:8080');
