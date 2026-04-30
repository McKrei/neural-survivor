// DOM-based UI: HUD, menu, level-up, pause, game over.

import { T } from "./texts";
import type { GameState, UpgradeOption } from "./types";
import { applyUpgrade } from "./upgrades";
import { resetGameState } from "./state";
import { formatNumber, formatTime } from "./utils";

interface UI {
  root: HTMLElement;
  hud: HTMLElement;
  overlay: HTMLElement | null;
  // Cached HUD nodes
  xpFill: HTMLElement;
  hpFill: HTMLElement;
  hpText: HTMLElement;
  xpText: HTMLElement;
  levelText: HTMLElement;
  timerText: HTMLElement;
  killsText: HTMLElement;
  fpsText: HTMLElement;
  weaponStrip: HTMLElement;
  passiveStrip: HTMLElement;
  bossBanner: HTMLElement;
  bossBar: HTMLElement;
  bossBarFill: HTMLElement;
  bossBarLabel: HTMLElement;
  toastStack: HTMLElement;
  // Last toast id rendered
  lastToastId: number;
}

let ui: UI | null = null;

const el = (tag: string, cls?: string, html?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const svgIcon = (path: string, color: string, size = 32): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}" /></svg>`;

// ----- HUD -----

export const initUi = (rootEl: HTMLElement): void => {
  rootEl.innerHTML = "";
  // Build HUD shell once
  const hud = el("div", "hud");
  hud.innerHTML = `
    <div class="hud-top">
      <div class="row">
        <span class="kicker" data-id="lvl-label">${T.level} 1</span>
        <div class="bar xp" style="flex:1"><div class="fill" data-id="xp-fill"></div></div>
        <span class="stat-line"><span class="accent" data-id="xp-text">0 / 5</span></span>
      </div>
      <div class="row">
        <span class="kicker" data-id="hp-label">${T.hp}</span>
        <div class="bar hp" style="flex:1"><div class="fill" data-id="hp-fill"></div></div>
        <span class="stat-line"><strong data-id="hp-text">100 / 100</strong></span>
      </div>
    </div>
    <div class="hud-right">
      <div class="timer" data-id="timer">00:00</div>
      <div class="sub"><span data-id="kills">0</span> ${T.kills.toLowerCase()} · <span data-id="fps">60</span> FPS</div>
    </div>
    <div class="boss-banner" data-id="boss-banner" style="display:none">
      <div class="label">${T.bossLabel}</div>
      <div class="name" data-id="boss-name"></div>
    </div>
    <div class="boss-bar" data-id="boss-bar" style="display:none">
      <div class="label" data-id="boss-bar-label"></div>
      <div class="bar"><div class="fill" data-id="boss-bar-fill"></div></div>
    </div>
    <div class="toast-stack" data-id="toasts"></div>
    <div class="hud-bottom">
      <div class="weapon-strip" data-id="weapons"></div>
      <div class="weapon-strip" data-id="passives" style="margin-left:14px"></div>
    </div>
  `;
  rootEl.appendChild(hud);

  ui = {
    root: rootEl,
    hud,
    overlay: null,
    xpFill: hud.querySelector('[data-id="xp-fill"]') as HTMLElement,
    hpFill: hud.querySelector('[data-id="hp-fill"]') as HTMLElement,
    hpText: hud.querySelector('[data-id="hp-text"]') as HTMLElement,
    xpText: hud.querySelector('[data-id="xp-text"]') as HTMLElement,
    levelText: hud.querySelector('[data-id="lvl-label"]') as HTMLElement,
    timerText: hud.querySelector('[data-id="timer"]') as HTMLElement,
    killsText: hud.querySelector('[data-id="kills"]') as HTMLElement,
    fpsText: hud.querySelector('[data-id="fps"]') as HTMLElement,
    weaponStrip: hud.querySelector('[data-id="weapons"]') as HTMLElement,
    passiveStrip: hud.querySelector('[data-id="passives"]') as HTMLElement,
    bossBanner: hud.querySelector('[data-id="boss-banner"]') as HTMLElement,
    bossBar: hud.querySelector('[data-id="boss-bar"]') as HTMLElement,
    bossBarFill: hud.querySelector('[data-id="boss-bar-fill"]') as HTMLElement,
    bossBarLabel: hud.querySelector('[data-id="boss-bar-label"]') as HTMLElement,
    toastStack: hud.querySelector('[data-id="toasts"]') as HTMLElement,
    lastToastId: 0,
  };
};

