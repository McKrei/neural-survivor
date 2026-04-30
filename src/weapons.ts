// Weapon firing logic. Each weapon has a cooldown that ticks down; when it
// reaches zero, it fires (creates projectiles or directly damages enemies in
// the case of Firewall).

import type { Enemy, GameState, Projectile, Weapon } from "./types";
import { rngNext, rngRange, TAU } from "./utils";

const newId = (state: GameState): number => {
  state.nextId++;
  return state.nextId;
};

// ----- Cooldown helpers -----

interface WeaponLevelData {
  // Base cooldown (seconds between fires) before attack-speed multiplier
  cooldown: number;
  damage: number;
  count: number; // number of shots per fire
  pierce: number;
  speed: number;
  size: number; // visual size factor
  life: number; // projectile lifetime
}

const THREAD_LEVELS: WeaponLevelData[] = [
  { cooldown: 0.55, damage: 8, count: 1, pierce: 0, speed: 520, size: 6, life: 0.9 },
  { cooldown: 0.50, damage: 9, count: 2, pierce: 0, speed: 540, size: 6, life: 0.95 },
  { cooldown: 0.46, damage: 12, count: 2, pierce: 0, speed: 560, size: 6, life: 1.0 },
  { cooldown: 0.42, damage: 14, count: 3, pierce: 1, speed: 580, size: 7, life: 1.05 },
  { cooldown: 0.32, damage: 18, count: 3, pierce: 3, speed: 620, size: 8, life: 1.1 },
];

interface FirewallLevel {
  cooldown: number; // tick interval
  radius: number;
  damage: number;
}

const FIREWALL_LEVELS: FirewallLevel[] = [
  { cooldown: 0.55, radius: 78, damage: 6 },
  { cooldown: 0.55, radius: 94, damage: 8 },
  { cooldown: 0.42, radius: 94, damage: 8 },
  { cooldown: 0.40, radius: 118, damage: 10 },
  { cooldown: 0.36, radius: 153, damage: 15 },
];

const ANTIVIRUS_LEVELS: WeaponLevelData[] = [
  { cooldown: 1.30, damage: 14, count: 1, pierce: 0, speed: 320, size: 9, life: 2.4 },
  { cooldown: 1.20, damage: 17, count: 2, pierce: 0, speed: 340, size: 9, life: 2.4 },
  { cooldown: 0.92, damage: 17, count: 2, pierce: 0, speed: 410, size: 9, life: 2.4 },
  { cooldown: 0.85, damage: 22, count: 3, pierce: 0, speed: 420, size: 10, life: 2.4 },
  { cooldown: 0.75, damage: 35, count: 5, pierce: 1, speed: 460, size: 11, life: 2.5 },
];

interface GcLevel {
  cooldown: number;
  radius: number; // explosion radius
  damage: number; // explosion damage
  count: number; // bombs per fire
  fuse: number; // delay before explode
  size: number;
}

const GC_LEVELS: GcLevel[] = [
  { cooldown: 2.4, radius: 110, damage: 30, count: 1, fuse: 0.7, size: 12 },
  { cooldown: 2.4, radius: 138, damage: 38, count: 1, fuse: 0.7, size: 12 },
  { cooldown: 1.8, radius: 138, damage: 38, count: 1, fuse: 0.7, size: 12 },
  { cooldown: 1.7, radius: 165, damage: 45, count: 2, fuse: 0.7, size: 13 },
  { cooldown: 1.5, radius: 180, damage: 70, count: 3, fuse: 0.7, size: 14 },
];

const LASER_LEVELS: WeaponLevelData[] = [
  { cooldown: 1.0, damage: 18, count: 1, pierce: 3, speed: 1100, size: 6, life: 0.55 },
  { cooldown: 1.0, damage: 24, count: 1, pierce: 4, speed: 1100, size: 7, life: 0.55 },
  { cooldown: 0.74, damage: 24, count: 1, pierce: 4, speed: 1100, size: 7, life: 0.55 },
  { cooldown: 0.74, damage: 30, count: 1, pierce: 4, speed: 1100, size: 9, life: 0.55 },
  { cooldown: 0.65, damage: 42, count: 2, pierce: 6, speed: 1200, size: 10, life: 0.55 },
];

