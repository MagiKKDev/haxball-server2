const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let players = {};
let ball = {
  x: 450,
  y: 300,
  radius: 12,
  speedX: 0,
  speedY: 0,
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
  ball.x = 450;
  ball.y = 300;
  ball.speedX = 0;
  ball.speedY = 0;
}

function updateBall() {
  ball.x += ball.speedX;
  ball.y += ball.speedY;

  // Friction
  ball.speedX *= 0.95;
  ball.speedY *= 0.95;

  // Bounce top & bottom
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.speedY = -ball.speedY;
  }
  if (ball.y + ball.radius > 600) {
    ball.y = 600 - ball.radius;
    ball.speedY = -ball.speedY;
  }

  // Left goal
  if (ball.x - ball.radius < 0) {
    score.right++;
    resetBall();
  }

  // Right goal
  if (ball.x + ball.radius > 900) {
    score.left++;
    resetBall();
  }
}

wss.on('connection', ws => {
  const id = Date.now().toString();
  players[id] = { x: 100, y: 300, radius: 15, id, nick: 'anon' };

  ws.send(JSON.stringify({ type: 'id', id }));
  console.log('Player connected:', id);

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'move' && players[id]) {
        // Keep player inside the field
        players[id].x = Math.min(900 - players[id].radius, Math.max(players[id].radius, data.x));
        players[id].y = Math.min(600 - players[id].radius, Math.max(players[id].radius, data.y));
      } else if (data.type === 'kick' && players[id]) {
        const dx = ball.x - players[id].x;
        const dy = ball.y - players[id].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 30) {
          // Kick strength bigger with spacebar
          ball.speedX = dx * 0.5;
          ball.speedY = dy * 0.5;
        }
      } else if (data.type === 'nick' && players[id]) {
        players[id].nick = data.nick.trim().substring(0, 15) || 'anon';
      }
    } catch (e) {
      console.error('Error parsing message:', e);
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