export const updateHud = (state: GameState): void => {
  if (!ui) return;
  const p = state.player;
  // XP bar
  ui.xpFill.style.width = `${(p.xp / p.xpToNext) * 100}%`;
  ui.xpText.textContent = `${p.xp} / ${p.xpToNext}`;
  ui.levelText.textContent = `${T.level} ${p.level}`;

  // HP
  const pct = (p.hp / p.stats.maxHp) * 100;
  ui.hpFill.style.width = `${pct}%`;
  ui.hpText.textContent = `${Math.ceil(p.hp)} / ${Math.ceil(p.stats.maxHp)}`;

  ui.timerText.textContent = formatTime(state.time);
  ui.killsText.textContent = formatNumber(p.killCount);
  ui.fpsText.textContent = state.fps.toFixed(0);

  // Weapons strip (rebuild lazily)
  buildWeaponStrip(state);
  buildPassiveStrip(state);

  // Boss bar
  if (state.activeBoss && state.activeBoss.alive) {
    ui.bossBar.style.display = "block";
    ui.bossBarFill.style.width = `${Math.max(0, (state.activeBoss.hp / state.activeBoss.maxHp) * 100)}%`;
    ui.bossBarLabel.textContent =
      T.bossNames[state.activeBoss.kind] ?? state.activeBoss.kind;
  } else {
    ui.bossBar.style.display = "none";
  }

  // Boss banner (briefly visible)
  if (state.bossAnnounce) {
    ui.bossBanner.style.display = "flex";
    (ui.bossBanner.querySelector('[data-id="boss-name"]') as HTMLElement).textContent =
      state.bossAnnounce.name;
  } else {
    ui.bossBanner.style.display = "none";
  }

  // Toasts (append new ones)
  for (const t of state.toasts) {
    if (t.id <= ui.lastToastId) continue;
    ui.lastToastId = t.id;
    const node = el("div", `toast ${t.tone === "warn" ? "warn" : ""}`);
    node.textContent = t.text;
    ui.toastStack.appendChild(node);
    setTimeout(() => node.remove(), 2000);
  }
};

const lastSlotState: { weaponSig: string; passiveSig: string } = {
  weaponSig: "",
  passiveSig: "",
};

const buildWeaponStrip = (state: GameState): void => {
  if (!ui) return;
  const sig = Array.from(state.weapons.values())
    .map((w) => `${w.id}:${w.level}`)
    .sort()
    .join("|");
  if (sig === lastSlotState.weaponSig) return;
  lastSlotState.weaponSig = sig;
  ui.weaponStrip.innerHTML = "";
  // Render currently equipped weapons (in stable order), then locked slots
  // up to 6 with a hint icon so the player knows there's room to grow.
  const equipped = Array.from(state.weapons.values());
  const SLOT_TOTAL = 6;
  for (const w of equipped) {
    const slot = el("div", "slot filled");
    const meta = WEAPON_ICONS[w.id] ?? { path: "M 12 12 m -8 0 a 8 8 0 1 0 16 0", color: "#fff" };
    slot.innerHTML = svgIcon(meta.path, meta.color, 22);
    const lvl = el("span", "lvl");
    lvl.textContent = `${w.level}`;
    slot.appendChild(lvl);
    slot.title = `Оружие: уровень ${w.level}`;
    ui.weaponStrip.appendChild(slot);
  }
  const locked = Math.max(0, SLOT_TOTAL - equipped.length);
  for (let i = 0; i < locked; i++) {
    const slot = el("div", "slot locked");
    slot.innerHTML = `<span class="lock-hint">+</span>`;
    slot.title = "Свободный слот — получите новое оружие на следующем уровне";
    ui.weaponStrip.appendChild(slot);
  }
};

