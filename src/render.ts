// Canvas 2D renderer. Draws everything as geometric SVG-style shapes.

import type { Enemy, GameState, Projectile, XPOrb, Particle } from "./types";
import { TAU } from "./utils";

interface Renderer {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  dpr: number;
}

let renderer: Renderer | null = null;

export const initRenderer = (canvas: HTMLCanvasElement): void => {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D not supported");
  renderer = { ctx, canvas, dpr: window.devicePixelRatio || 1 };
  resize();
  window.addEventListener("resize", resize);
};

export const resize = (): void => {
  if (!renderer) return;
  const { canvas, dpr } = renderer;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
};

// ----- World transform helpers -----
// Pixel coordinates: (0,0) at center of screen + camera shake.

export const render = (state: GameState): void => {
  if (!renderer) return;
  const { ctx, canvas } = renderer;
  const w = canvas.width;
  const h = canvas.height;
  const dpr = renderer.dpr;
  const vw = w / dpr;
  const vh = h / dpr;

  // Reset to identity & clear with a base bg gradient
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Background gradient
  const grad = ctx.createRadialGradient(vw / 2, vh / 2, 50, vw / 2, vh / 2, Math.max(vw, vh));
  grad.addColorStop(0, "#0a1224");
  grad.addColorStop(0.6, "#06080d");
  grad.addColorStop(1, "#02030a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, vw, vh);

  // Camera transform
  const sx = (Math.random() - 0.5) * state.camera.shake;
  const sy = (Math.random() - 0.5) * state.camera.shake;
  const camX = state.camera.x;
  const camY = state.camera.y;
  // World→screen offset: world (camX, camY) renders at (vw/2, vh/2)
  const offX = vw / 2 - camX + sx;
  const offY = vh / 2 - camY + sy;

  // ----- Background grid -----
  drawGrid(ctx, vw, vh, camX, camY, offX, offY);

  // ----- Apply translate so we can pass world coords -----
  ctx.save();
  ctx.translate(offX, offY);

  // Compute culling bounds in world space
  const cullPad = 80;
  const vx0 = camX - vw / 2 - cullPad;
  const vx1 = camX + vw / 2 + cullPad;
  const vy0 = camY - vh / 2 - cullPad;
  const vy1 = camY + vh / 2 + cullPad;
  const inView = (x: number, y: number, r: number): boolean =>
    x + r >= vx0 && x - r <= vx1 && y + r >= vy0 && y - r <= vy1;

  // ----- Firewall aura (under everything) -----
  drawFirewallAura(ctx, state);

  // ----- Orbs -----
  for (const o of state.orbs) {
    if (!o.alive) continue;
    if (!inView(o.x, o.y, o.r * 2)) continue;
    drawOrb(ctx, o);
  }

  // ----- Enemies -----
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (!inView(e.x, e.y, e.r * 2)) continue;
    drawEnemy(ctx, e);
  }

  // ----- Projectiles -----
  for (const p of state.projectiles) {
    if (!p.alive) continue;
    if (!inView(p.x, p.y, p.size * 2)) continue;
    drawProjectile(ctx, p);
  }

  // ----- Player -----
  if (state.player.alive) {
    drawPlayer(ctx, state);
  }

  // ----- Particles -----
  for (const p of state.particles) {
    if (!p.alive) continue;
    if (!inView(p.x, p.y, p.size + 32)) continue;
    drawParticle(ctx, p);
  }

  ctx.restore();

  // ----- Damage vignette (red flash when iframes active) -----
  if (state.player.iframes > 0 && state.player.alive) {
    const intensity = state.player.iframes / 0.55;
    drawDamageFlash(ctx, vw, vh, intensity);
  }

  // ----- Low HP pulse -----
  if (
    state.player.alive &&
    state.player.hp / state.player.stats.maxHp < 0.3
  ) {
    const pulse = (Math.sin(state.realTime * 6) + 1) / 2;
    drawDamageFlash(ctx, vw, vh, pulse * 0.4);
  }

  // ----- Vignette -----
  drawVignette(ctx, vw, vh);
};

