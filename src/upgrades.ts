// Upgrade definitions: weapons and passive modules.
// Each upgrade has up to 5 levels, with a localized Russian description.

import { softCap, STAT_CAPS } from "./balance";
import type {
  GameState,
  PlayerStats,
  Rarity,
  UpgradeOption,
  WeaponId,
} from "./types";
import { rngNext, rngPickWeighted } from "./utils";

export type PassiveId =
  | "gpu" // attack speed
  | "weights" // damage
  | "cache" // max hp
  | "regen" // hp regen
  | "optim" // movement
  | "tpu" // pickup radius
  | "compress" // projectile size
  | "bandwidth" // projectile speed
  | "augment" // xp gain
  | "armor"
  | "luck" // crit
  | "area" // area
  | "duration"; // duration

export const WEAPON_IDS: WeaponId[] = [
  "thread",
  "firewall",
  "antivirus",
  "gc",
  "laser",
  "debugger",
  "sentinel",
  "crypto",
];

// Evolutions: base weapon at MAX_LEVEL + required passive at MAX_LEVEL → unlock.
// Each evolution replaces its base weapon when picked.
export interface EvolutionDef {
  id: WeaponId;
  base: WeaponId;
  passive: PassiveId;
  name: string;
  description: string;
  iconPath: string;
  iconColor: string;
}

export const EVOLUTIONS: EvolutionDef[] = [
  {
    id: "hyperthread",
    base: "thread",
    passive: "gpu",
    name: "Гиперпоток",
    description:
      "Эволюция: непрерывный поток снарядов во все стороны. Прошивает строй насквозь.",
    iconPath: "M 4 6 H 20 M 4 12 H 20 M 4 18 H 20 M 8 4 V 20 M 12 4 V 20 M 16 4 V 20",
    iconColor: "#9bf6ff",
  },
  {
    id: "perimeter",
    base: "firewall",
    passive: "area",
    name: "Защитный периметр",
    description:
      "Эволюция: огромный многослойный фаервол, выжигающий всё вокруг. Поджигает врагов.",
    iconPath:
      "M 12 2 L 22 6 V 12 C 22 18 17 22 12 22 C 7 22 2 18 2 12 V 6 Z M 12 7 L 18 9 V 12 C 18 15 15 17 12 18 C 9 17 6 15 6 12 V 9 Z",
    iconColor: "#ffac4d",
  },
  {
    id: "heuristic",
    base: "antivirus",
    passive: "augment",
    name: "Эвристический сканер",
    description:
      "Эволюция: рой самонаводящихся зондов с гарантированным критом по угрозе.",
    iconPath:
      "M 12 2 L 14 8 L 22 9 L 16 13 L 18 22 L 12 17 L 6 22 L 8 13 L 2 9 L 10 8 Z",
    iconColor: "#a8ffe6",
  },
];

export const PASSIVE_IDS: PassiveId[] = [
  "gpu",
  "weights",
  "cache",
  "regen",
  "optim",
  "tpu",
  "compress",
  "bandwidth",
  "augment",
  "armor",
  "luck",
  "area",
  "duration",
];

export const MAX_LEVEL = 5;

// ----- Names & icons (SVG path 'd' for a 24x24 viewbox, drawn centered)

interface UpgradeMeta {
  id: string;
  name: string;
  // descriptions[i] applies when going from level i to level i+1
  descriptions: string[];
  iconPath: string;
  iconColor: string;
  baseRarity: Rarity;
}

