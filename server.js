const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let players = {};
let ball = {
  x: 450,
  y: 300,
  speedX: 5,
  speedY: 2,
  radius: 20
};

let scores = {
  left: 0,
  right: 0
};

function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

function updateBall() {
  ball.x += ball.speedX;
  ball.y += ball.speedY;

  // Odbicie od góry i dołu
  if (ball.y - ball.radius < 0 || ball.y + ball.radius > 600) {
    ball.speedY = -ball.speedY;
  }

  // Sprawdź bramki
  const goalTop = (600 - 120) / 2;
  const goalBottom = goalTop + 120;

  // Lewa bramka
  if (ball.x - ball.radius < 10 && ball.y > goalTop && ball.y < goalBottom) {
    scores.right++;
    resetBall();
    return;
  }

  // Prawa bramka
  if (ball.x + ball.radius > 900 - 10 && ball.y > goalTop && ball.y < goalBottom) {
    scores.left++;
    resetBall();
    return;
  }

  // Odbicie od bocznych ścian poza bramkami
  if ((ball.x - ball.radius < 0 && (ball.y < goalTop || ball.y > goalBottom)) ||
      (ball.x + ball.radius > 900 && (ball.y < goalTop || ball.y > goalBottom))) {
    ball.speedX = -ball.speedX;
  }
}

function resetBall() {
  ball.x = 450;
  ball.y = 300;
  // Startujemy piłkę w losową stronę
  ball.speedX = Math.random() < 0.5 ? 5 : -5;
  ball.speedY = (Math.random() * 4) - 2;
}

function updatePlayers() {
  const PLAYER_SPEED = 7;
  for (const id in players) {
    const p = players[id];
    if (!p.keys) continue;
    if (p.keys.up) p.y -= PLAYER_SPEED;
    if (p.keys.down) p.y += PLAYER_SPEED;
    if (p.keys.left) p.x -= PLAYER_SPEED;
    if (p.keys.right) p.x += PLAYER_SPEED;

    // Ogranicz ruch do boiska
    p.x = Math.max(p.radius, Math.min(900 - p.radius, p.x));
    p.y = Math.max(p.radius, Math.min(600 - p.radius, p.y));
  }
}

function handleCollisions() {
  // Prosta kolizja piłki z graczem (odbicie)
  for (const id in players) {
    const p = players[id];
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < ball.radius + p.radius) {
      // Prosty odbicie piłki od gracza
      const angle = Math.atan2(dy, dx);
      const speed = Math.sqrt(ball.speedX*ball.speedX + ball.speedY*ball.speedY);
      ball.speedX = speed * Math.cos(angle);
      ball.speedY = speed * Math.sin(angle);

      // Przyspiesz piłkę trochę
      ball.speedX *= 1.1;
      ball.speedY *= 1.1;

      // Przesuń piłkę żeby nie wpadła w gracza
      ball.x = p.x + (ball.radius + p.radius) * Math.cos(angle);
      ball.y = p.y + (ball.radius + p.radius) * Math.sin(angle);
    }
  }
}

wss.on('connection', ws => {
  const id = Date.now().toString() + Math.random().toString(36).substr(2,5);
  players[id] = { x: 100, y: 300, radius: 25, id, nick: 'Anon', keys: {} };

  ws.send(JSON.stringify({ type: 'id', id }));

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'keys' && players[id]) {
        players[id].keys = data.keys;
      }

      if (data.type === 'setNick' && players[id]) {
        players[id].nick = data.nick.substring(0, 15); // max 15 znaków
      }

    } catch (e) {
      console.error('Error parsing message', e);
    }
  });

  ws.on('close', () => {
    delete players[id];
  });
});

setInterval(() => {
  updatePlayers();
  updateBall();
  handleCollisions();

  broadcast({ type: 'update', players, ball, scores });
}, 1000 / 60);

console.log('Server running on ws://localhost:8080');
