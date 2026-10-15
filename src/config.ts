// All tunable numbers live here (PRD section 14 tips).
export const CONFIG = {
  video: { width: 1280, height: 720 },
  models: {
    face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    wasm: `${import.meta.env.BASE_URL}mediapipe/wasm`,
  },
  smoothing: {
    face: { minCutoff: 2.0, beta: 15 },
    hand: { minCutoff: 1.5, beta: 12 },
  },
  gestures: {
    pinchEngage: 0.3, // thumb-index distance / hand size
    pinchRelease: 0.45,
    modeConfirmMs: 150,
    fistHoldMs: 500,
    thumbsUpHoldMs: 1000,
    undoCooldownMs: 900,
    snapContact: 0.25, // middle-thumb distance counted as touching
    snapOpen: 0.5, // distance counted as released
    snapMaxMs: 150, // contact -> open must happen within this
    snapCooldownMs: 1500,
    snapRestoreMs: 5000,
  },
  face: { lostMs: 600 },
  gems: {
    max: 400,
    refFaceWidth: 420, // tray sizes are px at this face width
    sizesPx: { small: 7, medium: 12, large: 20 } as Record<string, number>,
    stampRadius: 0.17, // fraction of face width
    stampCount: 22,
    trailSpacing: 0.035, // fraction of face width
    sitOnSurface: 0.42, // offset along normal, in gem sizes
  },
  capture: { countdownSeconds: 3, pauseBetweenMs: 1500 },
  musicVolume: 0.5,
  musicDuckVolume: 0.15,
};
