// Systems: movement, projectile updates, collisions, pickups, lifecycle.

import {
  ORB_LIFETIME,
  PLAYER_IFRAMES,
  SHAKE_HIT,
  VICTORY_TIME,
} from "./balance";
import { separateEnemies, updateEnemies, updateSpawning } from "./enemies";
import { xpToNext } from "./balance";
import { pickChoices } from "./upgrades";
import type { GameState } from "./types";
import { damageEnemy } from "./weapons";
import { updateWeapons } from "./weapons";
import { dist2, SpatialHash, TAU } from "./utils";

// Reusable spatial hash (keeps allocation low across frames).
const enemyGrid = new SpatialHash<{ x: number; y: number; r: number; ref: number }>(96);

export const updatePlayerMovement = (state: GameState, dt: number): void => {
  const p = state.player;
  if (!p.alive) return;
  const stats = p.stats;
  // Smooth the input direction into velocity
  const targetVx = state.inputDir.x * stats.speed;
  const targetVy = state.inputDir.y * stats.speed;
  const accel = 12 * dt;
  p.vx += (targetVx - p.vx) * Math.min(1, accel);
  p.vy += (targetVy - p.vy) * Math.min(1, accel);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (state.inputDir.x !== 0 || state.inputDir.y !== 0) {
    p.facing = Math.atan2(state.inputDir.y, state.inputDir.x);
  }
  if (p.iframes > 0) p.iframes -= dt;
  // Regen
  if (p.hp < stats.maxHp) {
    p.hp = Math.min(stats.maxHp, p.hp + stats.hpRegen * dt);
  }
};

export const updateCamera = (state: GameState, dt: number): void => {
  const p = state.player;
  // Lerp toward player
  const lerp = Math.min(1, dt * 8);
  state.camera.x += (p.x - state.camera.x) * lerp;
  state.camera.y += (p.y - state.camera.y) * lerp;
  // Decay shake
  if (state.camera.shake > 0) {
    state.camera.shake = Math.max(0, state.camera.shake - state.camera.shakeDecay * dt);
  }
};

// ----- Projectile motion + collisions -----

export const updateProjectiles = (state: GameState, dt: number): void => {
  // Build enemy spatial hash for this frame
  enemyGrid.clear();
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (!e.alive) continue;
    enemyGrid.insert({ x: e.x, y: e.y, r: e.r, ref: i });
  }

  for (const p of state.projectiles) {
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) {
      // Handle gc explosion on fuse expiry
      if (p.kind === "gc") {
        explodeGc(state, p.x, p.y, p.explodeRadius, p.explodeDamage);
      }
      p.alive = false;
      continue;
    }

    // Spin (visual)
    p.angle += p.spin * dt;

    // Movement (homing for antivirus)
    if (p.kind === "antivirus") {
      // Acquire target if missing or dead
      if (!p.target || !p.target.alive) {
        let bestD = 600 * 600;
        let best: typeof p.target = null;
        enemyGrid.query(p.x, p.y, 600, (h) => {
          const e = state.enemies[h.ref];
          if (!e.alive) return;
          const d = dist2(p.x, p.y, e.x, e.y);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        });
        p.target = best;
      }
      if (p.target) {
        const dx = p.target.x - p.x;
        const dy = p.target.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const speed = Math.hypot(p.vx, p.vy) || 1;
        const tx = (dx / d) * speed;
        const ty = (dy / d) * speed;
        const t = Math.min(1, dt * 5);
        p.vx += (tx - p.vx) * t;
        p.vy += (ty - p.vy) * t;
      }
    } else if (p.kind === "gc") {
      // Slow ballistic — decelerate
      p.vx *= Math.pow(0.05, dt);
      p.vy *= Math.pow(0.05, dt);
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Hostile projectiles: collide with player
    if (p.hostile) {
      const dx = p.x - state.player.x;
      const dy = p.y - state.player.y;
      const rs = p.r + state.player.r;
      if (dx * dx + dy * dy < rs * rs) {
        damagePlayer(state, p.damage);
        if (p.pierce <= 0) {
          p.alive = false;
          continue;
        }
      }
      continue;
    }

    // Player projectiles: collide with enemies via grid query
    let alive = true;
    p.hitTimer -= dt;
    enemyGrid.query(p.x, p.y, p.r + 30, (h) => {
      if (!alive) return;
      const e = state.enemies[h.ref];
      if (!e.alive) return;
      // Avoid double-hits per piercing projectile
      if (p.hitSet.has(e.id)) return;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const rs = p.r + e.r;
      if (dx * dx + dy * dy < rs * rs) {
        damageEnemy(state, e, p.damage, dx, dy, p.knockback);
        p.hitSet.add(e.id);
        if (p.pierce <= 0) {
          alive = false;
        } else {
          p.pierce--;
        }
      }
    });
    if (!alive) p.alive = false;
  }
};

