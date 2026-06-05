export interface Vec2 {
  x: number;
  y: number;
}

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const lenSq = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const len = (a: Vec2): number => Math.sqrt(lenSq(a));
export const distSq = (a: Vec2, b: Vec2): number => lenSq(sub(a, b));
export const dist = (a: Vec2, b: Vec2): number => Math.sqrt(distSq(a, b));

export const normalize = (a: Vec2): Vec2 => {
  const l = len(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};

export const truncate = (a: Vec2, max: number): Vec2 => {
  const l = len(a);
  return l > max && l > 0 ? scale(a, max / l) : { x: a.x, y: a.y };
};

// left-hand perpendicular (90° CCW)
export const perp = (a: Vec2): Vec2 => ({ x: a.y === 0 ? 0 : -a.y, y: a.x });
