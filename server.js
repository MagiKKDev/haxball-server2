const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', function connection(ws) {
  console.log('Client connected');
  ws.on('message', function incoming(message) {
    console.log('received: %s', message);
  });

  ws.send('Server: Hello from Railway!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server is running on port ${PORT}`);
});
