const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

const FIELD_WIDTH = 1200;
const FIELD_HEIGHT = 800;

let players = {};
let ball = {
  x: FIELD_WIDTH / 2,
  y: FIELD_HEIGHT / 2,
  radius: 12,
  speedX: 0,
  speedY: 0,
  maxSpeed: 15,
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

  // Limit prędkości piłki
  if (ball.speedX > ball.maxSpeed) ball.speedX = ball.maxSpeed;
  if (ball.speedX < -ball.maxSpeed) ball.speedX = -ball.maxSpeed;
  if (ball.speedY > ball.maxSpeed) ball.speedY = ball.maxSpeed;
  if (ball.speedY < -ball.maxSpeed) ball.speedY = -ball.maxSpeed;

  // Friction
  ball.speedX *= 0.95;
  ball.speedY *= 0.95;

  // Odbicie od góry i dołu
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.speedY = -ball.speedY;
  }
  if (ball.y + ball.radius > FIELD_HEIGHT) {
    ball.y = FIELD_HEIGHT - ball.radius;
    ball.speedY = -ball.speedY;
  }

  // Bramka lewa
  if (ball.x - ball.radius < 0) {
    score.right++;
    resetBall();
  }

  // Bramka prawa
  if (ball.x + ball.radius > FIELD_WIDTH) {
    score.left++;
    resetBall();
  }
}

wss.on('connection', ws => {
  const id = Date.now().toString();
  players[id] = {
    x: 100,
    y: FIELD_HEIGHT / 2,
    radius: 15,
    id,
    nick: 'anon',
  };

  ws.send(JSON.stringify({ type: 'id', id }));
  console.log('Player connected:', id);

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'move' && players[id]) {
        // Limit ruchu gracza do boiska
        players[id].x = Math.min(FIELD_WIDTH - 15, Math.max(15, data.x));
        players[id].y = Math.min(FIELD_HEIGHT - 15, Math.max(15, data.y));
      } else if (data.type === 'kick' && players[id]) {
        const dx = ball.x - players[id].x;
        const dy = ball.y - players[id].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 25) {
          let forceMultiplier = data.strong ? 0.6 : 0.3; // mocniejszy kick pod spacją
          ball.speedX = dx * forceMultiplier;
          ball.speedY = dy * forceMultiplier;

          // Limit prędkości piłki
          if (ball.speedX > ball.maxSpeed) ball.speedX = ball.maxSpeed;
          if (ball.speedX < -ball.maxSpeed) ball.speedX = -ball.maxSpeed;
          if (ball.speedY > ball.maxSpeed) ball.speedY = ball.maxSpeed;
          if (ball.speedY < -ball.maxSpeed) ball.speedY = -ball.maxSpeed;
        }
      } else if (data.type === 'nick') {
        players[id].nick = data.nick || 'anon';
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
