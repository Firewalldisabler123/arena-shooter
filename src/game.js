import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BOXES, SOLIDS, SPAWNS, HALF } from './map.js';
import { sfx } from './audio.js';

const WIN_SCORE = 3;
const MAX_HP = 100;
const DAMAGE = 34; // 3 Treffer = 1 Kill
const EYE = 1.6;
const RADIUS = 0.4;
const HEIGHT = 1.8;
const SPEED = 8;
const JUMP = 7.5;
const GRAVITY = 22;
const FIRE_DELAY = 0.28;
const RANGE = 120;
const RESPAWN_MS = 2500;
const COLORS = [0x00f0ff, 0xff2bd6]; // Host = Cyan, Gast = Magenta

const $ = (id) => document.getElementById(id);

// Strahl gegen Box (Slab-Methode). Liefert Abstand oder Infinity.
function rayBox(o, d, min, max) {
  let t0 = 0;
  let t1 = Infinity;
  for (const a of ['x', 'y', 'z']) {
    if (Math.abs(d[a]) < 1e-8) {
      if (o[a] < min[a] || o[a] > max[a]) return Infinity;
    } else {
      let a0 = (min[a] - o[a]) / d[a];
      let a1 = (max[a] - o[a]) / d[a];
      if (a0 > a1) [a0, a1] = [a1, a0];
      t0 = Math.max(t0, a0);
      t1 = Math.min(t1, a1);
      if (t0 > t1) return Infinity;
    }
  }
  return t0;
}

const rayWorld = (o, d) => {
  let best = RANGE;
  for (const b of SOLIDS) {
    const t = rayBox(
      o, d,
      { x: b.x - b.w / 2, y: 0, z: b.z - b.d / 2 },
      { x: b.x + b.w / 2, y: b.h, z: b.z + b.d / 2 },
    );
    if (t < best) best = t;
  }
  return best;
};

const neonBox = (w, h, d, color, fill = 0x0a0d1f) => {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, h, d);
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: fill, roughness: 0.5, metalness: 0.6, emissive: color, emissiveIntensity: 0.08 })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color })));
  return g;
};

export class Game {
  constructor({ canvas, link, isHost, code, onLeave }) {
    this.link = link;
    this.isHost = isHost;
    this.me = isHost ? 0 : 1;
    this.opp = 1 - this.me;
    this.onLeave = onLeave;
    this.running = true;

    // --- Spielzustand (Host ist maßgeblich, Gast bekommt Kopien) ---
    this.st = this.freshState();
    this.pos = new THREE.Vector3(...SPAWNS[this.me === 0 ? 0 : 1]);
    this.vel = new THREE.Vector3();
    this.yaw = this.me === 0 ? Math.PI * 0.75 : -Math.PI * 0.25;
    this.pitch = 0;
    this.onGround = true;
    this.keys = {};
    this.firing = false;
    this.cooldown = 0;
    this.kick = 0;
    this.remote = { pos: new THREE.Vector3(...SPAWNS[this.opp === 0 ? 0 : 1]), yaw: 0, pitch: 0 };
    this.tracers = [];
    this.respawnTimer = null;
    this.sendTimer = 0;

    this.initGraphics(canvas);
    this.buildWorld();
    this.initHud(code);
    this.bindInput();
    this.bindNet();

    this.last = performance.now();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  freshState() {
    return { hp: [MAX_HP, MAX_HP], score: [0, 0], alive: [true, true], over: false, winner: -1 };
  }

  // ---------------------------------------------------------------- Grafik
  initGraphics(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03040c);
    this.scene.fog = new THREE.Fog(0x03040c, 25, 75);
    this.camera = new THREE.PerspectiveCamera(80, 1, 0.05, 200);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.25);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.onResize = () => {
      const w = innerWidth;
      const h = innerHeight;
      this.renderer.setSize(w, h, false);
      this.composer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    addEventListener('resize', this.onResize);
    this.onResize();
  }

