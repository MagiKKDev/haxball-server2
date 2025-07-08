const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 8080;
const server = http.createServer((req, res) => {
  const filePath = req.url === '/' ? '/index.html' : req.url;
  const fullPath = path.join(__dirname, 'public', filePath);

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }

    const ext = path.extname(fullPath);
    const contentType = ext === '.js' ? 'text/javascript' : 'text/html';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

const rooms = {};

function generateRoomId(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < length; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

wss.on('connection', ws => {
  let playerId = crypto.randomUUID();
  let currentRoom = null;

  ws.on('message', message => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    if (data.type === 'create') {
      const roomId = generateRoomId();
      currentRoom = roomId;
      rooms[roomId] = {
        players: {},
        ball: { x: 450, y: 300, vx: 0, vy: 0, radius: 15 }
      };
      rooms[roomId].players[playerId] = { id: playerId, name: data.nick, x: 150, y: 300, radius: 25 };
      ws.send(JSON.stringify({ type: 'created', roomId, playerId }));
    }

    if (data.type === 'join') {
      const roomId = data.roomId.toUpperCase();
      if (!rooms[roomId]) {
        return ws.send(JSON.stringify({ type: 'error', message: 'Pokój nie istnieje' }));
      }
      currentRoom = roomId;
      rooms[roomId].players[playerId] = { id: playerId, name: data.nick, x: 750, y: 300, radius: 25 };
      ws.send(JSON.stringify({ type: 'joined', roomId, playerId }));
    }

    if (data.type === 'move' && currentRoom && rooms[currentRoom]?.players[playerId]) {
      const player = rooms[currentRoom].players[playerId];
      player.x = data.x;
      player.y = data.y;
      if (data.kick) {
        const dx = rooms[currentRoom].ball.x - player.x;
        const dy = rooms[currentRoom].ball.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < player.radius + rooms[currentRoom].ball.radius + 5) {
          rooms[currentRoom].ball.vx += dx * 0.05 * data.kickPower;
          rooms[currentRoom].ball.vy += dy * 0.05 * data.kickPower;
        }
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms[currentRoom]) {
      delete rooms[currentRoom].players[playerId];
      if (Object.keys(rooms[currentRoom].players).length === 0) {
        delete rooms[currentRoom];
      }
    }
  });
});

setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    const ball = room.ball;

    ball.x += ball.vx;
    ball.y += ball.vy;

    ball.vx *= 0.98;
    ball.vy *= 0.98;

    if (ball.x < 0 || ball.x > 900) ball.vx *= -1;
    if (ball.y < 0 || ball.y > 600) ball.vy *= -1;

    const data = {
      type: 'update',
      players: Object.values(room.players),
      ball: room.ball
    };

    for (const pid in room.players) {
      const player = room.players[pid];
      if (player?.ws && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(JSON.stringify(data));
      }
    }
  }
}, 1000 / 60);

server.listen(PORT, '188.116.40.194', () => {
  console.log(`Serwer działa na http://188.116.40.194:${PORT}`);
});
