const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let players = {};
let ball = { x: 450, y: 300, speedX: 0, speedY: 0, radius: 12 };
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

  ball.speedX *= 0.98;
  ball.speedY *= 0.98;

  // ściany góra/dół
  if (ball.y - ball.radius < 0 || ball.y + ball.radius > 600) {
    ball.speedY *= -1;
  }

  // gole
  if (ball.x - ball.radius < 0) {
    score.right++;
    resetBall();
  } else if (ball.x + ball.radius > 900) {
    score.left++;
    resetBall();
  }
}

wss.on('connection', ws => {
  const id = Date.now().toString();
  players[id] = { x: 100, y: 300, radius: 15, id, nick: "anon" };

  ws.send(JSON.stringify({ type: 'id', id }));
  console.log('Player connected:', id);

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'move') {
        if (players[id]) {
          players[id].x = data.x;
          players[id].y = data.y;
        }
      } else if (data.type === 'kick') {
        const p = players[id];
        if (p) {
          const dx = ball.x - p.x;
          const dy = ball.y - p.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 30) {
            ball.speedX = dx * 0.3;
            ball.speedY = dy * 0.3;
          }
        }
      } else if (data.type === 'nick') {
        if (players[id]) players[id].nick = data.nick || 'anon';
      }
    } catch (e) {
      console.error('Invalid message', e);
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
