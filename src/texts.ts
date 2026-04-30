// Russian strings used across the UI. Centralized for easy editing.

export const T = {
  title: "NEURAL SURVIVOR",
  subtitle: "ЭВОЛЮЦИЯ ИИ ПРОТИВ ХАОСА КОДА",
  start: "Запустить ИИ",
  controls: "Управление",
  ctrlMove: "Перемещение",
  ctrlMoveVal: "WASD / Стрелки",
  ctrlMouse: "Курсор",
  ctrlMouseVal: "Перемещение к курсору (ЛКМ)",
  ctrlPause: "Пауза",
  ctrlPauseVal: "ESC / P",
  ctrlChoice: "Выбор апгрейда",
  ctrlChoiceVal: "1 / 2 / 3 или клик",
  ctrlAttack: "Атака",
  ctrlAttackVal: "Автоматическая",

  level: "Версия",
  xp: "Прогресс",
  hp: "Целостность",
  kills: "Уничтожено",
  fps: "FPS",

  pauseTitle: "ПАУЗА",
  pauseHint: "Нажмите ESC чтобы продолжить",
  resume: "Продолжить",
  restart: "Перезапустить",

  levelUpTitle: "НОВАЯ ВЕРСИЯ ИИ",
  levelUpSubtitle: (lvl: number) => `Версия ${lvl} — выберите модуль развития`,
  pickHint: "Нажмите 1 / 2 / 3 или кликните карту",

  rarityCommon: "СТАНДАРТ",
  rarityRare: "ОПТИМИЗАЦИЯ",
  rarityEpic: "ПРОРЫВ",

  newWeapon: "НОВОЕ ОРУЖИЕ",
  upgrade: "АПГРЕЙД",
  newPassive: "НОВЫЙ МОДУЛЬ",
  passiveUp: "УЛУЧШЕНИЕ",
  maxed: "МАКСИМУМ",
  rerollFromBanish: "Все слоты заняты",

  gameOverTitle: "СИСТЕМА СКОМПРОМЕТИРОВАНА",
  gameOverSub: "ИИ был перегружен враждебным кодом",
  victoryTitle: "ИИ ДОСТИГ СИНГУЛЯРНОСТИ",
  victorySub: "Все угрозы нейтрализованы. Поздравляем.",
  statTime: "Время выживания",
  statKills: "Уничтожено сущностей",
  statLevel: "Достигнутая версия",
  statDamage: "Нанесённый урон",

  bossLabel: "Обнаружена угроза",
  bossNames: {
    memleak: "УТЕЧКА ПАМЯТИ",
    trojan: "ТРОЯН-ПОЛИМОРФ",
  } as Record<string, string>,

  enemyNames: {
    virus: "Вирус",
    bug: "Баг",
    legacy: "Легаси-код",
    ddos: "DDOS-пакет",
    memleak: "Утечка памяти",
    trojan: "Троян",
  } as Record<string, string>,

  toastBoss: (name: string) => `Обнаружена угроза: ${name}`,
  toastBossDown: (name: string) => `${name} нейтрализован`,

  // Weapon and passive descriptions: produce a localized desc for the
  // *next* level given the current level (0 if not yet picked).
  // These are filled in by upgrades.ts.
};