// Weapons (base weapons only; evolutions live in EVOLUTIONS).
const WEAPON_META: Partial<Record<WeaponId, UpgradeMeta>> = {
  thread: {
    id: "thread",
    name: "Многопоточность",
    descriptions: [
      "Запускает основной поток снарядов в направлении движения. +1 поток.",
      "Параллелизация: +1 поток выстрела одновременно.",
      "Урон каждого потока +30%.",
      "+1 поток. Снаряды проходят через 1 врага.",
      "Скорость стрельбы +35%, +2 пробития.",
    ],
    iconPath:
      "M 4 12 H 20 M 4 6 H 20 M 4 18 H 20 M 8 4 V 20 M 16 4 V 20",
    iconColor: "#6cf",
    baseRarity: "common",
  },
  firewall: {
    id: "firewall",
    name: "Файрвол",
    descriptions: [
      "Создаёт защитный барьер. Наносит урон врагам в радиусе действия.",
      "Радиус действия +20%. Урон +25%.",
      "Тики чаще на 30%.",
      "Радиус +25%. Урон +30%.",
      "Радиус +30%. Урон +50%. Поджигает врагов.",
    ],
    iconPath:
      "M 12 3 L 21 7 V 12 C 21 17 17 21 12 21 C 7 21 3 17 3 12 V 7 Z",
    iconColor: "#ff7a4d",
    baseRarity: "common",
  },
  antivirus: {
    id: "antivirus",
    name: "Антивирус",
    descriptions: [
      "Запускает самонаводящийся пакет. Ищет ближайшую угрозу.",
      "+1 пакет за залп. Урон +20%.",
      "Скорость стрельбы +30%. Скорость пакета +20%.",
      "+1 пакет. Урон +30%.",
      "+2 пакета. Огромный урон +60%.",
    ],
    iconPath:
      "M 12 3 L 14 9 L 21 9 L 15 13 L 17 20 L 12 16 L 7 20 L 9 13 L 3 9 L 10 9 Z",
    iconColor: "#7fffd4",
    baseRarity: "rare",
  },
  gc: {
    id: "gc",
    name: "Сборщик мусора",
    descriptions: [
      "Сбрасывает GC-бомбу. Взрывается с задержкой, очищая область.",
      "Радиус взрыва +25%. Урон +25%.",
      "Скорость сбросов +30%.",
      "Радиус +20%. +1 бомба за цикл.",
      "+1 бомба. Урон +50%. Взрыв оставляет след.",
    ],
    iconPath:
      "M 5 6 H 19 L 17 20 H 7 Z M 9 6 V 3 H 15 V 6 M 9 10 V 17 M 12 10 V 17 M 15 10 V 17",
    iconColor: "#ffb347",
    baseRarity: "rare",
  },
  laser: {
    id: "laser",
    name: "Лазер",
    descriptions: [
      "Точечный лазер по ближайшему врагу. Пробивает несколько целей.",
      "Урон +30%. +1 пробитие.",
      "Скорость стрельбы +35%.",
      "Толщина луча +30%. Урон +25%.",
      "+1 луч. Урон +40%. Прожигает броню.",
    ],
    iconPath: "M 3 12 H 21 M 18 9 L 21 12 L 18 15",
    iconColor: "#ff5577",
    baseRarity: "epic",
  },
  debugger: {
    id: "debugger",
    name: "Дебаггер",
    descriptions: [
      "Запускает дебаг-зонд. Пробивает врагов и помечает критические ошибки.",
      "+2 пробития. Урон +20%.",
      "Шанс крит. удара +15%, множитель +0.5.",
      "+1 зонд за залп. Урон +25%.",
      "+2 пробития. Размер зонда +40%. Урон +40%.",
    ],
    iconPath:
      "M 6 4 L 18 12 L 6 20 Z M 12 8 V 16",
    iconColor: "#c79cff",
    baseRarity: "epic",
  },
  sentinel: {
    id: "sentinel",
    name: "Сторожевой процесс",
    descriptions: [
      "Орбитальные дроны вокруг ИИ. Тараном уничтожают врагов в касании.",
      "+1 дрон. Урон +20%.",
      "Радиус орбиты +20%. Урон +25%.",
      "+1 дрон. Скорость вращения +25%.",
      "+1 дрон. Размер +40%. Урон +40%.",
    ],
    iconPath:
      "M 12 12 m -8 0 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0 M 12 4 a 1.5 1.5 0 1 0 0 3 a 1.5 1.5 0 1 0 0 -3 M 20 12 a 1.5 1.5 0 1 0 0 3 a 1.5 1.5 0 1 0 0 -3",
    iconColor: "#9aff8c",
    baseRarity: "rare",
  },
  crypto: {
    id: "crypto",
    name: "Криптограф",
    descriptions: [
      "Цепная молния по ближайшим угрозам. Хешируем 3 цели подряд.",
      "+1 цель в цепи. Урон +20%.",
      "Скорость стрельбы +30%.",
      "+1 цель. Урон +30%.",
      "+2 цели. Урон финального звена ×2.",
    ],
    iconPath: "M 13 2 L 5 14 H 11 L 9 22 L 19 10 H 13 Z",
    iconColor: "#7ed7ff",
    baseRarity: "epic",
  },
};

