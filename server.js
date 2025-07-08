const WebSocket = require('ws');

const w = 2000, h = 1200;
const pR = 22, bR = 18, maxB = 16, friction = 0.95;
const srv = new WebSocket.Server({ port: 8080 });

let players = {}, ball = { x: w/2, y: h/2, vx:0, vy:0, r:bR }, score = {L:0,R:0};

function randId() { return Math.random().toString(36).substr(2,9); }
function broadcast() { srv.clients.forEach(c => c.readyState===1 && c.send(JSON.stringify({players,ball,score}))); }
function clamp(v,m,M){return v<m?m:v>M?M:v;}

function step() {
  // Update ball
  ball.x += ball.vx; ball.y += ball.vy;
  ball.vx *= friction; ball.vy *= friction;
  ball.x = clamp(ball.x, ball.r, w-ball.r);
  ball.y = clamp(ball.y, ball.r, h-ball.r);

  // Edge bounce
  if (ball.x===ball.r||ball.x===w-ball.r) ball.vx = -ball.vx;
  if (ball.y===ball.r||ball.y===h-ball.r) ball.vy = -ball.vy;

  // Goals
  if (ball.x<=ball.r && ball.y>h/2-150 && ball.y<h/2+150) { score.R++; resetBall(); }
  if (ball.x>=w-ball.r && ball.y>h/2-150 && ball.y<h/2+150) { score.L++; resetBall(); }

  // Player collisions
  Object.values(players).forEach(p => {
    let dx=ball.x-p.x, dy=ball.y-p.y;
    let d=Math.hypot(dx,dy); if (d<p.r+ball.r) {
      let nx=dx/d, ny=dy/d;
      let rel=ball.vx*nx+ball.vy*ny;
      ball.vx -= 2*rel*nx; ball.vy -= 2*rel*ny;
      ball.vx += p.vx*0.5; ball.vy += p.vy*0.5;

      ball.x = p.x + nx*(p.r+ball.r);
      ball.y = p.y + ny*(p.r+ball.r);
    }
  });

  broadcast();
}

function resetBall(){
  ball.x = w/2; ball.y = h/2;
  ball.vx = (Math.random()*2-1)*8;
  ball.vy = (Math.random()*2-1)*8;
}

srv.on('connection', ws => {
  let id=randId();
  players[id] = {id, nick:'anon', x:150, y:h/2, r:pR, vx:0, vy:0};
  ws.send(JSON.stringify({type:'id',id}));

  ws.on('message', m=> {
    let d=JSON.parse(m);
    if (d.type=='nick') players[id].nick=d.nick.substr(0,15);
    if (d.type=='move') {
      let p=players[id];
      let mv=0.8;
      p.vx = clamp(d.vx,-1,1)*mv; p.vy = clamp(d.vy,-1,1)*mv;
      p.x = clamp(p.x + p.vx, p.r, w-p.r);
      p.y = clamp(p.y + p.vy, p.r, h-p.r);
    }
    if (d.type=='kick') {
      let p=players[id];
      let dx=ball.x-p.x, dy=ball.y-p.y, dist=Math.hypot(dx,dy);
      if (dist<p.r+ball.r+10) {
        ball.vx += dx/dist*12;
        ball.vy += dy/dist*12;
      }
    }
  });

  ws.on('close', ()=> delete players[id]);
});

setInterval(step, 1000/60);
console.log('Server running on port 8080');
