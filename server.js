const WebSocket = require('ws');

const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

let players = {};
let ball = {
  x: 450,
  y: 300,
  speedX: 5,
  speedY: 2,
  radius: 20
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

  if (ball.y - ball.radius < 0 || ball.y + ball.radius > 600) {
    ball.speedY = -ball.speedY;
  }
  if (ball.x - ball.radius < 0 || ball.x + ball.radius > 900) {
    ball.speedX = -ball.speedX;
  }
}

wss.on('connection', ws => {
  const id = Date.now().toString();
  players[id] = { x: 100, y: 300, radius: 25, id };

  ws.send(JSON.stringify({ type: 'id', id }));

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'move' && players[id]) {
        players[id].x = data.x;
        players[id].y = data.y;
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
  updateBall();
  broadcast({ type: 'update', players, ball });
}, 1000 / 60);

console.log(`Server running on port ${port}`);