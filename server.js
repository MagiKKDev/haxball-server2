const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 8080;
let players = [];

app.use(express.static(path.join(__dirname)));

wss.on("connection", (ws) => {
  const player = {
    id: Date.now(),
    x: 100 + Math.random() * 400,
    y: 100 + Math.random() * 300,
    vx: 0,
    vy: 0,
    nick: "Anon"
  };

  players.push({ ws, data: player });

  ws.on("message", (msg) => {
    const parsed = JSON.parse(msg);
    if (parsed.type === "move") {
      player.vx = parsed.vx;
      player.vy = parsed.vy;
    } else if (parsed.type === "nick") {
      player.nick = parsed.nick || "Anon";
    }
  });

  ws.on("close", () => {
    players = players.filter(p => p.ws !== ws);
  });
});

let ball = {
  x: 400,
  y: 300,
  vx: 0,
  vy: 0
};

setInterval(() => {
  for (let p of players) {
    const d = p.data;
    d.x += d.vx;
    d.y += d.vy;

    // Ograniczenia boiska
    d.x = Math.max(10, Math.min(790, d.x));
    d.y = Math.max(10, Math.min(590, d.y));

    // Kolizja z piłką
    const dx = ball.x - d.x;
    const dy = ball.y - d.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 20) {
      const angle = Math.atan2(dy, dx);
      ball.vx += Math.cos(angle) * 1.5;
      ball.vy += Math.sin(angle) * 1.5;
    }
  }

  // Ruch piłki
  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.vx *= 0.99;
  ball.vy *= 0.99;

  // Odbicie od ścian
  if (ball.x < 10 || ball.x > 790) ball.vx *= -1;
  if (ball.y < 10 || ball.y > 590) ball.vy *= -1;

  const state = {
    players: players.map(p => p.data),
    ball
  };

  const json = JSON.stringify(state);
  players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(json);
    }
  });
}, 16);

server.listen(PORT, () => {
  console.log(`✅ Serwer działa na http://localhost:${PORT}`);
});