// ----- GC explosion -----

const explodeGc = (
  state: GameState,
  x: number,
  y: number,
  radius: number,
  damage: number,
): void => {
  enemyGrid.query(x, y, radius, (h) => {
    const e = state.enemies[h.ref];
    if (!e.alive) return;
    const dx = e.x - x;
    const dy = e.y - y;
    if (dx * dx + dy * dy < radius * radius) {
      damageEnemy(state, e, damage, dx, dy, 200);
    }
  });
  // Visual: ring particle
  state.particles.push({
    kind: "ring",
    x,
    y,
    vx: 0,
    vy: 0,
    life: 0.55,
    maxLife: 0.55,
    size: radius,
    color: "rgba(255, 179, 71, 0.65)",
    alive: true,
  });
  // Sparks
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * TAU;
    const sp = 200 + Math.random() * 220;
    state.particles.push({
      kind: "spark",
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.5,
      maxLife: 0.5,
      size: 2,
      color: "#ffb347",
      alive: true,
    });
  }
  state.camera.shake = Math.max(state.camera.shake, 6);
};

// ----- Player vs enemy contact -----

const damagePlayer = (state: GameState, amount: number): void => {
  const p = state.player;
  if (p.iframes > 0 || !p.alive) return;
  let dmg = Math.max(1, amount - p.stats.armor);
  p.hp -= dmg;
  p.damageTaken += dmg;
  p.iframes = PLAYER_IFRAMES;
  state.camera.shake = Math.max(state.camera.shake, SHAKE_HIT);
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    state.phase = "gameover";
    // Big death particles
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * TAU;
      const sp = 100 + Math.random() * 320;
      state.particles.push({
        kind: "spark",
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.6 + Math.random() * 0.6,
        maxLife: 1.2,
        size: 2 + Math.random() * 2,
        color: "#00ffd0",
        alive: true,
      });
    }
  }
};

export const updatePlayerCollisions = (state: GameState): void => {
  if (!state.player.alive) return;
  const p = state.player;
  enemyGrid.query(p.x, p.y, p.r + 30, (h) => {
    const e = state.enemies[h.ref];
    if (!e.alive) return;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const rs = p.r + e.r - 2;
    if (dx * dx + dy * dy < rs * rs) {
      damagePlayer(state, e.damage * 0.45); // contact damage scaled
    }
  });
};

// ----- Orbs (XP pickups) -----