const buildPassiveStrip = (state: GameState): void => {
  if (!ui) return;
  const sig = Array.from(state.passiveLevels.entries())
    .map((e) => `${e[0]}:${e[1]}`)
    .sort()
    .join("|");
  if (sig === lastSlotState.passiveSig) return;
  lastSlotState.passiveSig = sig;
  ui.passiveStrip.innerHTML = "";
  // Show passives that are filled, max 8
  let count = 0;
  for (const [id, lvl] of state.passiveLevels.entries()) {
    if (count++ >= 8) break;
    const slot = el("div", "slot passive filled");
    const meta = PASSIVE_ICONS[id];
    if (meta) {
      slot.innerHTML = svgIcon(meta.path, meta.color, 18);
    } else {
      slot.textContent = id;
    }
    const lvlSpan = el("span", "lvl");
    lvlSpan.textContent = `${lvl}`;
    slot.appendChild(lvlSpan);
    ui.passiveStrip.appendChild(slot);
  }
};

// Mirror of upgrade icons for HUD slots
const WEAPON_ICONS: Record<string, { path: string; color: string }> = {
  thread: { path: "M 4 12 H 20 M 4 6 H 20 M 4 18 H 20 M 8 4 V 20 M 16 4 V 20", color: "#6cf" },
  firewall: {
    path: "M 12 3 L 21 7 V 12 C 21 17 17 21 12 21 C 7 21 3 17 3 12 V 7 Z",
    color: "#ff7a4d",
  },
  antivirus: {
    path: "M 12 3 L 14 9 L 21 9 L 15 13 L 17 20 L 12 16 L 7 20 L 9 13 L 3 9 L 10 9 Z",
    color: "#7fffd4",
  },
  gc: {
    path: "M 5 6 H 19 L 17 20 H 7 Z M 9 6 V 3 H 15 V 6 M 9 10 V 17 M 12 10 V 17 M 15 10 V 17",
    color: "#ffb347",
  },
  laser: { path: "M 3 12 H 21 M 18 9 L 21 12 L 18 15", color: "#ff5577" },
  debugger: { path: "M 6 4 L 18 12 L 6 20 Z M 12 8 V 16", color: "#c79cff" },
  sentinel: {
    path: "M 12 12 m -8 0 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0 M 12 4 a 1.5 1.5 0 1 0 0 3 a 1.5 1.5 0 1 0 0 -3 M 20 12 a 1.5 1.5 0 1 0 0 3 a 1.5 1.5 0 1 0 0 -3",
    color: "#9aff8c",
  },
  crypto: { path: "M 13 2 L 5 14 H 11 L 9 22 L 19 10 H 13 Z", color: "#7ed7ff" },
  hyperthread: {
    path: "M 4 6 H 20 M 4 12 H 20 M 4 18 H 20 M 8 4 V 20 M 12 4 V 20 M 16 4 V 20",
    color: "#9bf6ff",
  },
  perimeter: {
    path: "M 12 2 L 22 6 V 12 C 22 18 17 22 12 22 C 7 22 2 18 2 12 V 6 Z M 12 7 L 18 9 V 12 C 18 15 15 17 12 18 C 9 17 6 15 6 12 V 9 Z",
    color: "#ffac4d",
  },
  heuristic: {
    path: "M 12 2 L 14 8 L 22 9 L 16 13 L 18 22 L 12 17 L 6 22 L 8 13 L 2 9 L 10 8 Z",
    color: "#a8ffe6",
  },
};