const DEBUGGER_LEVELS: WeaponLevelData[] = [
  { cooldown: 0.95, damage: 16, count: 1, pierce: 4, speed: 380, size: 9, life: 1.4 },
  { cooldown: 0.95, damage: 19, count: 1, pierce: 6, speed: 380, size: 9, life: 1.5 },
  { cooldown: 0.95, damage: 19, count: 1, pierce: 6, speed: 380, size: 9, life: 1.5 },
  { cooldown: 0.85, damage: 24, count: 2, pierce: 6, speed: 400, size: 10, life: 1.5 },
  { cooldown: 0.75, damage: 34, count: 2, pierce: 8, speed: 420, size: 13, life: 1.6 },
];

// Sentinel: orbital drones around player.
interface SentinelLevel {
  cooldown: number; // refire interval
  count: number; // number of orbiting drones
  damage: number;
  radius: number; // orbit radius
  size: number; // drone visual size
  spin: number; // angular velocity
}
const SENTINEL_LEVELS: SentinelLevel[] = [
  { cooldown: 0.45, count: 2, damage: 14, radius: 78, size: 9, spin: 2.4 },
  { cooldown: 0.42, count: 3, damage: 17, radius: 82, size: 9, spin: 2.6 },
  { cooldown: 0.40, count: 3, damage: 21, radius: 96, size: 10, spin: 2.8 },
  { cooldown: 0.36, count: 4, damage: 27, radius: 100, size: 11, spin: 3.4 },
  { cooldown: 0.32, count: 5, damage: 38, radius: 110, size: 13, spin: 3.8 },
];

// Crypto: chain lightning, hits up to N targets in sequence.
interface CryptoLevel {
  cooldown: number;
  damage: number;
  chains: number; // number of targets struck
  range: number; // initial + chain hop range
}
const CRYPTO_LEVELS: CryptoLevel[] = [
  { cooldown: 1.05, damage: 22, chains: 3, range: 280 },
  { cooldown: 1.05, damage: 26, chains: 4, range: 290 },
  { cooldown: 0.80, damage: 26, chains: 4, range: 300 },
  { cooldown: 0.80, damage: 34, chains: 5, range: 320 },
  { cooldown: 0.70, damage: 48, chains: 7, range: 360 },
];

// ----- Evolutions (single-level, very strong final-form weapons) -----

const HYPERTHREAD = { cooldown: 0.10, damage: 22, count: 6, pierce: 4, speed: 700, size: 8, life: 1.0 };
const PERIMETER = { cooldown: 0.18, radius: 230, damage: 18 };
const HEURISTIC = { cooldown: 0.40, damage: 28, count: 6, pierce: 1, speed: 480, size: 10, life: 2.6 };

// ----- Targeting helpers -----

const findClosestEnemy = (
  state: GameState,
  x: number,
  y: number,
  maxDist: number,
): Enemy | null => {
  let best: Enemy | null = null;
  let bestD = maxDist * maxDist;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
};

// Apply common visual size & speed scaling from player stats
const visSize = (base: number, state: GameState): number =>
  base * state.player.stats.projectileSizeMul;
const visSpeed = (base: number, state: GameState): number =>
  base * state.player.stats.projectileSpeedMul;
const visLife = (base: number, state: GameState): number =>
  base * state.player.stats.durationMul;

// ----- Fire functions -----

