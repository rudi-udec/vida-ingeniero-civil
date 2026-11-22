// Servidor online de "La vida de un Ingeniero Civil".
// Sirve la página del juego y mantiene las salas: el motor de reglas corre aquí,
// los navegadores solo envían acciones y reciben el estado.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const G = require('./engine.js');

const PORT = process.env.PORT || 3000;
const INDEX = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const BOT_NAMES = ['Bot Mechón', 'Bot Memorista', 'Bot Ayudante', 'Bot Magíster', 'Bot Carretero', 'Bot Senior'];
const IDLE_MAX_MS = 25000;   // máximo que un bot espera a que los demás terminen de ver las tarjetas
const BOT_DELAY_MS = +process.env.BOT_DELAY_MS || 2200;
const DISCONNECTED_MS = 20000; // un humano desconectado juega en automático tras este tiempo

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify({ ok: true, juego: 'vida-ic', salas: rooms.size })); }
  if (url === '/' || url === '/index.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(INDEX); }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('No encontrado');
});
const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map();

function newCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c;
  do { c = Array.from({ length: 4 }, () => L[crypto.randomInt(L.length)]).join(''); } while (rooms.has(c));
  return c;
}
const token = () => crypto.randomBytes(12).toString('hex');
const send = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
const pidOf = i => 'p' + i;
const seatOfPid = (room, pid) => room.seats[+pid.slice(1)];

function broadcast(room) {
  room.lastActive = Date.now();
  const s = room.state;
  const cur = s && s.phase !== 'end' ? s.players[s.turn] : null;
  room.seats.forEach((seat, i) => {
    if (!seat.ws) return;
    send(seat.ws, {
      t: 'room', code: room.code, host: i === 0, you: pidOf(i), timer: room.timer,
      seats: room.seats.map((x, j) => ({ name: x.name, bot: x.bot, token: x.look, connected: !!x.ws, you: j === i })),
      state: s, elapsed: room.startedAt ? Date.now() - room.startedAt : null, deadline: room.deadline || 0, deadlineIn: room.deadline ? room.deadline - Date.now() : 0,
      turnOf: cur ? cur.id : null,
    });
  });
}

function act(room, a) {
  const next = G.reduce(room.state, a);
  if (next === room.state) return false;
  room.state = next;
  schedule(room);
  broadcast(room);
  return true;
}

function allIdle(room) {
  return room.seats.every(seat => seat.bot || !seat.ws || (seat.idle || 0) >= room.state.seq);
}

function schedule(room) {
  clearTimeout(room.botT); clearTimeout(room.turnT); room.deadline = 0;
  const s = room.state; if (!s || s.phase === 'end' || !s.pending) return;
  const p = s.players[s.turn]; const seat = seatOfPid(room, p.id);
  const auto = () => { if (room.state === s) act(room, G.botAction(s)); };
  if (seat.bot) {
    room.waitSince = Date.now();
    const tryBot = () => {
      if (room.state !== s) return;
      if (allIdle(room) || Date.now() - room.waitSince > IDLE_MAX_MS) room.botT = setTimeout(auto, BOT_DELAY_MS);
      else room.botT = setTimeout(tryBot, 500);
    };
    tryBot();
    return;
  }
  const ms = !seat.ws ? DISCONNECTED_MS : room.timer ? (s.timer || 120) * 1000 : 0;
  if (ms) { room.deadline = Date.now() + ms; room.turnT = setTimeout(auto, ms); }
}

