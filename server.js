const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

const FIELD_WIDTH = 800;
const FIELD_HEIGHT = 600;

let players = {};
let ball = {
  x: FIELD_WIDTH / 2,
  y: FIELD_HEIGHT / 2,
  radius: 12,
  vx: 0,
  vy: 0,
};

let score = { left: 0, right: 0 };

function randomId() {
  return Math.random().toString(36).substring(2, 9);
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function resetBall() {
  ball.x = FIELD_WIDTH / 2;
  ball.y = FIELD_HEIGHT / 2;
  ball.vx = 0;
  ball.vy = 0;
}

function updatePhysics() {
  // Aktualizuj pozycję piłki
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Opór powietrza / tarcie - zwalnia piłkę
  ball.vx *= 0.94;
  ball.vy *= 0.94;

  // Odbicia od ścian
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.vy = -ball.vy * 0.8;
  }
  if (ball.y + ball.radius > FIELD_HEIGHT) {
    ball.y = FIELD_HEIGHT - ball.radius;
    ball.vy = -ball.vy * 0.8;
  }

  // Sprawdź bramki (po lewej i prawej)
  const goalTop = FIELD_HEIGHT / 2 - 100;
  const goalBottom = FIELD_HEIGHT / 2 + 100;

  // Lewa bramka
  if (ball.x - ball.radius < 10 && ball.y > goalTop && ball.y < goalBottom) {
    score.right++;
    resetBall();
  }

  // Prawa bramka
  if (ball.x + ball.radius > FIELD_WIDTH - 10 && ball.y > goalTop && ball.y < goalBottom) {
    score.left++;
    resetBall();
  }

  // Kolizje piłki z graczami
  for (const id in players) {
    const p = players[id];
    const dist = distance(ball.x, ball.y, p.x, p.y);
    if (dist < ball.radius + p.radius) {
      // Odbij piłkę od gracza
      const angle = Math.atan2(ball.y - p.y, ball.x - p.x);
      const speed = 8;
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;
      
      // Przesuń piłkę na krawędź kolizji, żeby nie wpadała w gracza
      const overlap = ball.radius + p.radius - dist;
      ball.x += Math.cos(angle) * overlap;
      ball.y += Math.sin(angle) * overlap;
    }
  }
}

function broadcast(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

wss.on('connection', (ws) => {
  const id = randomId();
  players[id] = {
    id,
    nick: 'Anon',
    x: Math.random() * (FIELD_WIDTH - 100) + 50,
    y: Math.random() * (FIELD_HEIGHT - 100) + 50,
    radius: 20,
  };

  ws.send(JSON.stringify({ type: 'id', id }));

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === 'nick' && typeof data.nick === 'string') {
        players[id].nick = data.nick.substring(0, 15);
      } else if (data.type === 'move' && typeof data.x === 'number' && typeof data.y === 'number') {
        // Aktualizuj pozycję gracza w polu gry (ogranicz)
        players[id].x = Math.min(Math.max(data.x, players[id].radius), FIELD_WIDTH - players[id].radius);
        players[id].y = Math.min(Math.max(data.y, players[id].radius), FIELD_HEIGHT - players[id].radius);
      } else if (data.type === 'kick') {
        // Jeśli piłka jest blisko gracza, nadaj jej prędkość w kierunku ruchu
        const p = players[id];
        const dist = distance(ball.x, ball.y, p.x, p.y);
        if (dist < ball.radius + p.radius + 10) {
          const angle = Math.atan2(ball.y - p.y, ball.x - p.x);
          const kickSpeed = 15;
          ball.vx = Math.cos(angle) * kickSpeed;
          ball.vy = Math.sin(angle) * kickSpeed;
        }
      }
    } catch (e) {
      console.error('Błąd parsowania wiadomości:', e);
    }
  });

  ws.on('close', () => {
    delete players[id];
  });
});

setInterval(() => {
  updatePhysics();

  broadcast({
    type: 'update',
    players,
    ball,
    score,
  });
}, 1000 / 30);

console.log('Serwer WebSocket działa na porcie 8080');
