// Tuning constants. Keep all magic numbers here for easy balancing.

import type { EnemyKind } from "./types";

// ----- Player -----
export const PLAYER_BASE = {
  maxHp: 120,
  hpRegen: 0.6,
  speed: 220, // px/s
  pickupRadius: 110,
  damageMul: 1,
  attackSpeedMul: 1,
  projectileSpeedMul: 1,
  projectileSizeMul: 1,
  areaMul: 1,
  durationMul: 1,
  xpGainMul: 1,
  armor: 0,
  threadExtra: 0,
  pierceBonus: 0,
  critChance: 0.05,
  critMul: 1.5,
  luck: 0,
};

export const PLAYER_RADIUS = 14;
export const PLAYER_IFRAMES = 0.55;
export const PLAYER_KNOCKBACK_RES = 0.85; // multiplier per frame on player knockback (unused, but in case)

// ----- XP curve -----
// Geometric-ish curve: tier-based scaling like Vampire Survivors.
export const xpToNext = (level: number): number => {
  if (level <= 1) return 5;
  if (level <= 20) return Math.floor(5 + (level - 1) * 10); // 15, 25, ... 195
  if (level <= 40) return Math.floor(195 + (level - 20) * 13);
  return Math.floor(455 + (level - 40) * 16);
};

// ----- Enemy stats -----
// Stats at "base" difficulty (t = 0). They scale with time.

export interface EnemyDef {
  kind: EnemyKind;
  hp: number;
  damage: number;
  speed: number;
  r: number;
  xp: number;
  color: string;
  accent: string;
  isBoss: boolean;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  virus: {
    kind: "virus",
    hp: 8,
    damage: 6,
    speed: 75,
    r: 11,
    xp: 1,
    color: "#7fff7a",
    accent: "#22aa44",
    isBoss: false,
  },
  bug: {
    kind: "bug",
    hp: 14,
    damage: 8,
    speed: 65,
    r: 13,
    xp: 2,
    color: "#ff8a4d",
    accent: "#aa4422",
    isBoss: false,
  },
  legacy: {
    kind: "legacy",
    hp: 60,
    damage: 12,
    speed: 38,
    r: 18,
    xp: 5,
    color: "#888fa0",
    accent: "#444b5c",
    isBoss: false,
  },
  ddos: {
    kind: "ddos",
    hp: 5,
    damage: 5,
    speed: 130,
    r: 9,
    xp: 1,
    color: "#ffe066",
    accent: "#a07b22",
    isBoss: false,
  },
  memleak: {
    kind: "memleak",
    hp: 800,
    damage: 18,
    speed: 50,
    r: 38,
    xp: 80,
    color: "#c47bff",
    accent: "#5a228a",
    isBoss: true,
  },
  trojan: {
    kind: "trojan",
    hp: 1100,
    damage: 22,
    speed: 60,
    r: 32,
    xp: 100,
    color: "#ff5577",
    accent: "#7a1130",
    isBoss: true,
  },
};

// Difficulty curve. Returns multiplier for HP/damage/speed scaling.
// At t=0 → 1.0. At t=300s → ~3.5x HP, ~1.8x damage, ~1.4x speed.
export const enemyHpMul = (t: number): number => 1 + t / 60 + (t * t) / 50000;
export const enemyDamageMul = (t: number): number => 1 + t / 240;
export const enemySpeedMul = (t: number): number =>
  Math.min(1.6, 1 + t / 480);

// Spawn rate (enemies per second) grows with time.
// At t=0 → 0.6/s (gentle start), at 60s → ~2/s, at 180s → ~5/s, at 300s → ~8/s.
// Capped to prevent total mayhem after 6+ minutes.
export const spawnRate = (t: number): number =>
  Math.min(15, 0.6 + t / 45 + (t * t) / 14000);

// Game duration (victory threshold).
export const VICTORY_TIME = 600; // 10 minutes

// Cap concurrent enemies for safety.
export const MAX_ENEMIES = 800;

// Enemy kind weights at given time (controls composition over time).
export const enemyWeights = (
  t: number,
): { kind: EnemyKind; weight: number }[] => {
  const virus = Math.max(0.3, 4 - t / 30);
  const bug = t < 30 ? 0 : 2 + Math.min(2, (t - 30) / 60);
  const ddos = t < 60 ? 0 : 1.5 + Math.min(2, (t - 60) / 90);
  const legacy = t < 120 ? 0 : 1 + Math.min(2, (t - 120) / 120);
  return [
    { kind: "virus", weight: virus },
    { kind: "bug", weight: bug },
    { kind: "ddos", weight: ddos },
    { kind: "legacy", weight: legacy },
  ];
};

// Mini-boss schedule: every BOSS_INTERVAL seconds.
export const BOSS_INTERVAL = 90; // seconds
export const FIRST_BOSS_AT = 75; // first one slightly earlier

// ----- World -----
export const SPAWN_RING_MIN = 520; // beyond viewport edge
export const SPAWN_RING_MAX = 720;
export const DESPAWN_RADIUS = 1400; // enemies further than this get culled
export const WORLD_RADIUS = 100000; // soft world bound (just for info)

// ----- XP orb -----
export const ORB_PICKUP_TIME = 0.25; // smoothing time for magnet
export const ORB_LIFETIME = 60; // disappears after a minute (rare)

// ----- Camera shake on damage taken -----
export const SHAKE_HIT = 6;
export const SHAKE_BOSS = 14;
