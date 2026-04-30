// Enemy spawning and AI.

import {
  adaptiveHpBoost,
  adaptiveSpawnBoost,
  BOSS_INTERVAL,
  DESPAWN_RADIUS,
  enemyDamageMul,
  enemyHpMul,
  enemySpeedMul,
  enemyWeights,
  ENEMY_DEFS,
  MAX_ENEMIES,
  spawnRate,
  SPAWN_RING_MAX,
  SPAWN_RING_MIN,
  SHAKE_BOSS,
} from "./balance";
import { T } from "./texts";
import type { Enemy, EnemyKind, GameState, Projectile } from "./types";
import { dist, rngPickWeighted, rngRange, SpatialHash, TAU } from "./utils";

const nextId = (state: GameState): number => {
  state.nextId++;
  return state.nextId;
};

const makeEnemy = (state: GameState, kind: EnemyKind, x: number, y: number): Enemy => {
  const def = ENEMY_DEFS[kind];
  const hpScale = enemyHpMul(state.time);
  const dmgScale = enemyDamageMul(state.time);
  const spdScale = enemySpeedMul(state.time);
  // Anti-snowball: scale enemy HP up with player DPS so over-stacked builds
  // still face meaningful resistance.
  const dpsBoost = adaptiveHpBoost(state.dpsRate);
  const hp = def.hp *
    (def.isBoss
      ? hpScale * (1 + state.spawn.bossesSpawned * 0.6) * Math.min(2, dpsBoost)
      : hpScale * dpsBoost);
  const speed = def.speed * (def.isBoss ? Math.min(1.3, spdScale) : spdScale);
  const damage = def.damage * (def.isBoss ? dmgScale * 1.1 : dmgScale);

  return {
    id: nextId(state),
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    r: def.r,
    hp,
    maxHp: hp,
    damage,
    speed,
    xp: def.xp,
    hitFlash: 0,
    isBoss: def.isBoss,
    knockback: { x: 0, y: 0 },
    aiTimer: 0,
    aiPhase: 0,
    color: def.color,
    accent: def.accent,
    facing: 0,
    trailTimer: 0,
    alive: true,
  };
};

// Pick a spawn position outside camera bounds at random angle.
const pickSpawnPos = (state: GameState): { x: number; y: number } => {
  const rng = { state: state.rngState };
  const a = rngRange(rng, 0, TAU);
  const r = rngRange(rng, SPAWN_RING_MIN, SPAWN_RING_MAX);
  state.rngState = rng.state;
  return {
    x: state.player.x + Math.cos(a) * r,
    y: state.player.y + Math.sin(a) * r,
  };
};

export const spawnEnemy = (state: GameState, kind: EnemyKind): Enemy => {
  const pos = pickSpawnPos(state);
  const e = makeEnemy(state, kind, pos.x, pos.y);
  state.enemies.push(e);
  return e;
};

export const spawnBoss = (state: GameState): Enemy => {
  const rng = { state: state.rngState };
  state.spawn.bossesSpawned++;
  // Alternate types after the first
  const kind: EnemyKind = state.spawn.bossesSpawned % 2 === 1 ? "memleak" : "trojan";
  state.rngState = rng.state;
  const pos = pickSpawnPos(state);
  const e = makeEnemy(state, kind, pos.x, pos.y);
  state.enemies.push(e);
  state.activeBoss = e;
  state.bossAnnounce = { name: T.bossNames[kind] ?? kind, time: 3.0 };
  state.toasts.push({
    id: state.frame,
    text: T.toastBoss(T.bossNames[kind] ?? kind),
    tone: "warn",
    t: 3,
  });
  state.camera.shake = Math.max(state.camera.shake, SHAKE_BOSS);
  return e;
};

// ----- Spawning loop (waves) -----

