// All movement/flock tunables in one place. Grows in later plans.
export const config = {
  dtClampMax: 1 / 30, // clamp dt to avoid integration blow-ups / tunneling on hitches
  damping: 0.1, // velocity fraction RETAINED per second when no force (coast to stop)
  flock: {
    radius: 5,
    maxSpeed: 38,
    maxForce: 80,
    personalSpace: 12,
    perception: 40,
    cohesionK: 6,
    moveThreshold: 2, // px/s: a neighbour faster than this counts as "moving" for follow
    weights: { separation: 1.6, cohesion: 0.9, follow: 0.5 },
  },
  grass: { cellSize: 16, regrowRate: 0.03, depleteRate: 0.4, initial: 1 },
  drives: { hungerRate: 0.05, grazeRate: 0.5 },
  graze: { weight: 1.0 },
  obstacleAvoid: { weight: 1.6, avoidRadius: 18 },
  pen: { rMin: 40, rMax: 60, minVerts: 5, maxVerts: 9, minGateWidth: 24 },
  dog: { radius: 6, maxSpeed: 70, maxForce: 400, sprintMult: 1.6, stopGain: 12 },
  bounds: { x: 0, y: 0, w: 480, h: 270 },
} as const;
