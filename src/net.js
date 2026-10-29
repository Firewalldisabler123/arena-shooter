import Peer from 'peerjs';

const PREFIX = 'neon-arena-shooter-';
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const OPTS = { reliable: true, serialization: 'json' };

const STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

const CONFIG = { iceServers: STUN };

const randomCode = () =>
  Array.from({ length: 5 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

// Dünner Wrapper um eine PeerJS-Verbindung.
class Link {
  constructor(peer, conn) {
    this.peer = peer;
    this.conn = conn;
    this.onData = () => {};
    this.onClose = () => {};
    conn.on('data', (d) => this.onData(d));
    conn.on('close', () => this.onClose());
    conn.on('error', () => this.onClose());
    peer.on('disconnected', () => {});
  }
  send(msg) {
    if (this.conn.open) this.conn.send(msg);
  }
  close() {
    this.onClose = () => {};
    this.conn.close();
    this.peer.destroy();
  }
}

// Host: öffnet einen Raum mit zufälligem Code und wartet auf genau einen Gegner.
export function createRoom({ onCode, onConnect, onError }) {
  let peer;
  let attempts = 0;
  let link = null;
  let cancelled = false;

  const open = () => {
    const code = randomCode();
    if (cancelled) return;
    peer = new Peer(PREFIX + code, { config: CONFIG });
    peer.on('open', () => onCode(code));
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && attempts++ < 5) {
        peer.destroy();
        open();
      } else {
        onError(e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error'
          ? 'Keine Verbindung zum Vermittlungsserver. Internet prüfen!'
          : `Fehler: ${e.type}`);
      }
    });
    peer.on('connection', (conn) => {
      if (link) { conn.close(); return; }
      conn.on('open', () => {
        link = new Link(peer, conn);
        onConnect(link);
      });
    });
  };
  open();

  return { cancel: () => { cancelled = true; if (link) link.close(); else peer && peer.destroy(); } };
}

// Gast: verbindet sich mit dem Raumcode des Hosts.
export function joinRoom(code, { onConnect, onError }) {
  let done = false;
  let peer;
  const fail = (msg) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    peer?.destroy();
    onError(msg);
  };
  const timer = setTimeout(
    () => fail('Zeitüberschreitung – keine direkte Verbindung möglich (Firewall/anderes Netzwerk?).'),
    25000,
  );

  peer = new Peer({ config: CONFIG });
  peer.on('error', (e) => {
    if (e.type === 'peer-unavailable') fail('Raum nicht gefunden. Code prüfen!');
    else fail(`Fehler: ${e.type}`);
  });
  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code.toUpperCase(), OPTS);
    conn.on('open', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      onConnect(new Link(peer, conn));
    });
  });

  return { cancel: () => { done = true; clearTimeout(timer); peer?.destroy(); } };
}
