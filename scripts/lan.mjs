// Serves the dev app on friendly hostnames, without a port:
//   http://slack.localhost   on this Mac (browsers resolve *.localhost to themselves)
//   http://slack.local       from any device on the same Wi-Fi (announced with Bonjour/mDNS)
// A small reverse proxy on :80 forwards to the Next dev server (PORT, default 3002),
// including the realtime stream (SSE) and hot reload (WebSocket).
//   node scripts/lan.mjs            (or: make lan, with `make dev` running)
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import { spawn } from 'node:child_process';

const TARGET = Number(process.env.PORT ?? 3002);
const LISTEN = Number(process.env.LAN_PORT ?? 80);
const NAME = process.env.LAN_NAME ?? 'slack';

const lanIp = () =>
  Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;

const proxy = http.createServer((req, res) => {
  const up = http.request(
    { host: '127.0.0.1', port: TARGET, method: req.method, path: req.url, headers: req.headers },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    },
  );
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`The app isn't running on port ${TARGET}. Start it with: make dev`);
  });
  req.pipe(up);
});

// WebSocket upgrades (Next hot reload): splice the raw sockets together.
proxy.on('upgrade', (req, socket, head) => {
  const up = net.connect(TARGET, '127.0.0.1', () => {
    up.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    for (let i = 0; i < req.rawHeaders.length; i += 2) up.write(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`);
    up.write('\r\n');
    if (head?.length) up.write(head);
    up.pipe(socket).pipe(up);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

proxy.listen(LISTEN, () => {
  const ip = lanIp();
  const suffix = LISTEN === 80 ? '' : `:${LISTEN}`;
  console.log(`▸ This Mac       http://${NAME}.localhost${suffix}`);
  if (!ip) {
    console.log('  No Wi-Fi/LAN address found: only the .localhost name works.');
    return;
  }
  console.log(`▸ Same Wi-Fi     http://${NAME}.local${suffix}   (or http://${ip}${suffix})`);
  // Announce NAME.local → this Mac's LAN address while the script runs.
  const mdns = spawn('dns-sd', ['-P', 'Team Chat', '_http._tcp', 'local', String(LISTEN), `${NAME}.local`, ip], { stdio: 'ignore' });
  const stop = () => { mdns.kill(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
});

proxy.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${LISTEN} is already in use.` : e.message);
  process.exit(1);
});