const fireThread = (state: GameState, w: Weapon): void => {
  const lvl = THREAD_LEVELS[w.level - 1];
  const damage = lvl.damage * state.player.stats.damageMul;
  const pierce = lvl.pierce + state.player.stats.pierceBonus;
  const count = lvl.count + state.player.stats.threadExtra;

  // Aim at nearest enemy if any; fall back to facing direction.
  let baseAngle = state.player.facing;
  const target = findClosestEnemy(state, state.player.x, state.player.y, 900);
  if (target) {
    baseAngle = Math.atan2(target.y - state.player.y, target.x - state.player.x);
  }
  // Spread N shots over an angular fan (smaller fan with fewer shots)
  const fan = count === 1 ? 0 : 0.18 + (count - 1) * 0.06;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const a = baseAngle + t * fan;
    const speed = visSpeed(lvl.speed, state);
    const size = visSize(lvl.size, state);
    const p: Projectile = {
      id: newId(state),
      kind: "thread",
      x: state.player.x + Math.cos(a) * (state.player.r + 4),
      y: state.player.y + Math.sin(a) * (state.player.r + 4),
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: size * 0.7,
      damage,
      life: visLife(lvl.life, state),
      pierce,
      hitTimer: 0,
      hitSet: new Set(),
      knockback: 80,
      size,
      color: "#6cf",
      target: null,
      explodeRadius: 0,
      explodeDamage: 0,
      angle: a,
      spin: 0,
      hostile: false,
      alive: true,
    };
    state.projectiles.push(p);
  }
};

const fireFirewall = (state: GameState, w: Weapon): void => {
  const lvl = FIREWALL_LEVELS[w.level - 1];
  const r = lvl.radius * state.player.stats.areaMul;
  const damage = lvl.damage * state.player.stats.damageMul;
  // Damage all enemies in radius (no projectile)
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = e.x - state.player.x;
    const dy = e.y - state.player.y;
    if (dx * dx + dy * dy < r * r) {
      damageEnemy(state, e, damage, dx, dy, 30);
    }
  }
  // Visual ring particle
  state.particles.push({
    kind: "ring",
    x: state.player.x,
    y: state.player.y,
    vx: 0,
    vy: 0,
    life: 0.4,
    maxLife: 0.4,
    size: r,
    color: "rgba(255, 122, 77, 0.45)",
    alive: true,
  });
};

const fireAntivirus = (state: GameState, w: Weapon): void => {
  const lvl = ANTIVIRUS_LEVELS[w.level - 1];
  const damage = lvl.damage * state.player.stats.damageMul;
  const count = lvl.count;
  const rng = { state: state.rngState };
  for (let i = 0; i < count; i++) {
    const a = rngRange(rng, 0, TAU);
    const speed = visSpeed(lvl.speed, state);
    const size = visSize(lvl.size, state);
    const p: Projectile = {
      id: newId(state),
      kind: "antivirus",
      x: state.player.x,
      y: state.player.y,
      vx: Math.cos(a) * speed * 0.3,
      vy: Math.sin(a) * speed * 0.3,
      r: size * 0.6,
      damage,
      life: visLife(lvl.life, state),
      pierce: lvl.pierce + state.player.stats.pierceBonus,
      hitTimer: 0,
      hitSet: new Set(),
      knockback: 60,
      size,
      color: "#7fffd4",
      target: null,
      explodeRadius: 0,
      explodeDamage: 0,
      angle: a,
      spin: 5,
      hostile: false,
      alive: true,
    };
    state.projectiles.push(p);
  }
  state.rngState = rng.state;
};

