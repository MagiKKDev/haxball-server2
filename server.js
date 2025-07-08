const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

let players = {};
let ball = { x: 700, y: 400, vx: 0, vy: 0, r: 12 };

wss.on("connection", (ws) => {
  const id = uuidv4();
  players[id] = { x: 100, y: 100, nick: "Gracz" };

  ws.send(JSON.stringify({ type: "init", id, players, ball }));

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    if (data.type === "move") {
      if (players[id]) {
        players[id].x = data.x;
        players[id].y = data.y;
      }
    } else if (data.type === "join") {
      if (players[id]) players[id].nick = data.nick || "Gracz";
    }
  });

  ws.on("close", () => {
    delete players[id];
  });
});

// broadcast co 50ms
setInterval(() => {
  const state = JSON.stringify({ type: "state", players, ball });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(state);
    }
  });

  // aktualizacja piłki
  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.vx *= 0.99;
  ball.vy *= 0.99;

  if (ball.x < ball.r || ball.x > 1400 - ball.r) ball.vx *= -1;
  if (ball.y < ball.r || ball.y > 800 - ball.r) ball.vy *= -1;

  ball.x = Math.max(ball.r, Math.min(1400 - ball.r, ball.x));
  ball.y = Math.max(ball.r, Math.min(800 - ball.r, ball.y));
}, 50);
