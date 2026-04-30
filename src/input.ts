// Input: keyboard + mouse.
// Output is sampled into GameState.inputDir each frame.

import type { GameState, Vec2 } from "./types";

interface InputState {
  keys: Set<string>;
  mouse: Vec2; // screen pixels
  mouseDown: boolean;
  pause: boolean;
  pauseToggleHandler: (() => void) | null;
  choiceHandler: ((idx: number) => void) | null;
  startHandler: (() => void) | null;
}

const inputState: InputState = {
  keys: new Set(),
  mouse: { x: 0, y: 0 },
  mouseDown: false,
  pause: false,
  pauseToggleHandler: null,
  choiceHandler: null,
  startHandler: null,
};

export const setPauseHandler = (fn: () => void): void => {
  inputState.pauseToggleHandler = fn;
};
export const setChoiceHandler = (fn: (idx: number) => void): void => {
  inputState.choiceHandler = fn;
};
export const setStartHandler = (fn: () => void): void => {
  inputState.startHandler = fn;
};

export const initInput = (canvas: HTMLCanvasElement): void => {
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    inputState.keys.add(k);

    if (k === "escape" || k === "p") {
      inputState.pauseToggleHandler?.();
      e.preventDefault();
    }
    if (k === "enter" || k === " ") {
      inputState.startHandler?.();
    }
    if (k === "1" || k === "2" || k === "3") {
      inputState.choiceHandler?.(parseInt(k, 10) - 1);
    }
    // Prevent page scroll on arrows / space
    if (
      k === "arrowup" ||
      k === "arrowdown" ||
      k === "arrowleft" ||
      k === "arrowright" ||
      k === " "
    ) {
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", (e) => {
    inputState.keys.delete(e.key.toLowerCase());
  });

  window.addEventListener("blur", () => {
    inputState.keys.clear();
    inputState.mouseDown = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    inputState.mouse.x = e.clientX - rect.left;
    inputState.mouse.y = e.clientY - rect.top;
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) inputState.mouseDown = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) inputState.mouseDown = false;
  });

  canvas.addEventListener("touchstart", (e) => {
    if (e.touches[0]) {
      const rect = canvas.getBoundingClientRect();
      inputState.mouse.x = e.touches[0].clientX - rect.left;
      inputState.mouse.y = e.touches[0].clientY - rect.top;
      inputState.mouseDown = true;
    }
  }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches[0]) {
      const rect = canvas.getBoundingClientRect();
      inputState.mouse.x = e.touches[0].clientX - rect.left;
      inputState.mouse.y = e.touches[0].clientY - rect.top;
    }
  }, { passive: true });
  canvas.addEventListener("touchend", () => {
    inputState.mouseDown = false;
  });
};

const checkKey = (...keys: string[]): boolean => {
  for (const k of keys) {
    if (inputState.keys.has(k)) return true;
  }
  return false;
};

/** Sample input into game state. canvas is needed to convert mouse -> world. */
export const sampleInput = (
  state: GameState,
  canvas: HTMLCanvasElement,
): void => {
  let dx = 0;
  let dy = 0;
  if (checkKey("w", "arrowup")) dy -= 1;
  if (checkKey("s", "arrowdown")) dy += 1;
  if (checkKey("a", "arrowleft")) dx -= 1;
  if (checkKey("d", "arrowright")) dx += 1;

  // Mouse-aim: if no keyboard direction and mouse down, move toward mouse
  state.mouseAim = dx === 0 && dy === 0 && inputState.mouseDown;

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    state.inputDir.x = dx / len;
    state.inputDir.y = dy / len;
  } else if (state.mouseAim) {
    // Compute world-space mouse pos and direction
    const rect = canvas.getBoundingClientRect();
    const mx = inputState.mouse.x;
    const my = inputState.mouse.y;
    const dxw = mx - rect.width / 2;
    const dyw = my - rect.height / 2;
    const d = Math.hypot(dxw, dyw);
    if (d > 12) {
      state.inputDir.x = dxw / d;
      state.inputDir.y = dyw / d;
    } else {
      state.inputDir.x = 0;
      state.inputDir.y = 0;
    }
  } else {
    state.inputDir.x = 0;
    state.inputDir.y = 0;
  }

  // Mouse world position (for any aim-based weapon, or HUD info).
  const rect = canvas.getBoundingClientRect();
  state.mouseWorld.x =
    state.player.x + (inputState.mouse.x - rect.width / 2);
  state.mouseWorld.y =
    state.player.y + (inputState.mouse.y - rect.height / 2);
};