const fireGc = (state: GameState, w: Weapon): void => {
  const lvl = GC_LEVELS[w.level - 1];
  const radius = lvl.radius * state.player.stats.areaMul;
  const damage = lvl.damage * state.player.stats.damageMul;
  const rng = { state: state.rngState };

  for (let i = 0; i < lvl.count; i++) {
    // Random target enemy nearby; if none, drop near player
    const candidates: Enemy[] = [];
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const dx = e.x - state.player.x;
      const dy = e.y - state.player.y;
      if (dx * dx + dy * dy < 480 * 480) candidates.push(e);
    }
    let tx = state.player.x + rngRange(rng, -120, 120);
    let ty = state.player.y + rngRange(rng, -120, 120);
    if (candidates.length > 0) {
      const t = candidates[Math.floor(rngNext(rng) * candidates.length)];
      tx = t.x;
      ty = t.y;
    }
    const ang = Math.atan2(ty - state.player.y, tx - state.player.x);
    const dist = Math.hypot(tx - state.player.x, ty - state.player.y);
    // Arc throw: ballistic in 0.7 seconds.
    const speed = dist / lvl.fuse;

    const p: Projectile = {
      id: newId(state),
      kind: "gc",
      x: state.player.x,
      y: state.player.y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      r: 10 * state.player.stats.projectileSizeMul,
      damage: 0, // damage on explosion
      life: lvl.fuse,
      pierce: 0,
      hitTimer: 0,
      hitSet: new Set(),
      knockback: 0,
      size: lvl.size * state.player.stats.projectileSizeMul,
      color: "#ffb347",
      target: null,
      explodeRadius: radius,
      explodeDamage: damage,
      angle: ang,
      spin: 8,
      hostile: false,
      alive: true,
    };
    state.projectiles.push(p);
  }
  state.rngState = rng.state;
};

const fireLaser = (state: GameState, w: Weapon): void => {
  const lvl = LASER_LEVELS[w.level - 1];
  const damage = lvl.damage * state.player.stats.damageMul;
  for (let i = 0; i < lvl.count; i++) {
    // Find a target; prefer different targets per shot
    const target = findClosestEnemy(state, state.player.x, state.player.y, 700);
    let a = state.player.facing;
    if (target) {
      a = Math.atan2(target.y - state.player.y, target.x - state.player.x);
    }
    // Add small spread per shot
    a += (i - (lvl.count - 1) / 2) * 0.18;
    const speed = visSpeed(lvl.speed, state);
    const size = visSize(lvl.size, state);
    const p: Projectile = {
      id: newId(state),
      kind: "laser",
      x: state.player.x + Math.cos(a) * (state.player.r + 6),
      y: state.player.y + Math.sin(a) * (state.player.r + 6),
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: size * 0.5,
      damage,
      life: visLife(lvl.life, state),
      pierce: lvl.pierce + state.player.stats.pierceBonus,
      hitTimer: 0,
      hitSet: new Set(),
      knockback: 30,
      size,
      color: "#ff5577",
      target: null,
      explodeRadius: 0,
      explodeDamage: 0,
      angle: a,
      spin: 0,
      hostile: false,
      alive: true,
    };
    state.projectiles.push(p);
  }
};

const fireDebugger = (state: GameState, w: Weapon): void => {
  const lvl = DEBUGGER_LEVELS[w.level - 1];
  const damage = lvl.damage * state.player.stats.damageMul;
  const count = lvl.count;
  for (let i = 0; i < count; i++) {
    // Find different targets by indexing into nearby enemies
    let a = state.player.facing;
    const target = findClosestEnemy(state, state.player.x, state.player.y, 900);
    if (target) {
      a = Math.atan2(target.y - state.player.y, target.x - state.player.x);
    }
    a += (i - (count - 1) / 2) * 0.22;
    const speed = visSpeed(lvl.speed, state);
    const size = visSize(lvl.size, state);
    const p: Projectile = {
      id: newId(state),
      kind: "thread", // visually rendered same as thread but in debugger color
      x: state.player.x + Math.cos(a) * (state.player.r + 4),
      y: state.player.y + Math.sin(a) * (state.player.r + 4),
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: size * 0.7,
      damage,
      life: visLife(lvl.life, state),
      pierce: lvl.pierce + state.player.stats.pierceBonus,
      hitTimer: 0,
      hitSet: new Set(),
      knockback: 60,
      size,
      color: "#c79cff",
      target: null,
      explodeRadius: 0,
      explodeDamage: 0,
      angle: a,
      spin: 0,
      hostile: false,
      alive: true,
    };
    state.projectiles.push(p);
  }
};

