const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

const FIELD_WIDTH = 1000;
const FIELD_HEIGHT = 600;

let players = {};
let ball = {
  x: FIELD_WIDTH / 2,
  y: FIELD_HEIGHT / 2,
  radius: 15,
  vx: 0,
  vy: 0,
};

let score = { left: 0, right: 0 };

function randomId() {
  return Math.random().toString(36).substr(2, 9);
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

function resetPlayerPosition(player) {
  // Losuj miejsce w strefie swojego pola
  if (player.side === 'left') {
    player.x = 200 + Math.random() * 100;
  } else {
    player.x = FIELD_WIDTH - 200 - Math.random() * 100;
  }
  player.y = FIELD_HEIGHT / 2;
}

function updatePhysics() {
  // Update piłki
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Tarcie
  ball.vx *= 0.95;
  ball.vy *= 0.95;

  // Odbicia od góry i dołu
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.vy = -ball.vy * 0.7;
  }
  if (ball.y + ball.radius > FIELD_HEIGHT) {
    ball.y = FIELD_HEIGHT - ball.radius;
    ball.vy = -ball.vy * 0.7;
  }

  // Bramki
  const goalTop = FIELD_HEIGHT / 2 - 100;
  const goalBottom = FIELD_HEIGHT / 2 + 100;

  if (ball.x - ball.radius < 10 && ball.y > goalTop && ball.y < goalBottom) {
    score.right++;
    resetBall();
    for (const id in players) resetPlayerPosition(players[id]);
  }

  if (ball.x + ball.radius > FIELD_WIDTH - 10 && ball.y > goalTop && ball.y < goalBottom) {
    score.left++;
    resetBall();
    for (const id in players) resetPlayerPosition(players[id]);
  }

  // Kolizje piłki z graczami
  for (const id in players) {
    const p = players[id];
    const dist = distance(ball.x, ball.y, p.x, p.y);
    if (dist < ball.radius + p.radius) {
      // Uderzenie piłki
      const angle = Math.atan2(ball.y - p.y, ball.x - p.x);
      const speed = 15;
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;

      // Przesuń piłkę na zewnątrz kolizji
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
  // Ustawiamy stronę (pierwszy to left, drugi right)
  const leftCount = Object.values(players).filter(p => p.side === 'left').length;
  const rightCount = Object.values(players).filter(p => p.side === 'right').length;
  let side = 'left';
  if (leftCount > rightCount) side = 'right';

  players[id] = {
    id,
    nick: 'Anon',
    x: 0,
    y: 0,
    radius: 25,
    side,
  };
  resetPlayerPosition(players[id]);

  ws.send(JSON.stringify({ type: 'id', id }));

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === 'nick' && typeof data.nick === 'string') {
        players[id].nick = data.nick.substring(0, 15);
        resetPlayerPosition(players[id]); // reset pozycji po nicku
      } else if (data.type === 'move' && typeof data.x === 'number' && typeof data.y === 'number') {
        // Ogranicz ruch do boiska
        players[id].x = Math.min(Math.max(data.x, players[id].radius), FIELD_WIDTH - players[id].radius);
        players[id].y = Math.min(Math.max(data.y, players[id].radius), FIELD_HEIGHT - players[id].radius);
      } else if (data.type === 'kick') {
        const p = players[id];
        const dist = distance(ball.x, ball.y, p.x, p.y);
        if (dist < ball.radius + p.radius + 10) {
          const angle = Math.atan2(ball.y - p.y, ball.x - p.x);
          const kickSpeed = 20;
          ball.vx = Math.cos(angle) * kickSpeed;
          ball.vy = Math.sin(angle) * kickSpeed;
        }
      }
    } catch (e) {
      console.error('Błąd parsowania:', e);
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

console.log('Serwer działa na porcie 8080');
