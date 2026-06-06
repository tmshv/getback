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
