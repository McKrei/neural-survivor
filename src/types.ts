// ===== Core math types =====

export interface Vec2 {
  x: number;
  y: number;
}

// ===== Entity types =====

export interface Entity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number; // collision radius
  alive: boolean;
}

export type EnemyKind =
  | "virus"
  | "bug"
  | "legacy"
  | "ddos"
  | "memleak" // mini-boss: memory leak
  | "trojan"; // mini-boss: trojan

export interface Enemy extends Entity {
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  damage: number; // contact dps to player
  speed: number;
  xp: number; // tokens dropped
  hitFlash: number; // seconds remaining
  isBoss: boolean;
  knockback: Vec2; // knockback velocity (decays)
  // AI state (used by some enemies)
  aiTimer: number;
  aiPhase: number;
  // visual
  color: string;
  accent: string;
  facing: number; // angle for shaped enemies
  // damage trail (for memleak)
  trailTimer: number;
}

export type ProjectileKind =
  | "thread" // multithread bullet
  | "antivirus" // homing
  | "laser" // straight piercing
  | "gc" // garbage collector AoE bomb
  | "sentinel" // orbital drone
  | "chain" // crypto chain segment (purely visual)
  | "trojan_shot"; // enemy projectile

export interface Projectile extends Entity {
  kind: ProjectileKind;
  damage: number;
  life: number; // seconds remaining
  pierce: number; // remaining pierces
  hitTimer: number; // re-hit cooldown for piercing weapons
  hitSet: Set<number>; // entity ids already hit (avoid multi-hit per frame)
  knockback: number;
  size: number; // visual radius (>= r often)
  color: string;
  // homing
  target: Enemy | null;
  // explosion on death (gc)
  explodeRadius: number;
  explodeDamage: number;
  // angular for visual spin
  angle: number;
  spin: number;
  // hostile?
  hostile: boolean;
  // Orbital radius (for sentinel-kind projectiles only)
  orbitR?: number;
}

export interface XPOrb extends Entity {
  value: number;
  attractTimer: number; // when > 0, magnetized toward player
  bob: number;
}

export type ParticleKind = "spark" | "ring" | "smoke" | "text";

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  text?: string;
  alive: boolean;
}

// ===== Player =====

export interface PlayerStats {
  // Base stats; effective stats are computed from these + upgrades
  maxHp: number;
  hpRegen: number; // per second
  speed: number; // px/s
  pickupRadius: number;
  damageMul: number; // multiplier on outgoing damage
  attackSpeedMul: number; // multiplier on weapon fire rate
  projectileSpeedMul: number;
  projectileSizeMul: number;
  areaMul: number; // affects firewall radius / explosion radius
  durationMul: number; // projectile life
  xpGainMul: number;
  armor: number; // flat damage reduction
  // weapon counts/specials
  threadExtra: number; // extra projectiles for "Многопоточность"
  pierceBonus: number; // extra pierces
  critChance: number; // 0..1
  critMul: number;
  luck: number; // upgrade rarity boost (0..1)
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  level: number;
  xp: number;
  xpToNext: number;
  totalXp: number;
  stats: PlayerStats;
  facing: number; // angle pointing toward last movement
  iframes: number; // invincibility seconds remaining
  damageTaken: number;
  killCount: number;
  alive: boolean;
}

// ===== Weapons =====

export type WeaponId =
  | "thread"
  | "firewall"
  | "antivirus"
  | "gc"
  | "laser"
  | "debugger"
  | "sentinel" // orbital drones around player
  | "crypto" // chain lightning
  // ----- Evolutions (final-form weapons unlocked by base + passive) -----
  | "hyperthread" // thread + gpu
  | "perimeter" // firewall + area
  | "heuristic"; // antivirus + augment

export interface Weapon {
  id: WeaponId;
  level: number; // 1..maxLevel
  cooldown: number; // seconds remaining until next fire
}

// ===== Upgrades =====

export type UpgradeKind = "weapon" | "passive";
export type Rarity = "common" | "rare" | "epic";

export interface UpgradeOption {
  id: string; // unique identifier (weapon id or passive id)
  kind: UpgradeKind;
  name: string; // "Многопоточность"
  desc: string; // localized description for current/next level
  level: number; // current level (0 if not yet acquired)
  maxLevel: number;
  rarity: Rarity;
  iconPath: string; // SVG path string for icon
  iconColor: string;
}

// ===== Game phase =====

export type GamePhase =
  | "menu"
  | "playing"
  | "levelup"
  | "paused"
  | "gameover"
  | "victory";

// ===== Wave / spawner =====

export interface SpawnTimer {
  timer: number; // seconds since spawn start
  baseInterval: number;
  interval: number; // current spawn interval (decays with difficulty)
  pendingBoss: boolean;
  nextBossAt: number; // time of next mini-boss
  bossesSpawned: number;
}

// ===== Camera =====

export interface Camera {
  x: number;
  y: number;
  shake: number; // magnitude in px, decays
  shakeDecay: number;
}

// ===== Game state =====

export interface GameState {
  phase: GamePhase;
  time: number; // gameplay seconds elapsed
  realTime: number; // wall-clock seconds since boot

  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  orbs: XPOrb[];
  particles: Particle[];

  weapons: Map<WeaponId, Weapon>;
  passiveLevels: Map<string, number>;

  spawn: SpawnTimer;
  camera: Camera;

  // Level-up queue: each level pending a choice
  pendingLevelUps: number;
  currentChoices: UpgradeOption[];
  hoveredChoice: number;

  // Stats / counters
  killsByKind: Record<EnemyKind, number>;
  totalDamage: number;
  startedAt: number;

  // Input snapshot (updated each frame)
  inputDir: Vec2;
  // Mouse-only mode: when true, player moves toward mouse position
  mouseAim: boolean;
  mouseWorld: Vec2;

  // Boss banner
  bossAnnounce: { name: string; time: number } | null;
  activeBoss: Enemy | null;

  // Toasts
  toasts: { id: number; text: string; tone: "info" | "warn"; t: number }[];

  // World bounds (effectively infinite, but enemies despawn far away)
  worldRadius: number;

  // Frame counter (for deterministic culling)
  frame: number;

  // Next entity id
  nextId: number;

  // RNG seed
  rngState: number;

  // Last frame timing for FPS readout
  fps: number;
  fpsFrames: number;
  fpsAccum: number;

  // Adaptive difficulty: smoothed kills/sec and damage/sec
  killRate: number;
  dpsRate: number;
  prevKillCount: number;
  prevTotalDamage: number;
}