export const updateSpawning = (state: GameState, dt: number): void => {
  state.spawn.timer += dt;

  // Compute interval from spawn rate, scaled by adaptive kill rate.
  const rate = spawnRate(state.time) * adaptiveSpawnBoost(state.killRate);
  const targetInterval = 1 / Math.max(0.5, rate);

  // Smooth toward target interval to avoid jitter.
  state.spawn.interval = targetInterval;

  // Boss schedule.
  if (state.time >= state.spawn.nextBossAt && !state.activeBoss) {
    spawnBoss(state);
    state.spawn.nextBossAt = state.time + BOSS_INTERVAL;
  }

  // Spawn enemies based on interval.
  // Use accumulator pattern to handle very short intervals.
  let spawnAccum = state.spawn.timer;
  while (spawnAccum >= state.spawn.interval && state.enemies.length < MAX_ENEMIES) {
    spawnAccum -= state.spawn.interval;
    const weights = enemyWeights(state.time);
    const rng = { state: state.rngState };
    const picked = rngPickWeighted(
      rng,
      weights.map((w) => w.kind),
      weights.map((w) => w.weight),
    );
    state.rngState = rng.state;
    if (picked) spawnEnemy(state, picked);
  }
  state.spawn.timer = spawnAccum;

  // Burst spawns at certain milestones for excitement
  if (state.time > 0) {
    const minute = Math.floor(state.time / 60);
    const prevMinute = Math.floor((state.time - dt) / 60);
    if (minute > prevMinute) {
      // Spawn a wave burst of viruses on each new minute
      const burst = Math.min(40, 8 + minute * 6);
      for (let i = 0; i < burst; i++) {
        if (state.enemies.length >= MAX_ENEMIES) break;
        spawnEnemy(state, "virus");
      }
    }
  }
};

// ----- Enemy AI / movement -----

const seekPlayer = (e: Enemy, state: GameState, dt: number): void => {
  const px = state.player.x;
  const py = state.player.y;
  const dx = px - e.x;
  const dy = py - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const tx = dx / d;
  const ty = dy / d;

  // Smooth velocity toward direction at e.speed
  const targetVx = tx * e.speed;
  const targetVy = ty * e.speed;
  const accel = 8 * dt;
  e.vx += (targetVx - e.vx) * Math.min(1, accel);
  e.vy += (targetVy - e.vy) * Math.min(1, accel);

  // Add knockback
  e.x += (e.vx + e.knockback.x) * dt;
  e.y += (e.vy + e.knockback.y) * dt;

  // Decay knockback exponentially
  const decay = Math.exp(-6 * dt);
  e.knockback.x *= decay;
  e.knockback.y *= decay;
  if (Math.abs(e.knockback.x) < 0.5) e.knockback.x = 0;
  if (Math.abs(e.knockback.y) < 0.5) e.knockback.y = 0;

  e.facing = Math.atan2(ty, tx);
};

// Trojan: orbit player at a distance, fire shots at intervals.
const aiTrojan = (e: Enemy, state: GameState, dt: number): void => {
  const px = state.player.x;
  const py = state.player.y;
  const dx = px - e.x;
  const dy = py - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const desired = 320; // orbit distance
  // Tangent direction (perpendicular).
  const tx = -dy / d;
  const ty = dx / d;
  // Combine: approach if too far, retreat if too close, otherwise tangential.
  const radial = (d - desired) / 200; // -1..+1 mostly
  const sign = radial > 0 ? 1 : -1;
  const radialFactor = Math.min(1, Math.abs(radial));
  const dirX = tx * (1 - radialFactor) + (dx / d) * sign * radialFactor;
  const dirY = ty * (1 - radialFactor) + (dy / d) * sign * radialFactor;
  const targetVx = dirX * e.speed;
  const targetVy = dirY * e.speed;
  const accel = 6 * dt;
  e.vx += (targetVx - e.vx) * Math.min(1, accel);
  e.vy += (targetVy - e.vy) * Math.min(1, accel);
  e.x += (e.vx + e.knockback.x) * dt;
  e.y += (e.vy + e.knockback.y) * dt;
  const decay = Math.exp(-6 * dt);
  e.knockback.x *= decay;
  e.knockback.y *= decay;
  e.facing = Math.atan2(dirY, dirX);

  e.aiTimer -= dt;
  if (e.aiTimer <= 0) {
    e.aiTimer = 1.4;
    // Fire 5 shots in a spread toward player
    const ang = Math.atan2(dy, dx);
    const count = 5;
    const spread = 0.32;
    for (let i = 0; i < count; i++) {
      const a = ang + (i - (count - 1) / 2) * spread;
      const speed = 240;
      const p: Projectile = {
        id: nextId(state),
        kind: "trojan_shot",
        x: e.x + Math.cos(a) * (e.r + 4),
        y: e.y + Math.sin(a) * (e.r + 4),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: 6,
        damage: e.damage * 0.6,
        life: 3,
        pierce: 0,
        hitTimer: 0,
        hitSet: new Set(),
        knockback: 0,
        size: 7,
        color: "#ff8aa3",
        target: null,
        explodeRadius: 0,
        explodeDamage: 0,
        angle: a,
        spin: 0,
        hostile: true,
        alive: true,
      };
      state.projectiles.push(p);
    }
  }
};

