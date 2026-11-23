import { io } from 'socket.io-client';
const API = process.env.API ?? 'http://localhost:3000';
const post = (p, t, b) => fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(b) }).then((r) => r.json());
const u = 'ws' + Date.now().toString(36);
const a = await post('/auth/login', null, { username: u + 'a', password: 'motdepasse-test', createIfMissing: true });
const b = await post('/auth/login', null, { username: u + 'b', password: 'motdepasse-test', createIfMissing: true });
const sock = io(API, { auth: { token: a.token }, transports: ['websocket'] });
const got = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('aucun événement reçu')), 5000);
  sock.on('message.new', (p) => { clearTimeout(t); resolve(p); });
});
await new Promise((r) => sock.on('connect', r));
await post('/messages', b.token, { to: u + 'a', kind: 'TEXT', body: 'bonjour' });
const payload = await got;
console.log('WebSocket OK, événement reçu :', payload.from === u + 'b' ? 'expéditeur correct' : payload);
sock.close();
