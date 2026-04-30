// ===== Math helpers =====

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;

export const dist = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
};

export const dist2 = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

// ===== Seeded RNG (Mulberry32) =====

export interface RNG {
  state: number;
}

export const createRng = (seed: number): RNG => ({
  state: seed >>> 0,
});

export const rngNext = (rng: RNG): number => {
  let t = (rng.state = (rng.state + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const rngRange = (rng: RNG, lo: number, hi: number): number =>
  lo + (hi - lo) * rngNext(rng);

export const rngInt = (rng: RNG, lo: number, hi: number): number =>
  Math.floor(rngRange(rng, lo, hi + 1));

export const rngPick = <T>(rng: RNG, arr: readonly T[]): T =>
  arr[Math.floor(rngNext(rng) * arr.length)];

// Weighted pick: weights[i] is weight of arr[i]; returns -1 if pool empty.
export const rngPickWeighted = <T>(
  rng: RNG,
  arr: readonly T[],
  weights: readonly number[],
): T | null => {
  if (arr.length === 0) return null;
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return arr[0];
  let r = rngNext(rng) * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
};

// ===== Spatial hash =====
// Simple uniform grid over world coordinates. Used for enemies only — bullets
// query the grid for enemies, and player queries it for orbs/enemies.

export class SpatialHash<T extends { x: number; y: number; r: number }> {
  private cell: number;
  private buckets: Map<number, T[]> = new Map();

  constructor(cellSize: number) {
    this.cell = cellSize;
  }

  private key(cx: number, cy: number): number {
    // Cantor pairing-ish, with sign offset.
    // Range good for ±32k cells.
    return ((cx + 0x8000) << 16) | (cy & 0xffff);
  }

  clear(): void {
    this.buckets.clear();
  }

  insert(item: T): void {
    const cx = Math.floor(item.x / this.cell);
    const cy = Math.floor(item.y / this.cell);
    const k = this.key(cx, cy);
    let arr = this.buckets.get(k);
    if (!arr) {
      arr = [];
      this.buckets.set(k, arr);
    }
    arr.push(item);
  }

  /** Iterate items within radius of (x, y). Calls cb on each candidate; cb
   * itself must do the precise distance check.
   */
  query(x: number, y: number, radius: number, cb: (item: T) => void): void {
    const minX = Math.floor((x - radius) / this.cell);
    const maxX = Math.floor((x + radius) / this.cell);
    const minY = Math.floor((y - radius) / this.cell);
    const maxY = Math.floor((y + radius) / this.cell);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const arr = this.buckets.get(this.key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) cb(arr[i]);
      }
    }
  }

  /** Find the closest item to (x,y) within radius, or null. */
  closest(x: number, y: number, radius: number): T | null {
    let best: T | null = null;
    let bestD = radius * radius;
    this.query(x, y, radius, (it) => {
      const d = dist2(x, y, it.x, it.y);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    });
    return best;
  }
}

// ===== Misc =====

export const angleTo = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => Math.atan2(by - ay, bx - ax);

export const formatTime = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
};

export const formatNumber = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 10_000) return (n / 1000).toFixed(1) + "k";
  return Math.floor(n).toString();
};