// Memleak: leaves damaging trail every interval.
const aiMemleak = (e: Enemy, state: GameState, dt: number): void => {
  seekPlayer(e, state, dt);
  e.trailTimer -= dt;
  if (e.trailTimer <= 0) {
    e.trailTimer = 0.6;
    // Spawn a stationary projectile that lingers.
    const p: Projectile = {
      id: nextId(state),
      kind: "trojan_shot", // re-use type, but we make it visually a blob via color
      x: e.x,
      y: e.y,
      vx: 0,
      vy: 0,
      r: 32,
      damage: e.damage * 0.4,
      life: 3.5,
      pierce: 9999,
      hitTimer: 0,
      hitSet: new Set(),
      knockback: 0,
      size: 32,
      color: "#a04dff",
      target: null,
      explodeRadius: 0,
      explodeDamage: 0,
      angle: 0,
      spin: 0,
      hostile: true,
      alive: true,
    };
    state.projectiles.push(p);
  }
};

export const updateEnemies = (state: GameState, dt: number): void => {
  // Cull far-away enemies (beyond despawn) — but never the boss.
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (!e.isBoss) {
      const d = dist(e.x, e.y, state.player.x, state.player.y);
      if (d > DESPAWN_RADIUS) {
        // Wrap them to a fresh ring spawn point closer instead of deleting.
        const a = Math.atan2(state.player.y - e.y, state.player.x - e.x);
        e.x = state.player.x - Math.cos(a) * (SPAWN_RING_MAX - 50);
        e.y = state.player.y - Math.sin(a) * (SPAWN_RING_MAX - 50);
      }
    }

    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

    switch (e.kind) {
      case "trojan":
        aiTrojan(e, state, dt);
        break;
      case "memleak":
        aiMemleak(e, state, dt);
        break;
      default:
        seekPlayer(e, state, dt);
    }
  }

  // Avoid overlapping pile-up: simple separation pass on close pairs (not full N²).
  // Use the spatial hash externally; here we just nudge based on chunked sample.
  // (Implemented in collision step instead.)

  // Compact dead enemies after damage/cleanup pass at end of frame
  // (Done from main systems update.)
  if (state.activeBoss && !state.activeBoss.alive) {
    state.toasts.push({
      id: state.frame,
      text: T.toastBossDown(T.bossNames[state.activeBoss.kind] ?? state.activeBoss.kind),
      tone: "info",
      t: 3,
    });
    state.activeBoss = null;
  }
};

// Resolve circle-circle separation between enemies using a spatial hash so
// each enemy is tested only against true spatial neighbours. Strong push so
// enemies don't pile into a single dot.
const separationGrid = new SpatialHash<{ x: number; y: number; r: number; ref: number }>(72);

export const separateEnemies = (state: GameState, dt: number): void => {
  const list = state.enemies;
  const n = list.length;
  if (n < 2) return;

  separationGrid.clear();
  for (let i = 0; i < n; i++) {
    const e = list[i];
    if (!e.alive) continue;
    separationGrid.insert({ x: e.x, y: e.y, r: e.r, ref: i });
  }

  for (let i = 0; i < n; i++) {
    const a = list[i];
    if (!a.alive) continue;
    // Bosses don't get pushed (heavy mass).
    const aMass = a.isBoss ? 0 : 1;
    const queryR = a.r + 28;
    separationGrid.query(a.x, a.y, queryR, (h) => {
      if (h.ref <= i) return; // each pair handled once
      const b = list[h.ref];
      if (!b.alive) return;
      const bMass = b.isBoss ? 0 : 1;
      if (aMass + bMass === 0) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rs = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < rs * rs) {
        const d = Math.sqrt(d2) || 0.001;
        const overlap = rs - d;
        const nx = dx / d;
        const ny = dy / d;
        // Strong, frame-rate-independent push capped per frame to avoid jitter.
        const push = Math.min(overlap, overlap * dt * 24 + overlap * 0.5);
        const aShare = bMass / (aMass + bMass);
        const bShare = aMass / (aMass + bMass);
        a.x -= nx * push * aShare;
        a.y -= ny * push * aShare;
        b.x += nx * push * bShare;
        b.y += ny * push * bShare;
      }
    });
  }
};

