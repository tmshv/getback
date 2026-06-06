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
  drives: { hungerRate: 0.05, grazeRate: 0.5, thirstRate: 0.03, drinkRate: 0.6 },
  graze: { weight: 1.0 },
  obstacleAvoid: { weight: 1.6, avoidRadius: 18 },
  pen: { rMin: 40, rMax: 60, minVerts: 5, maxVerts: 9, minGateWidth: 24, settleRadius: 30, settleWeight: 0.6 },
  respawn: { scatterMargin: 20, scatterTries: 20 }, // fresh-flock placement when a pen fills
  dog: { radius: 6, maxSpeed: 70, maxForce: 400, sprintMult: 1.6, stopGain: 12 },
  scare: { presenceRadius: 26, presenceIntensity: 0.25, barkRadius: 70, barkIntensity: 1, barkCooldown: 0.8 },
  stamina: { max: 100, sprintDrain: 18, regen: 22, barkCost: 12 },
  flee: { weight: 2.5 },
  fear: { decay: 1.2 }, // fear units shed per second when no stress is near
  bounds: { x: 0, y: 0, w: 480, h: 270 },
  attractor: {
    trunkRadius: 7,      // solid tree trunk
    shadeRadius: 28,     // restful shade canopy, larger than trunk
    waterRadius: 22,     // default water hole radius
  },
  traits: {
    maxSpeedJitter: 0.2,   // ±20% of flock.maxSpeed
    boldnessMin: 0.3,
    boldnessMax: 0.9,
    sociabilityMin: 0.4,
    sociabilityMax: 1.0,
  },
} as const;
