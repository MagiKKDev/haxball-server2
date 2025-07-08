const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = 3000;

app.use(express.static(__dirname));

let players = {};
let ball = { x: 800, y: 450, vx: 0, vy: 0, r: 15 };

function resetBall() {
  ball.x = 800;
  ball.y = 450;
  ball.vx = 0;
  ball.vy = 0;
}

io.on("connection", (socket) => {
  socket.on("join", (nick) => {
    players[socket.id] = {
      id: socket.id,
      nick,
      x: 800 + Math.random() * 100 - 50,
      y: 450 + Math.random() * 100 - 50,
      vx: 0,
      vy: 0,
      keys: {}
    };

    socket.emit("init", { id: socket.id, players, ball });
  });

  socket.on("key", ({ key, pressed }) => {
    if (players[socket.id]) {
      players[socket.id].keys[key] = pressed;
    }
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
  });
});

setInterval(() => {
  for (const id in players) {
    const p = players[id];
    let speed = 5;
    if (p.keys["w"] || p.keys["ArrowUp"]) p.vy = -speed;
    else if (p.keys["s"] || p.keys["ArrowDown"]) p.vy = speed;
    else p.vy = 0;

    if (p.keys["a"] || p.keys["ArrowLeft"]) p.vx = -speed;
    else if (p.keys["d"] || p.keys["ArrowRight"]) p.vx = speed;
    else p.vx = 0;

    p.x += p.vx;
    p.y += p.vy;

    // Kolizja z piłką
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 40) {
      const force = 1.5;
      ball.vx += (dx / dist) * force;
      ball.vy += (dy / dist) * force;
    }

    // Strzał
    if (p.keys[" "]) {
      const dx = ball.x - p.x;
      const dy = ball.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 45) {
        const force = 8;
        ball.vx += (dx / dist) * force;
        ball.vy += (dy / dist) * force;
      }
    }
  }

  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.vx *= 0.98;
  ball.vy *= 0.98;

  // Odbicie od ścian
  if (ball.x < ball.r || ball.x > 1600 - ball.r) ball.vx *= -1;
  if (ball.y < ball.r || ball.y > 900 - ball.r) ball.vy *= -1;

  // Gole
  if (
    (ball.x < 15 && ball.y > 400 && ball.y < 500) ||
    (ball.x > 1585 && ball.y > 400 && ball.y < 500)
  ) {
    resetBall();
  }

  io.emit("update", { players, ball });
}, 1000 / 60);

server.listen(PORT, () => {
  console.log(`Serwer działa na http://localhost:${PORT}`);
});
