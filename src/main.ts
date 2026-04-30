// Entry point: wire up canvas, input, game loop, UI.

import "./style.css";

import { initInput, sampleInput, setChoiceHandler, setPauseHandler, setStartHandler } from "./input";
import { initRenderer, render } from "./render";
import { createGameState, resetGameState } from "./state";
import { stepGame } from "./systems";
import {
  applyChoice,
  closeOverlay,
  consumeLevelUpChoice,
  initUi,
  showGameOver,
  showLevelUp,
  showMenu,
  showPause,
  updateHud,
} from "./ui";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const uiRoot = document.getElementById("ui") as HTMLElement;

initRenderer(canvas);
initInput(canvas);
initUi(uiRoot);

const state = createGameState();

// ----- Game flow -----

const startNewRun = (): void => {
  resetGameState(state);
  closeOverlay();
};

const togglePause = (): void => {
  if (state.phase === "playing") {
    state.phase = "paused";
    showPause(
      () => {
        state.phase = "playing";
        closeOverlay();
      },
      () => {
        startNewRun();
      },
    );
  } else if (state.phase === "paused") {
    state.phase = "playing";
    closeOverlay();
  }
};

const onChoiceKey = (idx: number): void => {
  if (state.phase === "levelup") applyChoice(state, idx);
};

const onStartKey = (): void => {
  if (state.phase === "menu" || state.phase === "gameover") {
    startNewRun();
  } else if (state.phase === "levelup") {
    // First option fallback
    if (state.currentChoices[0]) consumeLevelUpChoice(state, state.currentChoices[0]);
  }
};

setPauseHandler(togglePause);
setChoiceHandler(onChoiceKey);
setStartHandler(onStartKey);

// Show initial menu
showMenu(state, startNewRun);

// ----- Loop -----

let lastTime = performance.now() / 1000;
let acc = 0;
const FIXED_DT = 1 / 60; // 60 Hz logic
const MAX_DT = 0.25; // clamp big stalls
let lastUiUpdate = 0;
let prevPhase: string = state.phase;

const tick = (): void => {
  const now = performance.now() / 1000;
  let dt = now - lastTime;
  lastTime = now;
  state.realTime = now;
  if (dt > MAX_DT) dt = MAX_DT;

  // FPS readout (smoothed)
  state.fpsAccum += dt;
  state.fpsFrames++;
  if (state.fpsAccum > 0.5) {
    state.fps = state.fpsFrames / state.fpsAccum;
    state.fpsFrames = 0;
    state.fpsAccum = 0;
  }

  acc += dt;
  // Step physics with fixed dt; if very behind, allow up to 5 catch-up steps
  let steps = 0;
  while (acc >= FIXED_DT && steps < 5) {
    if (state.phase === "playing") {
      stepGame(state, FIXED_DT);
    } else if (state.phase === "menu" || state.phase === "paused" || state.phase === "levelup" || state.phase === "gameover") {
      // Tick particles for menu animations? Skip for simplicity.
    }
    acc -= FIXED_DT;
    steps++;
  }
  // Drain leftover (avoid spiral of death)
  if (steps === 5) acc = 0;

  // Detect phase transitions to drive overlays
  if (state.phase !== prevPhase) {
    if (state.phase === "levelup") {
      showLevelUp(state, (opt) => consumeLevelUpChoice(state, opt));
    }
    if (state.phase === "gameover") {
      showGameOver(state, false, startNewRun);
    }
    if (state.phase === "victory") {
      showGameOver(state, true, startNewRun);
    }
    if (state.phase === "menu") {
      showMenu(state, startNewRun);
    }
    prevPhase = state.phase;
  }

  // Sample input every frame (so paused still doesn't drift)
  if (state.phase === "playing") {
    sampleInput(state, canvas);
  }

  // Render
  render(state);

  // Update HUD at lower frequency than draw to save DOM cost
  if (now - lastUiUpdate > 1 / 30) {
    updateHud(state);
    lastUiUpdate = now;
  }

  requestAnimationFrame(tick);
};

requestAnimationFrame(tick);

// Expose for debugging in console
;(window as unknown as { __NS: unknown }).__NS = { state };