const fireSentinel = (state: GameState, w: Weapon): void => {
  const lvl = SENTINEL_LEVELS[w.level - 1];
  const damage = lvl.damage * state.player.stats.damageMul;
  const count = lvl.count;
  const radius = lvl.radius * state.player.stats.areaMul;
  // Sentinel projectiles re-spawn each cycle to give continuous orbit visuals.
  // Mark previous sentinels for fast death so we don't double-stack.
  for (const p of state.projectiles) {
    if (p.kind === "sentinel" && p.life > lvl.cooldown * 1.05) {
      p.life = lvl.cooldown * 1.05;
    }
  }
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const size = visSize(lvl.size, state);
    const p: Projectile = {
      id: newId(state),
      kind: "sentinel",
      x: state.player.x + Math.cos(a) * radius,
      y: state.player.y + Math.sin(a) * radius,
      vx: 0,
      vy: 0,
      r: size * 0.7,
      damage,
      life: lvl.cooldown * 1.15, // slight overlap for smooth visual
      pierce: 999, // re-hit through cycle; fresh hitSet each cycle anyway
      hitTimer: 0,
      hitSet: new Set(),
      knockback: 80,
      size,
      color: "#9aff8c",
      target: null,
      explodeRadius: 0,
      explodeDamage: 0,
      angle: a,
      spin: lvl.spin,
      hostile: false,
      alive: true,
      orbitR: radius,
    };
    state.projectiles.push(p);
  }
};

const fireCrypto = (state: GameState, w: Weapon): void => {
  const lvl = CRYPTO_LEVELS[w.level - 1];
  const baseDmg = lvl.damage * state.player.stats.damageMul;
  const range = lvl.range * (0.85 + state.player.stats.areaMul * 0.15);
  const hit: Set<number> = new Set();
  let lastX = state.player.x;
  let lastY = state.player.y;
  let chained = 0;
  for (let i = 0; i < lvl.chains; i++) {
    let best: Enemy | null = null;
    let bestD = (i === 0 ? 700 : range) ** 2;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (hit.has(e.id)) continue;
      const dx = e.x - lastX;
      const dy = e.y - lastY;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) break;
    // Final chain link does double damage at level 5
    const isLast = i === lvl.chains - 1;
    const dmg = w.level >= 5 && isLast ? baseDmg * 2 : baseDmg;
    // Visual chain particle (line)
    spawnChainSpark(state, lastX, lastY, best.x, best.y);
    damageEnemy(
      state,
      best,
      dmg,
      best.x - lastX,
      best.y - lastY,
      40,
    );
    hit.add(best.id);
    lastX = best.x;
    lastY = best.y;
    chained++;
  }
  if (chained > 0) state.camera.shake = Math.max(state.camera.shake, 2.5);
};

const spawnChainSpark = (
  state: GameState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void => {
  // Use particle "text" trick; we'll add a 'chain' particle but simpler: drop
  // several 'spark' particles along the line so the renderer doesn't need a
  // new kind. Cheap, effective.
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    state.particles.push({
      kind: "spark",
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 30,
      vy: (Math.random() - 0.5) * 30,
      life: 0.18,
      maxLife: 0.18,
      size: 2.5,
      color: "#7ed7ff",
      alive: true,
    });
  }
};

// ----- Evolutions -----

const fireHyperthread = (state: GameState, _w: Weapon): void => {
  const damage = HYPERTHREAD.damage * state.player.stats.damageMul;
  const pierce = HYPERTHREAD.pierce + state.player.stats.pierceBonus;
  const count = HYPERTHREAD.count + state.player.stats.threadExtra;
  const target = findClosestEnemy(state, state.player.x, state.player.y, 1200);
  const baseAngle = target
    ? Math.atan2(target.y - state.player.y, target.x - state.player.x)
    : state.player.facing;
  for (let i = 0; i < count; i++) {
    // Spread fully around target if many shots — feels like a fan
    const a = baseAngle + (i / count) * TAU;
    const speed = visSpeed(HYPERTHREAD.speed, state);
    const size = visSize(HYPERTHREAD.size, state);
    state.projectiles.push({
      id: newId(state),
      kind: "thread",
      x: state.player.x + Math.cos(a) * (state.player.r + 4),
      y: state.player.y + Math.sin(a) * (state.player.r + 4),
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: size * 0.75,
      damage,
      life: visLife(HYPERTHREAD.life, state),
      pierce,
      hitTimer: 0,
      hitSet: new Set(),
      knockback: 100,
      size,
      color: "#9bf6ff",
      target: null,
      explodeRadius: 0,
      explodeDamage: 0,
      angle: a,
      spin: 0,
      hostile: false,
      alive: true,
    });
  }
};

