const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let players = {};
let ball = {
  x: 600,
  y: 350,
  speedX: 0,
  speedY: 0,
  radius: 12
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

  ball.speedX *= 0.98;
  ball.speedY *= 0.98;

  if (ball.y - ball.radius < 0 || ball.y + ball.radius > 700) {
    ball.speedY = -ball.speedY;
  }

  if (ball.x - ball.radius < 0) {
    score.right++;
    resetBall();
  } else if (ball.x + ball.radius > 1200) {
    score.left++;
    resetBall();
  }
}

function resetBall() {
  ball.x = 600;
  ball.y = 350;
  ball.speedX = 0;
  ball.speedY = 0;
}

wss.on('connection', ws => {
  const id = Date.now().toString();
  players[id] = { x: 100, y: 350, radius: 15, id, nick: "anon" };

  ws.send(JSON.stringify({ type: 'id', id }));
  console.log('Player connected:', id);

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'move' && players[id]) {
        players[id].x = data.x;
        players[id].y = data.y;
      } else if (data.type === 'kick' && players[id]) {
        const dx = ball.x - players[id].x;
        const dy = ball.y - players[id].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 25) {
          ball.speedX = dx * 0.35;
          ball.speedY = dy * 0.35;
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
