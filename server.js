const WebSocket = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};

function generateRoomId(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < length; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function createRoom() {
  let id;
  do {
    id = generateRoomId();
  } while (rooms[id]);

  rooms[id] = {
    players: {},
    ball: { x: 450, y: 300, speedX: 4, speedY: 2, radius: 18 }
  };

  return id;
}

function updateBall(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const ball = room.ball;

  ball.x += ball.speedX;
  ball.y += ball.speedY;

  if (ball.y - ball.radius < 0 || ball.y + ball.radius > 600) {
    ball.speedY *= -1;
  }
  if (ball.x - ball.radius < 0 || ball.x + ball.radius > 900) {
    ball.speedX *= -1;
  }

  // Odbijanie od gracza
  for (const pId in room.players) {
    const p = room.players[pId];
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < ball.radius + p.radius) {
      ball.speedX = -ball.speedX + dx * 0.1;
      ball.speedY = -ball.speedY + dy * 0.1;
      break;
    }
  }
}

function broadcast(roomId, data) {
  const room = rooms[roomId];
  if (!room) return;

  const json = JSON.stringify(data);
  for (const pId in room.players) {
    const p = room.players[pId];
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(json);
    }
  }
}

function getPlayers(roomId) {
  return Object.values(rooms[roomId].players).map(p => ({
    x: p.x,
    y: p.y,
    radius: p.radius,
    id: p.id,
    nickname: p.nickname
  }));
}

wss.on('connection', ws => {
  let currentRoom = null;
  let playerId = null;

  ws.on('message', msg => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Błędny JSON' }));
      return;
    }

    if (data.type === 'create') {
      const roomId = createRoom();
      currentRoom = roomId;
      playerId = crypto.randomUUID();
      rooms[roomId].players[playerId] = {
        x: 150,
        y: 300,
        radius: 25,
        nickname: data.nickname || 'Gracz',
        ws,
        id: playerId
      };

      ws.send(JSON.stringify({ type: 'created', roomId, id: playerId }));
      console.log(`Pokój ${roomId} utworzony przez ${playerId}`);

    } else if (data.type === 'join') {
      const roomId = data.roomId.toUpperCase();
      if (!rooms[roomId]) {
        ws.send(JSON.stringify({ type: 'error', message: 'Pokój nie istnieje' }));
        return;
      }

      if (Object.keys(rooms[roomId].players).length >= 4) {
        ws.send(JSON.stringify({ type: 'error', message: 'Pokój jest pełny' }));
        return;
      }

      currentRoom = roomId;
      playerId = crypto.randomUUID();
      rooms[roomId].players[playerId] = {
        x: 750,
        y: 300,
        radius: 25,
        nickname: data.nickname || 'Gracz',
        ws,
        id: playerId
      };

      ws.send(JSON.stringify({ type: 'joined', roomId, id: playerId }));
      broadcast(currentRoom, {
        type: 'update',
        players: getPlayers(currentRoom),
        ball: rooms[currentRoom].ball
      });

    } else if (data.type === 'move' && currentRoom && playerId) {
      const player = rooms[currentRoom].players[playerId];
      if (player) {
        player.x = Math.min(875, Math.max(25, data.x));
        player.y = Math.min(575, Math.max(25, data.y));
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom && playerId && rooms[currentRoom]) {
      delete rooms[currentRoom].players[playerId];
      if (Object.keys(rooms[currentRoom].players).length === 0) {
        delete rooms[currentRoom];
        console.log(`Pokój ${currentRoom} usunięty (pusty)`);
      } else {
        broadcast(currentRoom, {
          type: 'update',
          players: getPlayers(currentRoom),
          ball: rooms[currentRoom].ball
        });
      }
      console.log(`Gracz ${playerId} opuścił pokój ${currentRoom}`);
    }
  });
});

setInterval(() => {
  for (const roomId in rooms) {
    updateBall(roomId);
    broadcast(roomId, {
      type: 'update',
      players: getPlayers(roomId),
      ball: rooms[roomId].ball
    });
  }
}, 1000 / 60);

console.log(`✅ Serwer działa na ws://localhost:${PORT}`);