const PASSIVE_ICONS: Record<string, { path: string; color: string }> = {
  gpu: { path: "M 6 4 H 18 V 8 H 20 V 16 H 18 V 20 H 6 V 16 H 4 V 8 H 6 Z M 9 9 H 15 V 15 H 9 Z", color: "#6cf" },
  weights: { path: "M 12 3 L 14 8 L 19 8.5 L 15.5 12 L 16.5 17 L 12 14.8 L 7.5 17 L 8.5 12 L 5 8.5 L 10 8 Z", color: "#ffd84d" },
  cache: { path: "M 4 6 H 20 V 18 H 4 Z M 8 6 V 18 M 12 6 V 18 M 16 6 V 18", color: "#9fd1ff" },
  regen: { path: "M 12 4 V 12 M 12 12 L 8 16 M 12 12 L 16 16 M 5 18 H 19", color: "#7fffd4" },
  optim: { path: "M 4 18 L 10 8 L 14 14 L 20 4", color: "#6cffa8" },
  tpu: { path: "M 12 12 m -10 0 a 10 10 0 1 0 20 0 a 10 10 0 1 0 -20 0 M 12 7 V 17 M 7 12 H 17", color: "#7fffd4" },
  compress: { path: "M 5 5 L 19 19 M 5 19 L 19 5 M 4 12 H 20 M 12 4 V 20", color: "#a0c0ff" },
  bandwidth: { path: "M 3 8 H 21 M 3 12 H 21 M 3 16 H 21 M 18 5 L 21 8 L 18 11", color: "#6cf" },
  augment: { path: "M 6 12 H 18 M 12 6 V 18 M 8 8 L 16 16 M 16 8 L 8 16", color: "#7fffd4" },
  armor: { path: "M 12 3 L 19 6 V 12 C 19 16 16 19 12 21 C 8 19 5 16 5 12 V 6 Z", color: "#9fd1ff" },
  luck: { path: "M 5 5 H 9 V 9 H 5 Z M 15 5 H 19 V 9 H 15 Z M 5 15 H 9 V 19 H 5 Z M 15 15 H 19 V 19 H 15 Z M 11 11 H 13 V 13 H 11 Z", color: "#c79cff" },
  area: { path: "M 12 12 m -8 0 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0 M 12 12 m -3 0 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0", color: "#ffb347" },
  duration: { path: "M 12 4 V 12 L 17 15 M 12 4 a 8 8 0 1 0 0 16 a 8 8 0 1 0 0 -16", color: "#a0c0ff" },
};

// ----- Overlays -----

const removeOverlay = (): void => {
  if (!ui) return;
  if (ui.overlay) {
    ui.overlay.remove();
    ui.overlay = null;
  }
};

export const showMenu = (state: GameState, onStart: () => void): void => {
  if (!ui) return;
  removeOverlay();
  const ov = el("div", "overlay");
  ov.innerHTML = `
    <div class="panel menu">
      <div class="kicker">${T.subtitle}</div>
      <h1 class="title">${T.title}</h1>
      <div class="subtitle">Управляй обучаемой нейросетью. Выживи в потоке угроз.</div>
      <button class="btn" data-id="start">${T.start}</button>
      <div class="hint">Нажмите Enter / пробел чтобы начать</div>
      <div class="controls">
        <span class="key">${T.ctrlMoveVal}</span><span>${T.ctrlMove}</span>
        <span class="key">${T.ctrlMouseVal}</span><span>${T.ctrlMouse}</span>
        <span class="key">${T.ctrlAttackVal}</span><span>${T.ctrlAttack}</span>
        <span class="key">${T.ctrlPauseVal}</span><span>${T.ctrlPause}</span>
        <span class="key">${T.ctrlChoiceVal}</span><span>${T.ctrlChoice}</span>
      </div>
    </div>
  `;
  (ov.querySelector('[data-id="start"]') as HTMLButtonElement).addEventListener("click", onStart);
  ui.overlay = ov;
  ui.root.appendChild(ov);
  void state;
};

export const showPause = (onResume: () => void, onRestart: () => void): void => {
  if (!ui) return;
  removeOverlay();
  const ov = el("div", "overlay");
  ov.innerHTML = `
    <div class="panel">
      <div class="kicker">${T.pauseHint}</div>
      <h1 class="title">${T.pauseTitle}</h1>
      <div class="row" style="justify-content: center; gap: 12px; margin-top: 14px;">
        <button class="btn" data-id="resume">${T.resume}</button>
        <button class="btn danger" data-id="restart">${T.restart}</button>
      </div>
    </div>
  `;
  (ov.querySelector('[data-id="resume"]') as HTMLButtonElement).addEventListener("click", onResume);
  (ov.querySelector('[data-id="restart"]') as HTMLButtonElement).addEventListener("click", onRestart);
  ui.overlay = ov;
  ui.root.appendChild(ov);
};

