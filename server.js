const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const players = {};
let ball = { x: 500, y: 300, vx: 0, vy: 0, radius: 10 };

io.on("connection", (socket) => {
  console.log("✅ Nowy gracz:", socket.id);

  players[socket.id] = {
    x: Math.random() * 900 + 50,
    y: Math.random() * 500 + 50,
    vx: 0,
    vy: 0,
    nick: "Anon"
  };

  socket.on("setNick", (nick) => {
    if (players[socket.id]) players[socket.id].nick = nick;
  });

  socket.on("move", (dir) => {
    const p = players[socket.id];
    if (!p) return;
    const speed = 4;
    p.vx = dir.x * speed;
    p.vy = dir.y * speed;
  });

  socket.on("kick", () => {
    const p = players[socket.id];
    if (!p) return;
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 30) {
      ball.vx += (dx / dist) * 5;
      ball.vy += (dy / dist) * 5;
    }
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
  });
});

function gameLoop() {
  ball.x += ball.vx;
  ball.y += ball.vy;

  if (ball.x < 10 || ball.x > 990) ball.vx *= -1;
  if (ball.y < 10 || ball.y > 590) ball.vy *= -1;

  ball.vx *= 0.99;
  ball.vy *= 0.99;

  for (const id in players) {
    const p = players[id];

    // Odbicie piłki
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 25) {
      const angle = Math.atan2(dy, dx);
      ball.vx += Math.cos(angle);
      ball.vy += Math.sin(angle);
    }

    // Ruch gracza
    p.x += p.vx;
    p.y += p.vy;
    p.x = Math.max(0, Math.min(1000, p.x));
    p.y = Math.max(0, Math.min(600, p.y));
  }

  io.emit("state", { players, ball });
}

setInterval(gameLoop, 1000 / 60);

server.listen(3000, () => {
  console.log("🌐 Serwer działa na http://localhost:3000");
});
