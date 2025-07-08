const WebSocket = require('ws');

const FIELD_WIDTH = 2000;
const FIELD_HEIGHT = 1200;

const wss = new WebSocket.Server({ port: 8080 });

let players = {};
let ball = {
  x: FIELD_WIDTH / 2,
  y: FIELD_HEIGHT / 2,
  speedX: 0,
  speedY: 0,
  radius: 18
};

let score = { left: 0, right: 0 };

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

  // Limit prędkości piłki
  const maxBallSpeed = 12;
  ball.speedX = Math.max(-maxBallSpeed, Math.min(maxBallSpeed, ball.speedX));
  ball.speedY = Math.max(-maxBallSpeed, Math.min(maxBallSpeed, ball.speedY));

  // Friction piłki (zwolnienie)
  ball.speedX *= 0.92;
  ball.speedY *= 0.92;

  // Odbicia od góry i dołu
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.speedY = -ball.speedY;
  } 
  if (ball.y + ball.radius > FIELD_HEIGHT) {
    ball.y = FIELD_HEIGHT - ball.radius;
    ball.speedY = -ball.speedY;
  }

  // Gole i reset piłki
  if (ball.x - ball.radius < 0) {
    score.right++;
    resetBall();
  } else if (ball.x + ball.radius > FIELD_WIDTH) {
    score.left++;
    resetBall();
  }

  // Odbicie piłki od graczy
  for (const id in players) {
    const p = players[id];
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const minDist = ball.radius + p.radius;
    if (dist < minDist) {
      // Odbicie prosty efekt - przesuwamy piłkę na krawędź i odbijamy prędkość
      const overlap = minDist - dist + 1;
      const nx = dx / dist;
      const ny = dy / dist;

      // Przesuwamy piłkę poza gracza
      ball.x += nx * overlap;
      ball.y += ny * overlap;

      // Odbijamy prędkość piłki
      const dot = ball.speedX * nx + ball.speedY * ny;
      ball.speedX -= 2 * dot * nx;
      ball.speedY -= 2 * dot * ny;

      // Dodajemy lekkie spowolnienie, by nie bugowało
      ball.speedX *= 0.85;
      ball.speedY *= 0.85;
    }
  }
}

function resetBall() {
  ball.x = FIELD_WIDTH / 2;
  ball.y = FIELD_HEIGHT / 2;
  ball.speedX = 0;
  ball.speedY = 0;
}

wss.on('connection', ws => {
  const id = Date.now().toString() + Math.random().toString(36).substr(2,5);
  players[id] = { x: 150, y: FIELD_HEIGHT / 2, radius: 22, id, nick: "anon" };

  ws.send(JSON.stringify({ type: 'id', id }));
  console.log('Player connected:', id);

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'move' && players[id]) {
        // Limit ruchu po mapie
        players[id].x = Math.min(Math.max(data.x, players[id].radius), FIELD_WIDTH - players[id].radius);
        players[id].y = Math.min(Math.max(data.y, players[id].radius), FIELD_HEIGHT - players[id].radius);
      } else if (data.type === 'kick' && players[id]) {
        const dx = ball.x - players[id].x;
        const dy = ball.y - players[id].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < players[id].radius + ball.radius + 10) {
          // Kopnięcie piłki umiarkowaną siłą (mocniejsze niż odbicie, ale nie za mocne)
          const force = 8;
          ball.speedX += dx / dist * force;
          ball.speedY += dy / dist * force;

          // Limit siły po kopnięciu (nie przesadzamy)
          const maxForce = 12;
          ball.speedX = Math.max(-maxForce, Math.min(maxForce, ball.speedX));
          ball.speedY = Math.max(-maxForce, Math.min(maxForce, ball.speedY));
        }
      } else if (data.type === 'nick' && players[id]) {
        players[id].nick = data.nick.trim().substring(0, 15) || 'anon';
      }
    } catch (e) {
      console.error('Error parsing message', e);
    }
  });

  ws.on('close', () => {
    delete players[id];
    console.log('Player disconnected:', id);
  });
});

setInterval(() => {
  updateBall();
  broadcast({ type: 'update', players, ball, score });
}, 1000 / 60);

console.log('Server running on ws://localhost:8080');