const firePerimeter = (state: GameState, _w: Weapon): void => {
  const r = PERIMETER.radius * state.player.stats.areaMul;
  const damage = PERIMETER.damage * state.player.stats.damageMul;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = e.x - state.player.x;
    const dy = e.y - state.player.y;
    if (dx * dx + dy * dy < r * r) {
      damageEnemy(state, e, damage, dx, dy, 50);
    }
  }
  // Two-ring visual
  state.particles.push({
    kind: "ring",
    x: state.player.x,
    y: state.player.y,
    vx: 0,
    vy: 0,
    life: 0.45,
    maxLife: 0.45,
    size: r,
    color: "rgba(255, 172, 77, 0.55)",
    alive: true,
  });
  state.particles.push({
    kind: "ring",
    x: state.player.x,
    y: state.player.y,
    vx: 0,
    vy: 0,
    life: 0.32,
    maxLife: 0.32,
    size: r * 0.65,
    color: "rgba(255, 220, 130, 0.55)",
    alive: true,
  });
};

const fireHeuristic = (state: GameState, _w: Weapon): void => {
  const damage = HEURISTIC.damage * state.player.stats.damageMul;
  const count = HEURISTIC.count;
  const rng = { state: state.rngState };
  for (let i = 0; i < count; i++) {
    const a = rngRange(rng, 0, TAU);
    const speed = visSpeed(HEURISTIC.speed, state);
    const size = visSize(HEURISTIC.size, state);
    state.projectiles.push({
      id: newId(state),
      kind: "antivirus",
      x: state.player.x,
      y: state.player.y,
      vx: Math.cos(a) * speed * 0.4,
      vy: Math.sin(a) * speed * 0.4,
      r: size * 0.6,
      damage,
      life: visLife(HEURISTIC.life, state),
      pierce: HEURISTIC.pierce + state.player.stats.pierceBonus,
      hitTimer: 0,
      hitSet: new Set(),
      knockback: 80,
      size,
      color: "#a8ffe6",
      target: null,
      explodeRadius: 0,
      explodeDamage: 0,
      angle: a,
      spin: 6,
      hostile: false,
      alive: true,
    });
  }
  state.rngState = rng.state;
};

// ----- Tick -----

export const updateWeapons = (state: GameState, dt: number): void => {
  for (const w of state.weapons.values()) {
    const cd = baseCooldown(w) / state.player.stats.attackSpeedMul;
    w.cooldown -= dt;
    if (w.cooldown <= 0) {
      switch (w.id) {
        case "thread":
          fireThread(state, w);
          break;
        case "firewall":
          fireFirewall(state, w);
          break;
        case "antivirus":
          fireAntivirus(state, w);
          break;
        case "gc":
          fireGc(state, w);
          break;
        case "laser":
          fireLaser(state, w);
          break;
        case "debugger":
          fireDebugger(state, w);
          break;
        case "sentinel":
          fireSentinel(state, w);
          break;
        case "crypto":
          fireCrypto(state, w);
          break;
        case "hyperthread":
          fireHyperthread(state, w);
          break;
        case "perimeter":
          firePerimeter(state, w);
          break;
        case "heuristic":
          fireHeuristic(state, w);
          break;
      }
      w.cooldown += cd;
      if (w.cooldown < 0) w.cooldown = cd * 0.1;
    }
  }
};