export const updateOrbs = (state: GameState, dt: number): void => {
  const p = state.player;
  const pickup = p.stats.pickupRadius;
  for (const o of state.orbs) {
    if (!o.alive) continue;
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const d2 = dx * dx + dy * dy;
    // Magnetize within pickup radius
    if (d2 < pickup * pickup) {
      o.attractTimer = 1;
    }
    if (o.attractTimer > 0) {
      const d = Math.sqrt(d2) || 1;
      const speed = 380 + (1 - d / pickup) * 220;
      o.vx += (dx / d) * speed * dt;
      o.vy += (dy / d) * speed * dt;
      // Drag
      o.vx *= Math.pow(0.001, dt);
      o.vy *= Math.pow(0.001, dt);
    } else {
      // Friction
      o.vx *= Math.pow(0.05, dt);
      o.vy *= Math.pow(0.05, dt);
    }
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    o.bob += dt * 4;

    // Pickup on direct contact
    const rsum = o.r + p.r;
    if (d2 < rsum * rsum) {
      o.alive = false;
      const gained = Math.max(1, Math.floor(o.value * p.stats.xpGainMul));
      gainXp(state, gained);
    }

    // Lifetime cap (in case orbs are far in the wild)
    o.attractTimer = Math.max(0, o.attractTimer - dt * 0.0); // never decays now
    // soft expiry
    if (state.time - o.bob / 4 > ORB_LIFETIME) {
      // unused; orbs persist for full run
    }
  }
};

const gainXp = (state: GameState, amount: number): void => {
  const p = state.player;
  p.xp += amount;
  p.totalXp += amount;
  while (p.xp >= p.xpToNext) {
    p.xp -= p.xpToNext;
    p.level++;
    p.xpToNext = xpToNext(p.level);
    state.pendingLevelUps++;
    // Heal a tiny bit on level
    p.hp = Math.min(p.stats.maxHp, p.hp + 5);
  }
};

// Open the level-up overlay if there's a pending level and we're playing.
export const tickLevelUpQueue = (state: GameState): void => {
  if (state.phase !== "playing") return;
  if (state.pendingLevelUps > 0 && state.currentChoices.length === 0) {
    const choices = pickChoices(state, 3);
    if (choices.length === 0) {
      // No upgrades to pick — just consume.
      state.pendingLevelUps--;
      return;
    }
    state.currentChoices = choices;
    state.hoveredChoice = 0;
    state.phase = "levelup";
  }
};

// ----- Particles -----

export const updateParticles = (state: GameState, dt: number): void => {
  for (const p of state.particles) {
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.alive = false;
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === "spark") {
      p.vx *= Math.pow(0.05, dt);
      p.vy *= Math.pow(0.05, dt);
    } else if (p.kind === "smoke") {
      p.vx *= Math.pow(0.5, dt);
      p.vy *= Math.pow(0.5, dt);
    }
  }
};

// ----- Toasts / boss banner -----

export const updateBanners = (state: GameState, dt: number): void => {
  if (state.bossAnnounce) {
    state.bossAnnounce.time -= dt;
    if (state.bossAnnounce.time <= 0) state.bossAnnounce = null;
  }
  for (const t of state.toasts) {
    t.t -= dt;
  }
  state.toasts = state.toasts.filter((t) => t.t > 0);
};

// ----- Garbage collection: compact dead entity arrays in place -----

const compact = <T extends { alive: boolean }>(arr: T[]): T[] => {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].alive) {
      if (w !== i) arr[w] = arr[i];
      w++;
    }
  }
  arr.length = w;
  return arr;
};

export const compactAll = (state: GameState): void => {
  compact(state.enemies);
  compact(state.projectiles);
  compact(state.orbs);
  compact(state.particles);
};

// ----- Master tick (one fixed step) -----

export const stepGame = (state: GameState, dt: number): void => {
  if (state.phase !== "playing") return;

  state.time += dt;
  state.frame++;

  updatePlayerMovement(state, dt);
  updateSpawning(state, dt);
  updateEnemies(state, dt);
  separateEnemies(state, dt);
  updateWeapons(state, dt);
  updateProjectiles(state, dt);
  updatePlayerCollisions(state);
  updateOrbs(state, dt);
  updateParticles(state, dt);
  updateCamera(state, dt);
  updateBanners(state, dt);

  // Compact every few frames
  if (state.frame % 4 === 0) compactAll(state);

  tickLevelUpQueue(state);

  // Victory condition
  if (state.time >= VICTORY_TIME && state.phase === "playing") {
    state.phase = "victory";
  }
};