// Passives
const PASSIVE_META: Record<PassiveId, UpgradeMeta> = {
  gpu: {
    id: "gpu",
    name: "Разгон GPU",
    descriptions: [
      "Скорость стрельбы +15%.",
      "Скорость стрельбы +15%.",
      "Скорость стрельбы +15%.",
      "Скорость стрельбы +20%.",
      "Скорость стрельбы +25%.",
    ],
    iconPath: "M 6 4 H 18 V 8 H 20 V 16 H 18 V 20 H 6 V 16 H 4 V 8 H 6 Z M 9 9 H 15 V 15 H 9 Z",
    iconColor: "#6cf",
    baseRarity: "common",
  },
  weights: {
    id: "weights",
    name: "Новые веса",
    descriptions: [
      "Базовый урон +15%.",
      "Базовый урон +15%.",
      "Базовый урон +20%.",
      "Базовый урон +20%.",
      "Базовый урон +25%.",
    ],
    iconPath:
      "M 12 3 L 14 8 L 19 8.5 L 15.5 12 L 16.5 17 L 12 14.8 L 7.5 17 L 8.5 12 L 5 8.5 L 10 8 Z",
    iconColor: "#ffd84d",
    baseRarity: "common",
  },
  cache: {
    id: "cache",
    name: "Кэш L1",
    descriptions: [
      "Макс. целостность +25.",
      "Макс. целостность +25 и восстановление 25 HP.",
      "Макс. целостность +30.",
      "Макс. целостность +30.",
      "Макс. целостность +50 и полное восстановление.",
    ],
    iconPath: "M 4 6 H 20 V 18 H 4 Z M 8 6 V 18 M 12 6 V 18 M 16 6 V 18",
    iconColor: "#9fd1ff",
    baseRarity: "common",
  },
  regen: {
    id: "regen",
    name: "Авто-регенерация",
    descriptions: [
      "+0.5 HP/с восстановления.",
      "+0.5 HP/с восстановления.",
      "+0.7 HP/с восстановления.",
      "+0.8 HP/с восстановления.",
      "+1.0 HP/с восстановления.",
    ],
    iconPath:
      "M 12 4 V 12 M 12 12 L 8 16 M 12 12 L 16 16 M 5 18 H 19",
    iconColor: "#7fffd4",
    baseRarity: "common",
  },
  optim: {
    id: "optim",
    name: "Оптимизация маршрута",
    descriptions: [
      "Скорость передвижения +8%.",
      "Скорость передвижения +8%.",
      "Скорость передвижения +10%.",
      "Скорость передвижения +10%.",
      "Скорость передвижения +12%.",
    ],
    iconPath: "M 4 18 L 10 8 L 14 14 L 20 4",
    iconColor: "#6cffa8",
    baseRarity: "common",
  },
  tpu: {
    id: "tpu",
    name: "Расширение TPU",
    descriptions: [
      "Радиус сбора токенов +25%.",
      "Радиус сбора токенов +25%.",
      "Радиус сбора токенов +30%.",
      "Радиус сбора токенов +30%.",
      "Радиус сбора токенов +40%.",
    ],
    iconPath:
      "M 12 12 m -10 0 a 10 10 0 1 0 20 0 a 10 10 0 1 0 -20 0 M 12 7 V 17 M 7 12 H 17",
    iconColor: "#7fffd4",
    baseRarity: "common",
  },
  compress: {
    id: "compress",
    name: "Сжатие потока",
    descriptions: [
      "Размер снарядов +15%.",
      "Размер снарядов +15%.",
      "Размер снарядов +18%.",
      "Размер снарядов +20%.",
      "Размер снарядов +25%.",
    ],
    iconPath: "M 5 5 L 19 19 M 5 19 L 19 5 M 4 12 H 20 M 12 4 V 20",
    iconColor: "#a0c0ff",
    baseRarity: "common",
  },
  bandwidth: {
    id: "bandwidth",
    name: "Пропускная способность",
    descriptions: [
      "Скорость снарядов +20%.",
      "Скорость снарядов +20%.",
      "Скорость снарядов +20%.",
      "Скорость снарядов +25%.",
      "Скорость снарядов +25%.",
    ],
    iconPath: "M 3 8 H 21 M 3 12 H 21 M 3 16 H 21 M 18 5 L 21 8 L 18 11",
    iconColor: "#6cf",
    baseRarity: "common",
  },
  augment: {
    id: "augment",
    name: "Аугментация данных",
    descriptions: [
      "Получение опыта +20%.",
      "Получение опыта +20%.",
      "Получение опыта +25%.",
      "Получение опыта +25%.",
      "Получение опыта +30%.",
    ],
    iconPath:
      "M 6 12 H 18 M 12 6 V 18 M 8 8 L 16 16 M 16 8 L 8 16",
    iconColor: "#7fffd4",
    baseRarity: "rare",
  },
  armor: {
    id: "armor",
    name: "Бронирование",
    descriptions: [
      "Броня +1 (флэт. снижение урона).",
      "Броня +1.",
      "Броня +2.",
      "Броня +2.",
      "Броня +3.",
    ],
    iconPath:
      "M 12 3 L 19 6 V 12 C 19 16 16 19 12 21 C 8 19 5 16 5 12 V 6 Z",
    iconColor: "#9fd1ff",
    baseRarity: "rare",
  },
  luck: {
    id: "luck",
    name: "Стохастика",
    descriptions: [
      "Шанс крит. удара +5%, множитель +0.25.",
      "Шанс крит. удара +5%, множитель +0.25.",
      "Шанс крит. удара +7%, множитель +0.25.",
      "Шанс крит. удара +7%, множитель +0.3.",
      "Шанс крит. удара +8%, множитель +0.4.",
    ],
    iconPath:
      "M 5 5 H 9 V 9 H 5 Z M 15 5 H 19 V 9 H 15 Z M 5 15 H 9 V 19 H 5 Z M 15 15 H 19 V 19 H 15 Z M 11 11 H 13 V 13 H 11 Z",
    iconColor: "#c79cff",
    baseRarity: "rare",
  },
  area: {
    id: "area",
    name: "Радиус действия",
    descriptions: [
      "Радиус AoE +15%.",
      "Радиус AoE +15%.",
      "Радиус AoE +18%.",
      "Радиус AoE +20%.",
      "Радиус AoE +22%.",
    ],
    iconPath: "M 12 12 m -8 0 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0 M 12 12 m -3 0 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0",
    iconColor: "#ffb347",
    baseRarity: "common",
  },
  duration: {
    id: "duration",
    name: "Время жизни кода",
    descriptions: [
      "Длительность снарядов +20%.",
      "Длительность снарядов +20%.",
      "Длительность снарядов +20%.",
      "Длительность снарядов +25%.",
      "Длительность снарядов +25%.",
    ],
    iconPath:
      "M 12 4 V 12 L 17 15 M 12 4 a 8 8 0 1 0 0 16 a 8 8 0 1 0 0 -16",
    iconColor: "#a0c0ff",
    baseRarity: "common",
  },
};

