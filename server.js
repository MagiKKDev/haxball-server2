const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

let players = {};
let ball = { x: 1000, y: 600, vx: 0, vy: 0, r: 15 };

function resetBall() {
  ball.x = 1000;
  ball.y = 600;
  ball.vx = 0;
  ball.vy = 0;
}

io.on("connection", (socket) => {
  console.log("Użytkownik połączony");

  socket.on("join", (nick) => {
    players[socket.id] = {
      id: socket.id,
      nick,
      x: 1000 + Math.random() * 100 - 50,
      y: 600 + Math.random() * 100 - 50,
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
  // RUCH GRACZY
  for (const id in players) {
    const p = players[id];
    let speed = 5;
    if (p.keys["w"] || p.keys["ArrowUp"]) p.vy = -speed;
    else if (p.keys["s"] || p.keys["ArrowDown"]) p.vy = speed;
    else p.vy = 0;

    if (p.keys["a"] || p.keys["ArrowLeft"]) p.vx = -speed;
    else if (p.keys["d"] || p.keys["ArrowRight"]) p.vx = speed;
    else p.vx = 0;

    if (p.keys[" "]) {
      const dx = ball.x - p.x;
      const dy = ball.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 40) {
        const force = 10;
        ball.vx += (dx / dist) * force;
        ball.vy += (dy / dist) * force;
      }
    }

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
  }

  // RUCH PIŁKI
  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.vx *= 0.98;
  ball.vy *= 0.98;

  // ODBICIA
  if (ball.x < ball.r || ball.x > 2000 - ball.r) ball.vx *= -1;
  if (ball.y < ball.r || ball.y > 1200 - ball.r) ball.vy *= -1;

  // GOL
  if (
    (ball.x < 20 && ball.y > 500 && ball.y < 700) ||
    (ball.x > 1980 && ball.y > 500 && ball.y < 700)
  ) {
    io.emit("goal");
    resetBall();
  }

  io.emit("update", { players, ball });
}, 1000 / 60);

http.listen(PORT, () => console.log(`Serwer działa na porcie ${PORT}`));