const baseCooldown = (w: Weapon): number => {
  switch (w.id) {
    case "thread":
      return THREAD_LEVELS[w.level - 1].cooldown;
    case "firewall":
      return FIREWALL_LEVELS[w.level - 1].cooldown;
    case "antivirus":
      return ANTIVIRUS_LEVELS[w.level - 1].cooldown;
    case "gc":
      return GC_LEVELS[w.level - 1].cooldown;
    case "laser":
      return LASER_LEVELS[w.level - 1].cooldown;
    case "debugger":
      return DEBUGGER_LEVELS[w.level - 1].cooldown;
    case "sentinel":
      return SENTINEL_LEVELS[w.level - 1].cooldown;
    case "crypto":
      return CRYPTO_LEVELS[w.level - 1].cooldown;
    case "hyperthread":
      return HYPERTHREAD.cooldown;
    case "perimeter":
      return PERIMETER.cooldown;
    case "heuristic":
      return HEURISTIC.cooldown;
  }
};

// ----- Damage entry point -----

export const damageEnemy = (
  state: GameState,
  enemy: Enemy,
  amount: number,
  knockX: number,
  knockY: number,
  knockMag: number,
): void => {
  if (!enemy.alive) return;
  // Crit
  const stats = state.player.stats;
  let dmg = amount;
  let crit = false;
  // Use rng directly via Math.random for crits (cheap, doesn't need determinism)
  if (Math.random() < stats.critChance) {
    dmg *= stats.critMul;
    crit = true;
  }
  enemy.hp -= dmg;
  enemy.hitFlash = 0.12;
  state.totalDamage += dmg;

  // Apply knockback
  const len = Math.hypot(knockX, knockY) || 1;
  const force = enemy.isBoss ? knockMag * 0.15 : knockMag;
  enemy.knockback.x += (knockX / len) * force;
  enemy.knockback.y += (knockY / len) * force;

  // Damage text particle (only sometimes to avoid spam)
  if (crit || enemy.isBoss) {
    state.particles.push({
      kind: "text",
      x: enemy.x + (Math.random() - 0.5) * 10,
      y: enemy.y - enemy.r,
      vx: 0,
      vy: -40,
      life: 0.7,
      maxLife: 0.7,
      size: crit ? 16 : 12,
      color: crit ? "#ffe066" : "#ffffff",
      text: Math.round(dmg).toString(),
      alive: true,
    });
  }

  if (enemy.hp <= 0) {
    enemy.alive = false;
    state.player.killCount++;
    state.killsByKind[enemy.kind]++;
    // Drop XP
    spawnOrb(state, enemy.x, enemy.y, enemy.xp);
    // Burst particles
    spawnDeathParticles(state, enemy);
    if (enemy.isBoss) {
      // big explosion of orbs
      for (let i = 0; i < 15; i++) {
        const ang = Math.random() * TAU;
        const dist = 20 + Math.random() * 40;
        spawnOrb(
          state,
          enemy.x + Math.cos(ang) * dist,
          enemy.y + Math.sin(ang) * dist,
          5,
        );
      }
      state.camera.shake = Math.max(state.camera.shake, 18);
    }
  }
};

const spawnOrb = (state: GameState, x: number, y: number, value: number): void => {
  // Tiny offset
  state.orbs.push({
    id: newId(state),
    x: x + (Math.random() - 0.5) * 6,
    y: y + (Math.random() - 0.5) * 6,
    vx: (Math.random() - 0.5) * 60,
    vy: (Math.random() - 0.5) * 60,
    r: value >= 5 ? 7 : 5,
    value,
    attractTimer: 0,
    bob: Math.random() * TAU,
    alive: true,
  });
};

const spawnDeathParticles = (state: GameState, enemy: Enemy): void => {
  const n = enemy.isBoss ? 40 : 6;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const sp = 80 + Math.random() * 220;
    state.particles.push({
      kind: "spark",
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.3 + Math.random() * 0.4,
      maxLife: 0.7,
      size: 1.5 + Math.random() * 2,
      color: enemy.color,
      alive: true,
    });
  }
};