wss.on('connection', ws => {
  let room = null, seatI = -1;
  const err = (msg, fatal) => send(ws, { t: 'error', msg, fatal });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'create') {
      const name = String(m.name || '').trim().slice(0, 16) || 'Jugador';
      room = { code: newCode(), seats: [{ name, bot: false, token: token(), ws, look: 'casco' }], state: null, timer: true, lastActive: Date.now(), chat: [] };
      rooms.set(room.code, room); seatI = 0;
      send(ws, { t: 'joined', code: room.code, token: room.seats[0].token });
      return broadcast(room);
    }
    if (m.t === 'join') {
      const r = rooms.get(String(m.code || '').toUpperCase());
      if (!r) return err('No existe una sala con ese código.');
      if (r.state) return err('Esa partida ya empezó.');
      if (r.seats.length >= 6) return err('La sala está llena (máximo 6).');
      const name = String(m.name || '').trim().slice(0, 16) || 'Jugador';
      const usedL = new Set(r.seats.map(x => x.look)); r.seats.push({ name, bot: false, token: token(), ws, look: G.TOKENS.find(t => !usedL.has(t)) || 'casco' });
      room = r; seatI = r.seats.length - 1;
      send(ws, { t: 'joined', code: r.code, token: r.seats[seatI].token });
      send(ws, { t: 'chatlog', list: r.chat });
      return broadcast(r);
    }
    if (m.t === 'rejoin') {
      const r = rooms.get(String(m.code || '').toUpperCase());
      const i = r ? r.seats.findIndex(x => x.token === m.token) : -1;
      if (i < 0) return err('La sala ya no existe.', true);
      if (r.seats[i].ws && r.seats[i].ws !== ws) try { r.seats[i].ws.close(); } catch (e) {}
      r.seats[i].ws = ws; r.seats[i].idle = 0; room = r; seatI = i;
      send(ws, { t: 'joined', code: r.code, token: m.token });
      send(ws, { t: 'chatlog', list: r.chat || [] });
      if (r.state) schedule(r);
      return broadcast(r);
    }
    if (!room) return;
    const isHost = seatI === 0;
    switch (m.t) {
      case 'addBot':
        if (isHost && !room.state && room.seats.length < 6) { const used = new Set(room.seats.map(x => x.name)); const usedL = new Set(room.seats.map(x => x.look)); room.seats.push({ name: BOT_NAMES.find(n => !used.has(n)) || 'Bot', bot: true, look: G.TOKENS.find(t => !usedL.has(t)) || 'casco' }); broadcast(room); }
        break;
      case 'kick':
        if (isHost && !room.state && m.i > 0 && room.seats[m.i]) {
          const [gone] = room.seats.splice(m.i, 1);
          if (gone.ws) { send(gone.ws, { t: 'error', msg: 'Te sacaron de la sala.', fatal: true }); }
          broadcast(room);
        }
        break;
      case 'look':
        if (!room.state && room.seats[seatI]) {
          const nm = String(m.name || '').trim().slice(0, 16); if (nm) room.seats[seatI].name = nm;
          if (G.TOKENS.includes(m.token)) room.seats[seatI].look = m.token;
          broadcast(room);
        }
        break;
      case 'timer': if (isHost && !room.state) { room.timer = !!m.on; broadcast(room); } break;
      case 'start':
        if (isHost && !room.state && room.seats.length >= 2) {
          room.state = G.newGame({ players: room.seats.map(x => ({ name: x.name, bot: x.bot, token: x.look })), seed: crypto.randomInt(1, 2 ** 31), timer: 120 });
          room.startedAt = Date.now(); schedule(room); broadcast(room);
        }
        break;
      case 'again': // el anfitrión arma otra partida con los mismos asientos
        if (isHost && room.state && room.state.phase === 'end') {
          room.seats.forEach(x => { if (!x.bot && !x.ws) x.bot = true; }); // quien se fue juega como bot
          room.state = G.newGame({ players: room.seats.map(x => ({ name: x.name, bot: x.bot, token: x.look })), seed: crypto.randomInt(1, 2 ** 31), timer: 120 });
          room.startedAt = Date.now(); schedule(room); broadcast(room);
        }
        break;
      case 'act': {
        if (!room.state || !m.a) return;
        const s = room.state; const cur = s.players[s.turn];
        if (cur.id !== pidOf(seatI)) return; // solo juega quien tiene el turno
        if (!act(room, Object.assign({}, m.a, { pid: cur.id }))) broadcast(room);
        break;
      }
      case 'chat': {
        const seat = room.seats[seatI]; if (!seat) break;
        const now = Date.now(); if (now - (seat.lastChat || 0) < 700) break; seat.lastChat = now;
        const text = String(m.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200); if (!text) break;
        const msg = { i: seatI, name: seat.name, text, t: now };
        room.chat = room.chat || []; room.chat.push(msg); if (room.chat.length > 50) room.chat.shift();
        room.seats.forEach(x => { if (x.ws) send(x.ws, { t: 'chat', msg }); });
        break;
      }
      case 'step': // quien tiene el turno avanzó una tarjeta: avanza en todas las pantallas
        room.seats.forEach((x, j) => { if (j !== seatI && x.ws) send(x.ws, { t: 'step', i: m.i }); });
        break;
      case 'idle': room.seats[seatI] && (room.seats[seatI].idle = Math.max(room.seats[seatI].idle || 0, +m.seq || 0)); break;
      case 'leave':
        if (!room.state) { room.seats.splice(seatI, 1); if (!room.seats.some(x => !x.bot)) rooms.delete(room.code); else broadcast(room); }
        else { room.seats[seatI].ws = null; schedule(room); broadcast(room); }
        room = null; seatI = -1;
        break;
    }
  });
  ws.on('close', () => {
    if (!room || !room.seats[seatI] || room.seats[seatI].ws !== ws) return;
    room.seats[seatI].ws = null;
    if (room.state) schedule(room);
    broadcast(room);
  });
});

// Limpieza: salas sin nadie conectado por 15 minutos, o sin actividad por 3 horas
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    const empty = !r.seats.some(x => x.ws);
    if ((empty && now - r.lastActive > 15 * 60e3) || now - r.lastActive > 3 * 3600e3) rooms.delete(code);
  }
}, 60e3);

server.listen(PORT, () => console.log(`La vida de un Ingeniero Civil escuchando en el puerto ${PORT}`));
