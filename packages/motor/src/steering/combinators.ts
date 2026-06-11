import type { BehaviorNode, Predicate } from "./types.js";

// Run `child` only when `pred` holds; otherwise opt out ("skipped") with zero
// force. Lets a sub-tree be gated on a condition (e.g. only-when-penned).
export function conditional(pred: Predicate, child: BehaviorNode): BehaviorNode {
  return {
    run(e, ctx, out) {
      if (!pred(e, ctx)) {
        out.x = 0;
        out.y = 0;
        return "skipped";
      }
      return child.run(e, ctx, out);
    },
  };
}

// Try children in priority order; the FIRST that fires wins (its force stays in
// `out`) and later children are skipped. If every child skips, write zero and
// report "skipped".
export function selector(children: BehaviorNode[]): BehaviorNode {
  return {
    run(e, ctx, out) {
      for (const c of children) {
        if (c.run(e, ctx, out) === "fired") return "fired";
      }
      out.x = 0;
      out.y = 0;
      return "skipped";
    },
  };
}

// Transparent decorator: runs `child` unchanged (same status, same force in
// `out`), but records `label` on the entity's debug side-channel when the child
// FIRES. Used to tag which behaviour mode actually drove a sheep this frame
// (penned/drink/graze/rest/flee). No-op when the entity has no debug record, so
// it costs nothing in headless/test runs.
export function tag(label: string, child: BehaviorNode): BehaviorNode {
  return {
    run(e, ctx, out) {
      const status = child.run(e, ctx, out);
      if (status === "fired") e.debug?.fired.push(label);
      return status;
    },
  };
}

// Like `tag`, but records the label only when the child fires AND produces a
// non-zero force. Some leaves (fleeStress, obstacleAvoid) always report "fired"
// even with zero force, so status alone can't tell whether they're actually
// acting — flee uses this so "fleeing" reflects real flee pressure, not presence.
export function tagIfForce(label: string, child: BehaviorNode): BehaviorNode {
  return {
    run(e, ctx, out) {
      const status = child.run(e, ctx, out);
      if (status === "fired" && (out.x !== 0 || out.y !== 0)) e.debug?.fired.push(label);
      return status;
    },
  };
}
