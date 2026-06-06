import { describe, it, expect } from "vitest";
import { selectFrame } from "./AnimationSystem.js";
import { FRAME_DURATION } from "../config.js";

const W = FRAME_DURATION.WALK; // 0.12 s per walk frame

describe("selectFrame — idle (not moving, not barking, not grazing)", () => {
  it("returns *_down_idle for a stopped dog facing down", () => {
    const result = selectFrame({
      kind: "dog", moving: false, penned: false, barking: false, grazing: false,
      facing: "down", timer: 0, dt: 0,
    });
    expect(result.frame).toBe("corgi_down_idle");
    expect(result.flipX).toBe(false);
  });

  it("returns *_up_idle for a stopped sheep facing up", () => {
    const result = selectFrame({
      kind: "sheep", moving: false, penned: false, barking: false, grazing: false,
      facing: "up", timer: 0, dt: 0,
    });
    expect(result.frame).toBe("sheep_up_idle");
    expect(result.flipX).toBe(false);
  });
});

describe("selectFrame — walk cycle", () => {
  it("returns walk0 at timer=0", () => {
    const r = selectFrame({
      kind: "dog", moving: true, penned: false, barking: false, grazing: false,
      facing: "down", timer: 0, dt: 0,
    });
    expect(r.frame).toBe("corgi_down_walk0");
  });

  it("returns walk1 at timer=1×W", () => {
    const r = selectFrame({
      kind: "sheep", moving: true, penned: false, barking: false, grazing: false,
      facing: "down", timer: W, dt: 0,
    });
    expect(r.frame).toBe("sheep_down_walk1");
  });

  it("returns walk3 at timer=3×W", () => {
    const r = selectFrame({
      kind: "dog", moving: true, penned: false, barking: false, grazing: false,
      facing: "down", timer: 3 * W, dt: 0,
    });
    expect(r.frame).toBe("corgi_down_walk3");
  });

  it("wraps: timer=4×W returns walk0 again", () => {
    const r = selectFrame({
      kind: "dog", moving: true, penned: false, barking: false, grazing: false,
      facing: "down", timer: 4 * W, dt: 0,
    });
    expect(r.frame).toBe("corgi_down_walk0");
  });

  it("wraps fractionally: timer=4.5×W returns walk0", () => {
    const r = selectFrame({
      kind: "dog", moving: true, penned: false, barking: false, grazing: false,
      facing: "down", timer: 4.5 * W, dt: 0,
    });
    expect(r.frame).toBe("corgi_down_walk0");
  });
});

describe("selectFrame — bark", () => {
  it("returns *_bark when dog is barking (overrides motion)", () => {
    const r = selectFrame({
      kind: "dog", moving: true, penned: false, barking: true, grazing: false,
      facing: "up", timer: 0, dt: 0,
    });
    expect(r.frame).toBe("corgi_up_bark");
  });

  it("returns idle (not bark) for sheep even if barking=true", () => {
    // sheep don't bark; barking flag is ignored for sheep
    const r = selectFrame({
      kind: "sheep", moving: false, penned: false, barking: true, grazing: false,
      facing: "down", timer: 0, dt: 0,
    });
    expect(r.frame).toBe("sheep_down_idle");
  });
});

describe("selectFrame — graze", () => {
  it("returns sheep_down_graze when grazing and facing down", () => {
    const r = selectFrame({
      kind: "sheep", moving: false, penned: false, barking: false, grazing: true,
      facing: "down", timer: 0, dt: 0,
    });
    expect(r.frame).toBe("sheep_down_graze");
  });

  it("graze overrides idle but not motion — moving sheep does not graze", () => {
    // a moving sheep is walking, not grazing, even if grazing=true
    const r = selectFrame({
      kind: "sheep", moving: true, penned: false, barking: false, grazing: true,
      facing: "down", timer: 0, dt: 0,
    });
    expect(r.frame).toBe("sheep_down_walk0");
  });
});

describe("selectFrame — side mirroring", () => {
  it("right-facing side: flipX=false", () => {
    const r = selectFrame({
      kind: "sheep", moving: false, penned: false, barking: false, grazing: false,
      facing: "right", timer: 0, dt: 0,
    });
    expect(r.frame).toBe("sheep_side_idle");
    expect(r.flipX).toBe(false);
  });

  it("left-facing side: same frame, flipX=true", () => {
    const r = selectFrame({
      kind: "sheep", moving: false, penned: false, barking: false, grazing: false,
      facing: "left", timer: 0, dt: 0,
    });
    expect(r.frame).toBe("sheep_side_idle");
    expect(r.flipX).toBe(true);
  });

  it("left-facing dog walking: side walk frame, flipX=true", () => {
    const r = selectFrame({
      kind: "dog", moving: true, penned: false, barking: false, grazing: false,
      facing: "left", timer: W, dt: 0,
    });
    expect(r.frame).toBe("corgi_side_walk1");
    expect(r.flipX).toBe(true);
  });
});
