// All tunable numbers live here (PRD section 14 tips).
export const CONFIG = {
  video: { width: 1280, height: 720 },
  models: {
    face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    wasm: `${import.meta.env.BASE_URL}mediapipe/wasm`,
  },
  smoothing: {
    face: { minCutoff: 4.0, beta: 120, dCutoff: 8 },
    hand: { minCutoff: 1.5, beta: 12 },
  },
  gestures: {
    pinchEngage: 0.42, // thumb-index distance / hand size
    pinchRelease: 0.62,
    swipeDistance: 0.15, // fraction of screen height, open hand
    swipeWindowMs: 500,
    swipeCooldownMs: 500,
    swipeOpenRatio: 1.35, // fingertip/knuckle distance from wrist to count a finger as open
    swipeStraight: 1.6, // how much more vertical than horizontal the sweep must be
    dwellMs: 2000, // hover over a button this long to press it without pinching
    modeConfirmMs: 150,
    fistHoldMs: 500,
    thumbsUpHoldMs: 1000,
    undoCooldownMs: 900,
  },
  face: { lostMs: 600 },
  gems: {
    max: 400,
    refFaceWidth: 420, // tray sizes are px at this face width
    sizesPx: { small: 7, medium: 20, large: 46 } as Record<string, number>,
    trailSpacing: 0.035, // fraction of face width
    sitOnSurface: 0.42, // offset along normal, in gem sizes
  },
  capture: { countdownSeconds: 3, pauseBetweenMs: 1500 },
  musicVolume: 0.5,
  musicDuckVolume: 0.15,
};