const drawDamageFlash = (
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  intensity: number,
): void => {
  const grad = ctx.createRadialGradient(
    vw / 2,
    vh / 2,
    Math.min(vw, vh) * 0.3,
    vw / 2,
    vh / 2,
    Math.max(vw, vh) * 0.7,
  );
  grad.addColorStop(0, "rgba(255, 30, 60, 0)");
  grad.addColorStop(1, `rgba(255, 30, 60, ${0.6 * intensity})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, vw, vh);
};

// ----- Helpers -----

const drawGrid = (
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  camX: number,
  camY: number,
  offX: number,
  offY: number,
): void => {
  // Two-tone grid: major every 200, minor every 50
  ctx.lineWidth = 1;

  // Minor
  const minor = 50;
  ctx.strokeStyle = "rgba(108, 220, 255, 0.06)";
  ctx.beginPath();
  const startMinorX = Math.floor((camX - vw / 2) / minor) * minor;
  const endMinorX = camX + vw / 2;
  for (let x = startMinorX; x <= endMinorX; x += minor) {
    const sx = x + offX;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, vh);
  }
  const startMinorY = Math.floor((camY - vh / 2) / minor) * minor;
  const endMinorY = camY + vh / 2;
  for (let y = startMinorY; y <= endMinorY; y += minor) {
    const sy = y + offY;
    ctx.moveTo(0, sy);
    ctx.lineTo(vw, sy);
  }
  ctx.stroke();

  // Major
  const major = 250;
  ctx.strokeStyle = "rgba(0, 255, 208, 0.10)";
  ctx.beginPath();
  const startMajorX = Math.floor((camX - vw / 2) / major) * major;
  for (let x = startMajorX; x <= endMinorX; x += major) {
    const sx = x + offX;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, vh);
  }
  const startMajorY = Math.floor((camY - vh / 2) / major) * major;
  for (let y = startMajorY; y <= endMinorY; y += major) {
    const sy = y + offY;
    ctx.moveTo(0, sy);
    ctx.lineTo(vw, sy);
  }
  ctx.stroke();
};

const drawVignette = (ctx: CanvasRenderingContext2D, vw: number, vh: number): void => {
  const grad = ctx.createRadialGradient(
    vw / 2,
    vh / 2,
    Math.min(vw, vh) * 0.35,
    vw / 2,
    vh / 2,
    Math.max(vw, vh) * 0.7,
  );
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, vw, vh);
};

const drawOrb = (ctx: CanvasRenderingContext2D, o: XPOrb): void => {
  const pulse = 1 + Math.sin(o.bob) * 0.08;
  const r = o.r * pulse;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r * 1.5, 0, TAU);
  ctx.fillStyle = "rgba(127, 255, 212, 0.15)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(o.x, o.y, r, 0, TAU);
  ctx.fillStyle = o.value >= 5 ? "#a47bff" : "#7fffd4";
  ctx.fill();

  // tiny glow ring
  ctx.beginPath();
  ctx.arc(o.x, o.y, r + 1, 0, TAU);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();
};

const drawPlayer = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  const p = state.player;
  const t = state.realTime;
  const flicker = p.iframes > 0 && Math.floor(t * 24) % 2 === 0;

  // Outer ring
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(t * 0.4);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const r1 = p.r + 4;
    const r2 = p.r + 9;
    const x1 = Math.cos(a) * r1;
    const y1 = Math.sin(a) * r1;
    const x2 = Math.cos(a) * r2;
    const y2 = Math.sin(a) * r2;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.strokeStyle = flicker ? "#ffffff" : "#00ffd0";
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  // Pickup radius (faint)
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.stats.pickupRadius, 0, TAU);
  ctx.strokeStyle = "rgba(0, 255, 208, 0.05)";
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  // Body — geometric AI node
  ctx.save();
  ctx.translate(p.x, p.y);
  // Hex body
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + t * 0.6;
    const x = Math.cos(a) * p.r * 0.85;
    const y = Math.sin(a) * p.r * 0.85;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 60, 60, 0.85)";
  ctx.fill();
  ctx.strokeStyle = flicker ? "#ffffff" : "#00ffd0";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Center core
  ctx.beginPath();
  ctx.arc(0, 0, p.r * 0.35, 0, TAU);
  ctx.fillStyle = flicker ? "#ffffff" : "#00ffd0";
  ctx.fill();

  // Connections (3 small nodes radiating)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + t * 1.1;
    const x = Math.cos(a) * p.r * 1.5;
    const y = Math.sin(a) * p.r * 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "rgba(0, 255, 208, 0.5)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, TAU);
    ctx.fillStyle = "#6cf";
    ctx.fill();
  }
  ctx.restore();
};

const drawEnemy = (ctx: CanvasRenderingContext2D, e: Enemy): void => {
  ctx.save();
  ctx.translate(e.x, e.y);

  // Hit flash overrides color
  const flash = e.hitFlash > 0;

  switch (e.kind) {
    case "virus":
      drawVirus(ctx, e, flash);
      break;
    case "bug":
      drawBug(ctx, e, flash);
      break;
    case "legacy":
      drawLegacy(ctx, e, flash);
      break;
    case "ddos":
      drawDdos(ctx, e, flash);
      break;
    case "memleak":
      drawMemleak(ctx, e, flash);
      break;
    case "trojan":
      drawTrojan(ctx, e, flash);
      break;
  }
  ctx.restore();

  // Health bar for bosses
  if (e.isBoss) {
    const w = 60;
    const x = e.x - w / 2;
    const y = e.y - e.r - 12;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = "#ff5577";
    ctx.fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), 4);
  }
};

const drawVirus = (ctx: CanvasRenderingContext2D, e: Enemy, flash: boolean): void => {
  // Spiky blob: irregular polygon
  const spikes = 7;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * TAU + e.facing * 0.3;
    const r = i % 2 === 0 ? e.r : e.r * 0.7;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = flash ? "#ffffff" : e.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = flash ? "#ffffff" : e.accent;
  ctx.stroke();
};

const drawBug = (ctx: CanvasRenderingContext2D, e: Enemy, flash: boolean): void => {
  // Triangle with antennae
  ctx.rotate(e.facing);
  ctx.beginPath();
  ctx.moveTo(e.r, 0);
  ctx.lineTo(-e.r * 0.7, -e.r * 0.7);
  ctx.lineTo(-e.r * 0.4, 0);
  ctx.lineTo(-e.r * 0.7, e.r * 0.7);
  ctx.closePath();
  ctx.fillStyle = flash ? "#ffffff" : e.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = flash ? "#ffffff" : e.accent;
  ctx.stroke();
  // Eye
  ctx.beginPath();
  ctx.arc(e.r * 0.3, 0, 2, 0, TAU);
  ctx.fillStyle = "#000";
  ctx.fill();
};

const drawLegacy = (ctx: CanvasRenderingContext2D, e: Enemy, flash: boolean): void => {
  // Gear shape: square base with notches
  const r = e.r;
  ctx.rotate(e.facing * 0.2);
  ctx.beginPath();
  ctx.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
  ctx.fillStyle = flash ? "#ffffff" : e.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = flash ? "#ffffff" : e.accent;
  ctx.stroke();

  // Inner cross of "code lines"
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) {
    ctx.moveTo(-r * 0.6, i * 4);
    ctx.lineTo(r * 0.6, i * 4);
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.stroke();
};

const drawDdos = (ctx: CanvasRenderingContext2D, e: Enemy, flash: boolean): void => {
  // Chevron / arrow shape
  ctx.rotate(e.facing);
  const r = e.r;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 0.5, -r * 0.7);
  ctx.lineTo(-r * 0.2, 0);
  ctx.lineTo(-r * 0.5, r * 0.7);
  ctx.closePath();
  ctx.fillStyle = flash ? "#ffffff" : e.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = flash ? "#ffffff" : e.accent;
  ctx.stroke();
};

const drawMemleak = (
  ctx: CanvasRenderingContext2D,
  e: Enemy,
  flash: boolean,
): void => {
  // Pulsating amorphous blob
  const t = e.aiTimer + performance.now() / 1000;
  const pts = 12;
  ctx.beginPath();
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * TAU;
    const wob = 1 + Math.sin(t * 2 + i * 0.7) * 0.18;
    const r = e.r * wob;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = flash ? "#ffffff" : e.color;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 3;
  ctx.strokeStyle = flash ? "#ffffff" : e.accent;
  ctx.stroke();

  // Inner core
  ctx.beginPath();
  ctx.arc(0, 0, e.r * 0.35, 0, TAU);
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.fill();
};

const drawTrojan = (
  ctx: CanvasRenderingContext2D,
  e: Enemy,
  flash: boolean,
): void => {
  // Triangle with dark facets
  ctx.rotate(e.facing);
  const r = e.r;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 0.7, -r);
  ctx.lineTo(-r * 0.7, r);
  ctx.closePath();
  ctx.fillStyle = flash ? "#ffffff" : e.color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = flash ? "#ffffff" : e.accent;
  ctx.stroke();

  // Inner glow
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.4, 0, TAU);
  ctx.fillStyle = "rgba(255, 200, 200, 0.7)";
  ctx.fill();
};

// ----- Projectiles -----

const drawProjectile = (ctx: CanvasRenderingContext2D, p: Projectile): void => {
  // Hostile blob (memleak puddle/trojan shot) gets a different render
  if (p.hostile) {
    if (p.size > 20) {
      // Memleak puddle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 1.2, 0, TAU);
      ctx.fillStyle = "rgba(160, 77, 255, 0.18)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fillStyle = "rgba(160, 77, 255, 0.5)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(160, 77, 255, 0.85)";
      ctx.stroke();
    } else {
      // Trojan shot — dart
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.beginPath();
      ctx.moveTo(p.size, 0);
      ctx.lineTo(-p.size * 0.6, -p.size * 0.5);
      ctx.lineTo(-p.size * 0.3, 0);
      ctx.lineTo(-p.size * 0.6, p.size * 0.5);
      ctx.closePath();
      ctx.fillStyle = "#ff8aa3";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.restore();
    }
    return;
  }

  switch (p.kind) {
    case "thread":
      drawThread(ctx, p);
      break;
    case "antivirus":
      drawAntivirus(ctx, p);
      break;
    case "laser":
      drawLaser(ctx, p);
      break;
    case "gc":
      drawGc(ctx, p);
      break;
    case "trojan_shot":
      // already handled above (hostile)
      break;
  }
};

const drawThread = (ctx: CanvasRenderingContext2D, p: Projectile): void => {
  // Trail
  const tlen = 3;
  const angle = Math.atan2(p.vy, p.vx);
  const tailX = p.x - Math.cos(angle) * p.size * tlen;
  const tailY = p.y - Math.sin(angle) * p.size * tlen;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = p.color;
  ctx.lineWidth = p.size * 0.5;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Head
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * 0.55, 0, TAU);
  ctx.fillStyle = p.color;
  ctx.fill();

  // White core
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * 0.25, 0, TAU);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
};

const drawAntivirus = (ctx: CanvasRenderingContext2D, p: Projectile): void => {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  // Cross / plus
  const s = p.size;
  ctx.beginPath();
  ctx.moveTo(-s, -s * 0.25);
  ctx.lineTo(s, -s * 0.25);
  ctx.lineTo(s, s * 0.25);
  ctx.lineTo(-s, s * 0.25);
  ctx.closePath();
  ctx.fillStyle = p.color;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-s * 0.25, -s);
  ctx.lineTo(s * 0.25, -s);
  ctx.lineTo(s * 0.25, s);
  ctx.lineTo(-s * 0.25, s);
  ctx.closePath();
  ctx.fillStyle = p.color;
  ctx.fill();

  // Glow
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.4, 0, TAU);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fill();

  ctx.restore();
};

const drawLaser = (ctx: CanvasRenderingContext2D, p: Projectile): void => {
  const angle = Math.atan2(p.vy, p.vx);
  const len = p.size * 5;
  const tailX = p.x - Math.cos(angle) * len;
  const tailY = p.y - Math.sin(angle) * len;

  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = "rgba(255, 85, 119, 0.25)";
  ctx.lineWidth = p.size * 1.6;
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = p.color;
  ctx.lineWidth = p.size * 0.8;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = p.size * 0.3;
  ctx.stroke();
};

const drawGc = (ctx: CanvasRenderingContext2D, p: Projectile): void => {
  // Pulsating bomb
  const pulse = 1 + Math.sin(p.angle * 2) * 0.18;
  const r = p.size * 0.7 * pulse;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 1.6, 0, TAU);
  ctx.fillStyle = "rgba(255, 179, 71, 0.18)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TAU);
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#a06a1f";
  ctx.stroke();

  // Fuse
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 0.4, 0, TAU);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Countdown ticks
  const t = Math.max(0, p.life);
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    if (i / segs > t) continue;
    const a = (i / segs) * TAU;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(a) * r * 1.1, p.y + Math.sin(a) * r * 1.1);
    ctx.lineTo(p.x + Math.cos(a) * r * 1.3, p.y + Math.sin(a) * r * 1.3);
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
};

// ----- Particles -----

const drawParticle = (ctx: CanvasRenderingContext2D, p: Particle): void => {
  const t = p.life / p.maxLife; // 1 → 0
  switch (p.kind) {
    case "spark": {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * t, 0, TAU);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case "ring": {
      const radius = p.size * (1 - t * 0.2);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, TAU);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 4 * t;
      ctx.globalAlpha = Math.max(0, t);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case "smoke": {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (2 - t), 0, TAU);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, t * 0.4);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case "text": {
      ctx.save();
      ctx.font = `${p.size}px JetBrains Mono, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillText(p.text ?? "", p.x, p.y);
      ctx.globalAlpha = 1;
      ctx.restore();
      break;
    }
  }
};

// ----- Firewall aura (drawn under entities) -----

const drawFirewallAura = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  const fw = state.weapons.get("firewall");
  if (!fw) return;
  const FIREWALL_LEVELS = [
    { radius: 78 },
    { radius: 94 },
    { radius: 94 },
    { radius: 118 },
    { radius: 153 },
  ];
  const r = FIREWALL_LEVELS[fw.level - 1].radius * state.player.stats.areaMul;
  const t = state.realTime;
  ctx.save();
  ctx.translate(state.player.x, state.player.y);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = "rgba(255, 122, 77, 0.05)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.strokeStyle = `rgba(255, 122, 77, ${0.2 + Math.sin(t * 4) * 0.1})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.lineDashOffset = -t * 30;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
};
