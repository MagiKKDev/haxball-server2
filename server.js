const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8080 });
const FIELD_WIDTH = 1800;
const FIELD_HEIGHT = 1000;
const PLAYER_RADIUS = 20;
const BALL_RADIUS = 12;
const KICK_STRENGTH = 6;

let players = {};
let ball = { x: FIELD_WIDTH/2, y: FIELD_HEIGHT/2, vx: 0, vy: 0, radius: BALL_RADIUS };
let score = { left: 0, right: 0 };

wss.on("connection", ws => {
  const id = Date.now().toString();
  const spawnX = Math.random() > 0.5 ? 200 : FIELD_WIDTH - 200;
  players[id] = {
    x: spawnX,
    y: FIELD_HEIGHT / 2,
    vx: 0,
    vy: 0,
    nick: "anon",
    radius: PLAYER_RADIUS,
    keys: {}
  };

  ws.send(JSON.stringify({ type: "id", id }));

  ws.on("message", msg => {
    const data = JSON.parse(msg);
    if (data.type === "nick") {
      players[id].nick = data.nick.substring(0, 15);
    } else if (data.type === "move") {
      players[id].keys = data.keys;
    } else if (data.type === "kick") {
      const p = players[id];
      const dx = ball.x - p.x;
      const dy = ball.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < p.radius + ball.radius + 10) {
        ball.vx += (dx / dist) * KICK_STRENGTH;
        ball.vy += (dy / dist) * KICK_STRENGTH;
      }
    }
  });

  ws.on("close", () => {
    delete players[id];
  });
});

setInterval(() => {
  for (const id in players) {
    const p = players[id];
    const speed = 5;
    if (p.keys.w) p.y -= speed;
    if (p.keys.s) p.y += speed;
    if (p.keys.a) p.x -= speed;
    if (p.keys.d) p.x += speed;

    p.x = Math.max(p.radius, Math.min(FIELD_WIDTH - p.radius, p.x));
    p.y = Math.max(p.radius, Math.min(FIELD_HEIGHT - p.radius, p.y));

    // Kolizja z piłką
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < p.radius + ball.radius) {
      const overlap = p.radius + ball.radius - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      ball.x += nx * overlap;
      ball.y += ny * overlap;
      ball.vx += nx * 0.5;
      ball.vy += ny * 0.5;
    }
  }

  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.vx *= 0.99;
  ball.vy *= 0.99;

  if (ball.y < ball.radius || ball.y > FIELD_HEIGHT - ball.radius) ball.vy *= -1;
  if (ball.x < 0) {
    score.right++;
    resetBall();
  } else if (ball.x > FIELD_WIDTH) {
    score.left++;
    resetBall();
  }

  const state = {
    type: "state",
    players,
    ball,
    score
  };

  const json = JSON.stringify(state);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(json);
  });

}, 1000 / 60);

function resetBall() {
  ball.x = FIELD_WIDTH / 2;
  ball.y = FIELD_HEIGHT / 2;
  ball.vx = 0;
  ball.vy = 0;
}
