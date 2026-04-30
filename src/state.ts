// GameState construction and reset.

import { FIRST_BOSS_AT, PLAYER_BASE, PLAYER_RADIUS, WORLD_RADIUS } from "./balance";
import type { EnemyKind, GameState, PlayerStats } from "./types";

const initStats = (): PlayerStats => ({ ...PLAYER_BASE });

const initKills = (): Record<EnemyKind, number> => ({
  virus: 0,
  bug: 0,
  legacy: 0,
  ddos: 0,
  memleak: 0,
  trojan: 0,
});

export const createGameState = (): GameState => {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const stats = initStats();
  return {
    phase: "menu",
    time: 0,
    realTime: 0,

    player: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: PLAYER_RADIUS,
      hp: stats.maxHp,
      level: 1,
      xp: 0,
      xpToNext: 5,
      totalXp: 0,
      stats,
      facing: 0,
      iframes: 0,
      damageTaken: 0,
      killCount: 0,
      alive: true,
    },

    enemies: [],
    projectiles: [],
    orbs: [],
    particles: [],

    weapons: new Map(),
    passiveLevels: new Map(),

    spawn: {
      timer: 0,
      baseInterval: 1.0,
      interval: 1.0,
      pendingBoss: false,
      nextBossAt: FIRST_BOSS_AT,
      bossesSpawned: 0,
    },

    camera: { x: 0, y: 0, shake: 0, shakeDecay: 6 },

    pendingLevelUps: 0,
    currentChoices: [],
    hoveredChoice: 0,

    killsByKind: initKills(),
    totalDamage: 0,
    startedAt: 0,

    inputDir: { x: 0, y: 0 },
    mouseAim: false,
    mouseWorld: { x: 0, y: 0 },

    bossAnnounce: null,
    activeBoss: null,
    toasts: [],

    worldRadius: WORLD_RADIUS,

    frame: 0,
    nextId: 1,
    rngState: seed,

    fps: 0,
    fpsFrames: 0,
    fpsAccum: 0,
  };
};

/** Reset for a new run, keeping the same GameState reference. */
export const resetGameState = (state: GameState): void => {
  const fresh = createGameState();
  // Mutate state to fresh values (preserve references where possible)
  state.phase = "playing";
  state.time = 0;
  state.player = fresh.player;
  state.enemies = fresh.enemies;
  state.projectiles = fresh.projectiles;
  state.orbs = fresh.orbs;
  state.particles = fresh.particles;
  state.weapons = fresh.weapons;
  state.passiveLevels = fresh.passiveLevels;
  state.spawn = fresh.spawn;
  state.camera = fresh.camera;
  state.pendingLevelUps = 0;
  state.currentChoices = [];
  state.hoveredChoice = 0;
  state.killsByKind = initKills();
  state.totalDamage = 0;
  state.startedAt = state.realTime;
  state.bossAnnounce = null;
  state.activeBoss = null;
  state.toasts = [];
  state.frame = 0;
  state.nextId = 1;
  state.rngState = fresh.rngState;
  state.fps = 0;
  state.fpsFrames = 0;
  state.fpsAccum = 0;

  // Give the player a starting weapon.
  state.weapons.set("thread", { id: "thread", level: 1, cooldown: 0.4 });
};