  buildWorld() {
    const s = this.scene;
    s.add(new THREE.AmbientLight(0x6070ff, 0.9));
    const l1 = new THREE.PointLight(0x00f0ff, 80, 60);
    l1.position.set(-10, 6, -10);
    const l2 = new THREE.PointLight(0xff2bd6, 80, 60);
    l2.position.set(10, 6, 10);
    s.add(l1, l2);

    // Boden + Gitter
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2, HALF * 2),
      new THREE.MeshStandardMaterial({ color: 0x080b1c, roughness: 0.4, metalness: 0.7 }),
    );
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const grid = new THREE.GridHelper(HALF * 2, HALF * 2, 0x00f0ff, 0x0a3a66);
    grid.position.y = 0.01;
    s.add(grid);

    // Wände: halbtransparente Flächen mit Neon-Rand
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0b1030, emissive: 0x1030ff, emissiveIntensity: 0.25, roughness: 0.6, side: THREE.DoubleSide });
    for (const [x, z, ry] of [[0, -HALF, 0], [0, HALF, 0], [-HALF, 0, Math.PI / 2], [HALF, 0, Math.PI / 2]]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 7), wallMat);
      wall.position.set(x, 3.5, z);
      wall.rotation.y = ry;
      s.add(wall);
      const top = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
      top.position.set(x, 7, z);
      top.rotation.y = ry;
      s.add(top);
    }

    for (const b of BOXES) {
      const m = neonBox(b.w, b.h, b.d, b.color);
      m.position.set(b.x, b.h / 2, b.z);
      s.add(m);
    }

    // Gegner-Modell
    const c = COLORS[this.opp];
    this.enemy = new THREE.Group();
    const body = neonBox(0.8, 1.1, 0.5, c, 0x10142a);
    body.position.y = 0.95;
    const head = neonBox(0.45, 0.4, 0.45, c, 0x10142a);
    head.position.y = 1.65;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    visor.position.set(0, 1.68, -0.23);
    const legs = neonBox(0.6, 0.4, 0.4, c, 0x10142a);
    legs.position.y = 0.2;
    const gun = neonBox(0.12, 0.14, 0.7, c, 0x10142a);
    gun.position.set(0.5, 1.1, -0.35);
    this.enemy.add(body, head, visor, legs, gun);
    this.enemy.position.copy(this.remote.pos);
    s.add(this.enemy);

    // Eigene Waffe (Ego-Perspektive)
    this.gun = new THREE.Group();
    const gb = neonBox(0.09, 0.11, 0.55, COLORS[this.me], 0x10142a);
    this.gun.add(gb);
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.flash.position.z = -0.35;
    this.flash.visible = false;
    this.gun.add(this.flash);
    this.gun.position.set(0.26, -0.24, -0.55);
    this.camera.add(this.gun);
  }

  // ---------------------------------------------------------------- HUD
  initHud(code) {
    $('hud').classList.remove('hidden');
    $('hud-code').textContent = code || '';
    $('end').classList.add('hidden');
    this.refreshHud();
    this.checkLock();
  }

  refreshHud() {
    const { hp, score } = this.st;
    const mine = Math.max(0, hp[this.me]);
    $('hp-num').textContent = mine;
    $('hp-fill').style.width = `${mine}%`;
    $('hp-fill').classList.toggle('low', mine <= 40);
    $('score-me').textContent = score[this.me];
    $('score-opp').textContent = score[this.opp];
  }

  showMessage(text, color = '#fff', ms = 1500) {
    const el = $('message');
    el.textContent = text;
    el.style.color = color;
    el.classList.add('on');
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => el.classList.remove('on'), ms);
  }

  pulse(id, ms) {
    const el = $(id);
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('on'), ms);
  }

  // ---------------------------------------------------------------- Eingabe
  bindInput() {
    const canvas = this.renderer.domElement;
    this.h = {
      keydown: (e) => { this.keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); },
      keyup: (e) => { this.keys[e.code] = false; },
      mousemove: (e) => {
        if (document.pointerLockElement !== canvas) return;
        this.yaw -= e.movementX * 0.0022;
        this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * 0.0022));
      },
      mousedown: (e) => { if (e.button === 0 && document.pointerLockElement === canvas) this.firing = true; },
      mouseup: (e) => { if (e.button === 0) this.firing = false; },
      lockchange: () => this.checkLock(),
      clickOverlay: () => canvas.requestPointerLock(),
      blur: () => { this.keys = {}; this.firing = false; },
    };
    addEventListener('keydown', this.h.keydown);
    addEventListener('keyup', this.h.keyup);
    addEventListener('mousemove', this.h.mousemove);
    addEventListener('mousedown', this.h.mousedown);
    addEventListener('mouseup', this.h.mouseup);
    addEventListener('blur', this.h.blur);
    document.addEventListener('pointerlockchange', this.h.lockchange);
    $('click').addEventListener('click', this.h.clickOverlay);
  }

  checkLock() {
    if (!this.running) return;
    const locked = document.pointerLockElement === this.renderer.domElement;
    $('click').classList.toggle('hidden', locked || this.st.over);
    if (!locked) { this.firing = false; this.keys = {}; }
  }

  // ---------------------------------------------------------------- Netzwerk
  bindNet() {
    this.link.onData = (m) => this.onMessage(m);
    this.link.onClose = () => this.leave('Der Gegner hat das Spiel verlassen.');
    if (this.isHost) this.link.send({ t: 'state', st: this.st });
  }

  onMessage(m) {
    switch (m.t) {
      case 'pos':
        this.remote.pos.set(...m.p);
        this.remote.yaw = m.y;
        this.remote.pitch = m.pi;
        break;
      case 'shoot': // nur Host
        if (this.isHost) this.resolveShot(1, new THREE.Vector3(...m.o), new THREE.Vector3(...m.d));
        break;
      case 'fx':
        this.showTracer(m.s, new THREE.Vector3(...m.o), new THREE.Vector3(...m.e));
        if (m.s === this.opp) sfx.enemyShoot();
        if (m.hit && m.s === this.me) { this.pulse('hitmarker', 120); sfx.hit(); }
        break;
      case 'state':
        this.applyState(m.st);
        break;
      case 'respawn':
        this.pos.set(...m.pos);
        this.vel.set(0, 0, 0);
        break;
      case 'restart':
        this.restart();
        break;
    }
  }

  // Wird auf beiden Seiten aufgerufen, wenn sich der maßgebliche Zustand ändert.
  applyState(next) {
    const prev = this.st;
    this.st = next;
    const me = this.me;
    const opp = this.opp;

    if (next.hp[me] < prev.hp[me] && next.alive[me]) { this.pulse('damage', 250); sfx.hurt(); }
    if (prev.alive[me] && !next.alive[me]) { this.pulse('damage', 600); sfx.die(); this.showMessage('ABGESCHOSSEN', '#ff4060', 2000); }
    if (!prev.alive[me] && next.alive[me]) this.showMessage('GO!', '#7dffb0', 700);
    if (next.score[me] > prev.score[me]) { sfx.kill(); this.showMessage('GEGNER AUSGESCHALTET', '#00f0ff', 1800); }
    this.refreshHud();

    if (next.over && !prev.over) {
      const won = next.winner === me;
      $('end-title').textContent = won ? 'SIEG!' : 'NIEDERLAGE';
      $('end-title').style.color = won ? '#7dffb0' : '#ff4060';
      $('end-score').textContent = `${next.score[me]} : ${next.score[opp]}`;
      $('btn-rematch').classList.toggle('hidden', !this.isHost);
      $('rematch-wait').classList.toggle('hidden', this.isHost);
      $('end').classList.remove('hidden');
      $('click').classList.add('hidden');
      $('message').classList.remove('on');
      document.exitPointerLock?.();
      won ? sfx.win() : sfx.lose();
    }
    if (!next.over && prev.over) { $('end').classList.add('hidden'); this.checkLock(); }
  }

  // Host: Zustand ändern, lokal anwenden und an den Gast schicken.
  commit(next) {
    this.applyState(next);
    this.link.send({ t: 'state', st: next });
  }

  // Host: Schuss auswerten (Treffer, Schaden, Punkte).
  resolveShot(shooter, o, d) {
    const st = this.st;
    if (st.over || !st.alive[shooter]) return;
    d.normalize();
    const target = 1 - shooter;
    const wallT = rayWorld(o, d);
    let hit = false;
    let end = wallT;

    if (st.alive[target]) {
      const p = target === this.me ? this.pos : this.remote.pos;
      const t = rayBox(
        o, d,
        { x: p.x - RADIUS, y: p.y, z: p.z - RADIUS },
        { x: p.x + RADIUS, y: p.y + HEIGHT, z: p.z + RADIUS },
      );
      if (t < wallT) { hit = true; end = t; }
    }

    const e = o.clone().addScaledVector(d, end);
    const fx = { t: 'fx', s: shooter, o: o.toArray(), e: e.toArray(), hit };
    this.link.send(fx);
    this.onMessage(fx);

    if (!hit) return;
    const next = structuredClone(st);
    next.hp[target] = Math.max(0, next.hp[target] - DAMAGE);
    if (next.hp[target] <= 0) {
      next.alive[target] = false;
      next.score[shooter]++;
      if (next.score[shooter] >= WIN_SCORE) {
        next.over = true;
        next.winner = shooter;
      } else {
        clearTimeout(this.respawnTimer);
        this.respawnTimer = setTimeout(() => this.respawn(target), RESPAWN_MS);
      }
    }
    this.commit(next);
  }

  respawn(id) {
    if (!this.running || this.st.over) return;
    const other = id === this.me ? this.remote.pos : this.pos;
    // Spawnpunkt mit größtem Abstand zum Gegner
    let best = SPAWNS[0];
    let dist = -1;
    for (const s of SPAWNS) {
      const dd = (s[0] - other.x) ** 2 + (s[2] - other.z) ** 2;
      if (dd > dist) { dist = dd; best = s; }
    }
    const next = structuredClone(this.st);
    next.alive[id] = true;
    next.hp[id] = MAX_HP;
    if (id === this.me) {
      this.pos.set(...best);
      this.vel.set(0, 0, 0);
    } else {
      this.remote.pos.set(...best);
      this.link.send({ t: 'respawn', pos: best });
    }
    this.commit(next);
  }

  restart() {
    clearTimeout(this.respawnTimer);
    this.st = this.freshState();
    this.pos.set(...SPAWNS[this.me === 0 ? 0 : 1]);
    this.vel.set(0, 0, 0);
    this.refreshHud();
    $('end').classList.add('hidden');
    this.checkLock();
    this.showMessage('NEUE RUNDE', '#fff', 1200);
  }

  // Host-Knopf "Revanche"
  rematch() {
    if (!this.isHost) return;
    this.link.send({ t: 'restart' });
    this.restart();
  }

  // ---------------------------------------------------------------- Schießen
  fire() {
    const st = this.st;
    if (st.over || !st.alive[this.me]) return;
    this.cooldown = FIRE_DELAY;
    this.kick = 1;
    sfx.shoot();
    const o = new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z);
    const d = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
    if (this.isHost) this.resolveShot(0, o, d);
    else {
      this.link.send({ t: 'shoot', o: o.toArray(), d: d.toArray() });
    }
  }

  showTracer(shooter, o, e) {
    let start;
    if (shooter === this.me) {
      this.camera.updateMatrixWorld();
      start = new THREE.Vector3(0.26, -0.24, -1.0).applyMatrix4(this.camera.matrixWorld);
    } else {
      start = o.clone();
      start.y -= 0.4;
    }
    const len = start.distanceTo(e);
    if (len < 0.1) return;
    const mat = new THREE.MeshBasicMaterial({ color: COLORS[shooter], transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, len), mat);
    mesh.position.copy(start).add(e).multiplyScalar(0.5);
    mesh.lookAt(e);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.14, max: 0.14 });
    if (shooter === this.me) { this.flash.visible = true; this.flashT = 0.05; }
  }

  // ---------------------------------------------------------------- Bewegung
  groundAt(p) {
    let g = 0;
    for (const b of SOLIDS) {
      if (b.h <= p.y + 0.05 && Math.abs(p.x - b.x) < b.w / 2 + RADIUS * 0.6 && Math.abs(p.z - b.z) < b.d / 2 + RADIUS * 0.6) g = Math.max(g, b.h);
    }
    return g;
  }

  blocked(x, y, z) {
    for (const b of SOLIDS) {
      if (y < b.h - 0.01 && Math.abs(x - b.x) < b.w / 2 + RADIUS && Math.abs(z - b.z) < b.d / 2 + RADIUS) return true;
    }
    return false;
  }

  move(dt) {
    const alive = this.st.alive[this.me] && !this.st.over;
    const k = this.keys;
    let fx = 0;
    let fz = 0;
    if (alive) {
      fz = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      fx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    }
    const len = Math.hypot(fx, fz) || 1;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const dx = ((fx / len) * cos - (fz / len) * sin) * SPEED * dt;
    const dz = ((-fx / len) * sin - (fz / len) * cos) * SPEED * dt;

    const p = this.pos;
    if (!this.blocked(p.x + dx, p.y, p.z)) p.x += dx;
    if (!this.blocked(p.x, p.y, p.z + dz)) p.z += dz;
    p.x = Math.max(-HALF + RADIUS, Math.min(HALF - RADIUS, p.x));
    p.z = Math.max(-HALF + RADIUS, Math.min(HALF - RADIUS, p.z));

    if (alive && k.Space && this.onGround) { this.vel.y = JUMP; this.onGround = false; }
    this.vel.y -= GRAVITY * dt;
    p.y += this.vel.y * dt;
    const g = this.groundAt(p);
    if (p.y <= g) { p.y = g; this.vel.y = 0; this.onGround = true; } else this.onGround = false;
  }

  // ---------------------------------------------------------------- Hauptschleife
  frame(now) {
    if (!this.running) return;
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    this.move(dt);
    this.cooldown -= dt;
    if (this.firing && this.cooldown <= 0) this.fire();

    // Kamera
    const alive = this.st.alive[this.me];
    this.camera.position.set(this.pos.x, this.pos.y + (alive ? EYE : 0.35), this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, alive ? 0 : 0.6);

    // Waffe + Mündungsfeuer
    this.kick = Math.max(0, this.kick - dt * 8);
    this.gun.position.z = -0.55 + this.kick * 0.08;
    this.gun.visible = alive;
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) this.flash.visible = false;

    // Gegner glätten
    const r = this.remote;
    const target = r.pos;
    this.enemy.position.lerp(target, Math.min(1, dt * 18));
    this.enemy.rotation.y = r.yaw;
    this.enemy.visible = this.st.alive[this.opp];

    // Schusslinien ausblenden
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / t.max);
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
        this.tracers.splice(i, 1);
      }
    }

    // Position senden (30 Hz)
    this.sendTimer += dt;
    if (this.sendTimer > 1 / 30) {
      this.sendTimer = 0;
      this.link.send({ t: 'pos', p: this.pos.toArray(), y: this.yaw, pi: this.pitch });
    }

    this.composer.render();
  }

  // ---------------------------------------------------------------- Aufräumen
  leave(reason) {
    if (!this.running) return;
    this.destroy();
    this.onLeave(reason);
  }

  destroy() {
    this.running = false;
    clearTimeout(this.respawnTimer);
    clearTimeout(this.msgTimer);
    removeEventListener('resize', this.onResize);
    removeEventListener('keydown', this.h.keydown);
    removeEventListener('keyup', this.h.keyup);
    removeEventListener('mousemove', this.h.mousemove);
    removeEventListener('mousedown', this.h.mousedown);
    removeEventListener('mouseup', this.h.mouseup);
    removeEventListener('blur', this.h.blur);
    document.removeEventListener('pointerlockchange', this.h.lockchange);
    $('click').removeEventListener('click', this.h.clickOverlay);
    document.exitPointerLock?.();
    this.link.close();
    this.composer.dispose?.();
    this.renderer.dispose();
    $('hud').classList.add('hidden');
    $('click').classList.add('hidden');
    $('end').classList.add('hidden');
  }
}