export const showLevelUp = (
  state: GameState,
  onPick: (option: UpgradeOption) => void,
): void => {
  if (!ui) return;
  removeOverlay();
  const ov = el("div", "overlay");
  const choices = state.currentChoices;
  const level = state.player.level;
  const cardHtml = choices
    .map((opt, idx) => {
      let tag = "";
      let footer = "";
      if (opt.kind === "weapon") {
        if (opt.level === 0) {
          tag = T.newWeapon;
        } else if (opt.level + 1 >= opt.maxLevel) {
          tag = T.upgrade;
        } else {
          tag = T.upgrade;
        }
        footer = `${opt.level} → ${opt.level + 1} / ${opt.maxLevel}`;
      } else {
        if (opt.level === 0) {
          tag = T.newPassive;
        } else {
          tag = T.passiveUp;
        }
        footer = `${opt.level} → ${opt.level + 1} / ${opt.maxLevel}`;
      }
      const rarityClass = `rarity-${opt.rarity}`;
      const rarityName =
        opt.rarity === "common"
          ? T.rarityCommon
          : opt.rarity === "rare"
            ? T.rarityRare
            : T.rarityEpic;
      return `
        <div class="card ${rarityClass}" data-idx="${idx}">
          <div class="card-head">
            <div class="card-icon">${svgIcon(opt.iconPath, opt.iconColor, 28)}</div>
            <span class="card-tag ${rarityClass}">${rarityName}</span>
          </div>
          <div class="card-name">${opt.name}</div>
          <div class="card-desc">${opt.desc}</div>
          <div class="card-foot">${tag} · ${footer} · клавиша ${idx + 1}</div>
        </div>
      `;
    })
    .join("");

  ov.innerHTML = `
    <div class="panel">
      <div class="kicker">${T.levelUpSubtitle(level)}</div>
      <h1 class="title">${T.levelUpTitle}</h1>
      <div class="cards">${cardHtml}</div>
      <div class="hint">${T.pickHint}</div>
    </div>
  `;
  ov.querySelectorAll(".card").forEach((c) => {
    c.addEventListener("click", () => {
      const idx = parseInt((c as HTMLElement).dataset.idx ?? "0", 10);
      const opt = state.currentChoices[idx];
      if (opt) onPick(opt);
    });
  });

  ui.overlay = ov;
  ui.root.appendChild(ov);
};

export const showGameOver = (
  state: GameState,
  victory: boolean,
  onRestart: () => void,
): void => {
  if (!ui) return;
  removeOverlay();
  const ov = el("div", "overlay");
  const title = victory ? T.victoryTitle : T.gameOverTitle;
  const sub = victory ? T.victorySub : T.gameOverSub;
  ov.innerHTML = `
    <div class="panel">
      <div class="kicker">${sub}</div>
      <h1 class="title">${title}</h1>
      <div class="go-stats">
        <span>${T.statTime}</span>
        <span class="v">${formatTime(state.time)}</span>
        <span>${T.statLevel}</span>
        <span class="v">${state.player.level}</span>
        <span>${T.statKills}</span>
        <span class="v">${formatNumber(state.player.killCount)}</span>
        <span>${T.statDamage}</span>
        <span class="v">${formatNumber(state.totalDamage)}</span>
      </div>
      <div class="row" style="justify-content:center; margin-top:18px;">
        <button class="btn" data-id="restart">${T.restart}</button>
      </div>
    </div>
  `;
  (ov.querySelector('[data-id="restart"]') as HTMLButtonElement).addEventListener("click", onRestart);
  ui.overlay = ov;
  ui.root.appendChild(ov);
};

export const closeOverlay = (): void => {
  removeOverlay();
};

// Apply an upgrade choice (for keyboard shortcut path)
export const applyChoice = (state: GameState, idx: number): void => {
  if (state.phase !== "levelup") return;
  const opt = state.currentChoices[idx];
  if (!opt) return;
  applyUpgrade(state, opt);
  state.currentChoices = [];
  state.pendingLevelUps = Math.max(0, state.pendingLevelUps - 1);
  state.phase = "playing";
  closeOverlay();
};

// also expose for keyboard handlers
export const consumeLevelUpChoice = (
  state: GameState,
  option: UpgradeOption,
): void => {
  applyUpgrade(state, option);
  state.currentChoices = [];
  state.pendingLevelUps = Math.max(0, state.pendingLevelUps - 1);
  state.phase = "playing";
  closeOverlay();
};

// ----- Reset wrapper -----

export const restart = (state: GameState): void => {
  resetGameState(state);
  closeOverlay();
};