// ----- Eligible options -----

export const buildOptionPool = (state: GameState): UpgradeOption[] => {
  const out: UpgradeOption[] = [];

  // Weapons
  const weaponCount = state.weapons.size;
  const weaponLimit = 6;
  for (const id of WEAPON_IDS) {
    const cur = state.weapons.get(id);
    const lvl = cur?.level ?? 0;
    if (lvl >= MAX_LEVEL) continue;
    if (!cur && weaponCount >= weaponLimit) continue;
    const meta = WEAPON_META[id];
    if (!meta) continue;
    out.push({
      id,
      kind: "weapon",
      name: meta.name,
      desc: meta.descriptions[lvl],
      level: lvl,
      maxLevel: MAX_LEVEL,
      rarity: meta.baseRarity,
      iconPath: meta.iconPath,
      iconColor: meta.iconColor,
    });
  }

  // Evolutions: base weapon at MAX + required passive at MAX → unlock as a
  // single-level epic option that replaces the base weapon.
  for (const ev of EVOLUTIONS) {
    const baseW = state.weapons.get(ev.base);
    const passLvl = state.passiveLevels.get(ev.passive) ?? 0;
    if (!baseW || baseW.level < MAX_LEVEL) continue;
    if (passLvl < MAX_LEVEL) continue;
    if (state.weapons.has(ev.id)) continue; // already evolved
    out.push({
      id: ev.id,
      kind: "weapon",
      name: ev.name,
      desc: ev.description,
      level: 0,
      maxLevel: 1,
      rarity: "epic",
      iconPath: ev.iconPath,
      iconColor: ev.iconColor,
    });
  }

  // Passives
  const passiveCount = state.passiveLevels.size;
  const passiveLimit = 8;
  for (const id of PASSIVE_IDS) {
    const lvl = state.passiveLevels.get(id) ?? 0;
    if (lvl >= MAX_LEVEL) continue;
    if (lvl === 0 && passiveCount >= passiveLimit) continue;
    const meta = PASSIVE_META[id];
    out.push({
      id,
      kind: "passive",
      name: meta.name,
      desc: meta.descriptions[lvl],
      level: lvl,
      maxLevel: MAX_LEVEL,
      rarity: meta.baseRarity,
      iconPath: meta.iconPath,
      iconColor: meta.iconColor,
    });
  }

  return out;
};

