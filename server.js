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

  // naturalne tłumienie prędkości (opór)
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

  // bramka po lewej
  if (ball.x < ball.radius) {
    score.right++;
    resetBall();
  }

  // bramka po prawej
  if (ball.x > FIELD_WIDTH - ball.radius) {
    score.left++;
    resetBall();
  }

  // kolizja z graczami - odbijanie piłki
  for (const id in players) {
    const p = players[id];
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = ball.radius + p.radius;

    if (dist < minDist) {
      // normalizacja wektora odbicia
      const nx = dx / dist;
      const ny = dy / dist;

      // ustalenie pozycji piłki tak, by się nie nakładała
      ball.x = p.x + nx * minDist;
      ball.y = p.y + ny * minDist;

      // siła odbicia - dostosuj jeśli trzeba
      const force = 4;
      ball.speedX += nx * force;
      ball.speedY += ny * force;
    }
  }
}

wss.on('connection', ws => {
  const id = Date.now().toString() + Math.random().toString(36).substring(2, 8);
  players[id] = { x: 100, y: FIELD_HEIGHT / 2, radius: 20, nick: 'Anon' };

  ws.send(JSON.stringify({ type: 'id', id }));

  ws.on('message', msg => {
    const data = JSON.parse(msg);

    if (data.type === 'move') {
      // ograniczamy ruch w granicach boiska
      players[id].x = Math.max(players[id].radius, Math.min(FIELD_WIDTH - players[id].radius, data.x));
      players[id].y = Math.max(players[id].radius, Math.min(FIELD_HEIGHT - players[id].radius, data.y));
    }

    if (data.type === 'nick') {
      players[id].nick = data.nick || 'Anon';
    }

    if (data.type === 'kick') {
      const dx = ball.x - players[id].x;
      const dy = ball.y - players[id].y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // piłka blisko, gracz kopie
      if (dist < ball.radius + players[id].radius + 10) {
        const force = 7;
        ball.speedX += (dx / dist) * force;
        ball.speedY += (dy / dist) * force;
      }
    }
  });

  ws.on('close', () => {
    delete players[id];
  });
});

// Główna pętla aktualizująca stan piłki i wysyłająca aktualizacje do klientów
setInterval(() => {
  updateBall();
  broadcast({ type: 'update', players, ball, score });
}, 1000 / 60);

console.log('Serwer WebSocket działa na ws://localhost:8080');
