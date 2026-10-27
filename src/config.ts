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
    handLostGraceMs: 300, // keep the last hand pose this long when detection blinks out
    touchMs: 180, // index finger resting on a button / gem this long counts as a touch
    dwellMs: 2000, // hover over a button this long to press it without pinching
    modeConfirmMs: 150,
    thumbsUpHoldMs: 1000,
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