export const pickChoices = (state: GameState, count = 3): UpgradeOption[] => {
  const pool = buildOptionPool(state);
  if (pool.length === 0) return [];

  // Weights: incomplete weapons have higher weight if no weapons yet, etc.
  const evoIds = new Set(EVOLUTIONS.map((e) => e.id));
  const weights = pool.map((o) => {
    let w = 1;
    if (o.rarity === "rare") w = 0.55;
    if (o.rarity === "epic") w = 0.28;
    if (o.kind === "weapon" && o.level > 0) w *= 1.2;
    // Evolutions: massive priority so the player rarely misses them.
    if (evoIds.has(o.id as WeaponId)) w *= 12;
    if (o.rarity !== "common") w *= 1 + state.player.stats.luck;
    return w;
  });

  const out: UpgradeOption[] = [];
  const used = new Set<string>();
  const rng = { state: state.rngState };
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) break;
    // Filter out already used
    const idx: number[] = [];
    const ws: number[] = [];
    for (let j = 0; j < pool.length; j++) {
      if (used.has(pool[j].id)) continue;
      idx.push(j);
      ws.push(weights[j]);
    }
    if (idx.length === 0) break;
    const pickedLocal = rngPickWeighted(rng, idx, ws);
    if (pickedLocal === null) break;
    used.add(pool[pickedLocal].id);
    out.push(pool[pickedLocal]);
    // also advance rng once for entropy
    rngNext(rng);
  }
  state.rngState = rng.state;
  return out;
};

// ----- Apply -----

const ensureWeapon = (state: GameState, id: WeaponId): void => {
  if (!state.weapons.has(id)) {
    state.weapons.set(id, { id, level: 1, cooldown: 0.2 });
  } else {
    const w = state.weapons.get(id)!;
    w.level = Math.min(MAX_LEVEL, w.level + 1);
  }
};

