# Neural Survivor

Browser-based Bullet Heaven (reverse bullet hell, Vampire Survivors-style)
game built from scratch with **Vite + TypeScript + Canvas 2D**. The art is
geometric / vector style — every entity is drawn from primitives, in the
spirit of SVG.

**Setting.** You play a developing **AI** (нейросеть). Enemies are viruses,
bugs, legacy code, DDOS packets, and mini-bosses (memory leaks, trojans).
All in-game text is in **Russian**.

## Quickstart

```bash
npm install
npm run dev       # http://localhost:5173
npm run build
npm run preview
```

## Controls

| Key                | Action                              |
| ------------------ | ----------------------------------- |
| **WASD / arrows**  | Move                                |
| **LMB hold**       | Move toward cursor (alt control)    |
| **1 / 2 / 3**      | Pick a level-up upgrade             |
| **ESC / P**        | Pause                               |
| **Auto**           | Attacks fire automatically          |

## Architecture

- `src/main.ts` — bootstrap, fixed-timestep game loop.
- `src/types.ts` — entity types and `GameState`.
- `src/balance.ts` — all tuning constants and difficulty curves.
- `src/state.ts` — `GameState` factory and reset.
- `src/input.ts` — keyboard + mouse input sampling.
- `src/utils.ts` — RNG (Mulberry32), spatial hash, math helpers.
- `src/enemies.ts` — enemy definitions, spawning, AI (boss schedules).
- `src/weapons.ts` — weapon definitions (6 weapons), firing, damage.
- `src/upgrades.ts` — 6 weapons + 13 passive modules with 5 levels each.
- `src/systems.ts` — movement, projectiles, collisions, pickups, particles.
- `src/render.ts` — Canvas 2D renderer (geometric SVG-style shapes).
- `src/ui.ts` — DOM-based HUD, menus, level-up cards, game over.
- `src/texts.ts` — Russian UI strings.

### Performance
- Spatial hash grid (96 px cells) for enemy/projectile collisions — O(n).
- Fixed 60 Hz logic with up to 5 catch-up steps per frame.
- View culling for offscreen entities.
- In-place compaction of dead-entity arrays every 4 frames.
- DPR-aware canvas scaling.
- HUD updates throttled to 30 Hz (DOM mutations are expensive).

### Weapons
- **Многопоточность** — auto-aimed thread bullets, gains projectiles per level.
- **Файрвол** — pulsing damage aura around the player.
- **Антивирус** — homing packets, escalates count and damage.
- **Сборщик мусора** — GC bombs with delayed AoE explosion.
- **Лазер** — piercing instant beams to nearest enemy.
- **Дебаггер** — high-pierce probe shots.

### Passives (13)
GPU clock, weights, L1 cache, regen, route optimization, TPU range,
compression, bandwidth, augmentation, armor, stochastics, area, duration.

