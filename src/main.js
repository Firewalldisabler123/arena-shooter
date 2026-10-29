import './style.css';
import { Game } from './game.js';
import { createRoom, joinRoom } from './net.js';
import { unlockAudio } from './audio.js';

// Handys/Tablets: Touch-Steuerung statt Maus + Tastatur
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
const isTouch = document.body.classList.contains('touch');

// Vollbild + Querformat (wo vom Browser erlaubt) – muss in einem Klick-Handler passieren
function enterImmersive() {
  if (!isTouch) return;
  document.documentElement.requestFullscreen?.()
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {});
}

const $ = (id) => document.getElementById(id);
let game = null;
let pending = null; // laufende Raum-Erstellung / Beitritt
let roomCode = '';

function setStatus(text, ok = false) {
  $('status').textContent = text;
  $('status').classList.toggle('ok', ok);
}

function showMenu(message = '') {
  game = null;
  pending = null;
  $('menu').classList.remove('hidden');
  $('menu-main').classList.remove('hidden');
  $('menu-wait').classList.add('hidden');
  $('btn-create').disabled = false;
  $('btn-join').disabled = false;
  setStatus(message);
  // Frische Zeichenfläche für das nächste Spiel
  const old = $('scene');
  const fresh = old.cloneNode(false);
  old.replaceWith(fresh);
}

function startGame(link, isHost) {
  $('menu').classList.add('hidden');
  game = new Game({
    canvas: $('scene'),
    link,
    isHost,
    code: roomCode,
    onLeave: (reason) => showMenu(reason),
  });
  window.__game = game; // Hilfe zum Debuggen in der Konsole
}

$('btn-create').addEventListener('click', () => {
  unlockAudio();
  enterImmersive();
  setStatus('');
  $('menu-main').classList.add('hidden');
  $('menu-wait').classList.remove('hidden');
  $('room-code').textContent = '…';
  $('wait-text').textContent = 'Verbinde mit Vermittlungsserver …';
  pending = createRoom({
    onCode: (code) => {
      roomCode = code;
      $('room-code').textContent = code;
      $('wait-text').textContent = 'Gib diesen Code deinem Mitspieler. Warte auf zweiten Spieler …';
    },
    onConnect: (link) => startGame(link, true),
    onError: (msg) => showMenu(msg),
  });
});

$('btn-join').addEventListener('click', () => {
  unlockAudio();
  enterImmersive();
  const code = $('code-input').value.trim().toUpperCase();
  if (code.length !== 5) return setStatus('Bitte den 5-stelligen Raumcode eingeben.');
  roomCode = code;
  $('btn-join').disabled = true;
  $('btn-create').disabled = true;
  setStatus('Verbinde …', true);
  pending = joinRoom(code, {
    onConnect: (link) => startGame(link, false),
    onError: (msg) => showMenu(msg),
  });
});

$('code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
$('code-input').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });

$('btn-cancel').addEventListener('click', () => {
  pending?.cancel();
  showMenu();
});

$('btn-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(roomCode); $('btn-copy').textContent = 'Kopiert ✓'; } catch { /* egal */ }
  setTimeout(() => ($('btn-copy').textContent = 'Code kopieren'), 1500);
});

$('btn-rematch').addEventListener('click', () => game?.rematch());
$('btn-menu').addEventListener('click', () => { game?.destroy(); showMenu(); });