export const applyUpgrade = (
  state: GameState,
  option: UpgradeOption,
): void => {
  if (option.kind === "weapon") {
    const wid = option.id as WeaponId;
    // Evolution: replace base weapon with evolved final form.
    const evo = EVOLUTIONS.find((e) => e.id === wid);
    if (evo) {
      state.weapons.delete(evo.base);
      state.weapons.set(evo.id, { id: evo.id, level: 1, cooldown: 0.2 });
      state.toasts.push({
        id: ++state.nextId,
        text: `Эволюция! ${evo.name}`,
        t: 3,
        tone: "info",
      });
      return;
    }
    ensureWeapon(state, wid);
    return;
  }

  // Passive: bump level, then apply diff
  const id = option.id as PassiveId;
  const cur = state.passiveLevels.get(id) ?? 0;
  const next = Math.min(MAX_LEVEL, cur + 1);
  state.passiveLevels.set(id, next);

  const stats = state.player.stats;
  // Apply *delta* per level. We use the same numbers shown in descriptions.
  switch (id) {
    case "gpu": {
      const muls = [1.15, 1.15, 1.15, 1.2, 1.25];
      stats.attackSpeedMul *= muls[cur];
      break;
    }
    case "weights": {
      const muls = [1.15, 1.15, 1.2, 1.2, 1.25];
      stats.damageMul *= muls[cur];
      break;
    }
    case "cache": {
      const adds = [25, 25, 30, 30, 50];
      stats.maxHp += adds[cur];
      // also heal
      const heal = cur === 1 ? 25 : cur === 4 ? 9999 : 0;
      state.player.hp = Math.min(stats.maxHp, state.player.hp + heal);
      break;
    }
    case "regen": {
      const adds = [0.5, 0.5, 0.7, 0.8, 1.0];
      stats.hpRegen += adds[cur];
      break;
    }
    case "optim": {
      const muls = [1.08, 1.08, 1.1, 1.1, 1.12];
      stats.speed *= muls[cur];
      break;
    }
    case "tpu": {
      const muls = [1.25, 1.25, 1.3, 1.3, 1.4];
      stats.pickupRadius *= muls[cur];
      break;
    }
    case "compress": {
      const muls = [1.15, 1.15, 1.18, 1.2, 1.25];
      stats.projectileSizeMul *= muls[cur];
      break;
    }
    case "bandwidth": {
      const muls = [1.2, 1.2, 1.2, 1.25, 1.25];
      stats.projectileSpeedMul *= muls[cur];
      break;
    }
    case "augment": {
      const muls = [1.2, 1.2, 1.25, 1.25, 1.3];
      stats.xpGainMul *= muls[cur];
      stats.luck += 0.05;
      break;
    }
    case "armor": {
      const adds = [1, 1, 2, 2, 3];
      stats.armor += adds[cur];
      break;
    }
    case "luck": {
      const ch = [0.05, 0.05, 0.07, 0.07, 0.08];
      const mu = [0.25, 0.25, 0.25, 0.3, 0.4];
      stats.critChance += ch[cur];
      stats.critMul += mu[cur];
      stats.luck += 0.05;
      break;
    }
    case "area": {
      const muls = [1.15, 1.15, 1.18, 1.2, 1.22];
      stats.areaMul *= muls[cur];
      break;
    }
    case "duration": {
      const muls = [1.2, 1.2, 1.2, 1.25, 1.25];
      stats.durationMul *= muls[cur];
      break;
    }
  }
  applySoftCaps(stats);
};

// Soft-cap multiplicative stats so they can't snowball past sane levels.
const applySoftCaps = (stats: PlayerStats): void => {
  const c = STAT_CAPS;
  stats.damageMul = softCap(stats.damageMul, c.damageMul.soft, c.damageMul.hard);
  stats.attackSpeedMul = softCap(
    stats.attackSpeedMul,
    c.attackSpeedMul.soft,
    c.attackSpeedMul.hard,
  );
  stats.areaMul = softCap(stats.areaMul, c.areaMul.soft, c.areaMul.hard);
  stats.durationMul = softCap(
    stats.durationMul,
    c.durationMul.soft,
    c.durationMul.hard,
  );
  stats.projectileSpeedMul = softCap(
    stats.projectileSpeedMul,
    c.projectileSpeedMul.soft,
    c.projectileSpeedMul.hard,
  );
  stats.projectileSizeMul = softCap(
    stats.projectileSizeMul,
    c.projectileSizeMul.soft,
    c.projectileSizeMul.hard,
  );
  stats.critChance = Math.min(c.critChance.hard, stats.critChance);
};

// ----- Stats application helpers (used outside) -----

export const initPlayerStats = (base: PlayerStats): PlayerStats => ({
  ...base,
});
