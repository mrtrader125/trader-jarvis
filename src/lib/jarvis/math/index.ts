// /lib/jarvis/math/index.ts
import {
  MathTask,
  MathTaskResult,
} from "./types";
import { calculatePositionSize } from "./risk";
import { buildPropFirmPlan } from "./propFirm";
import { buildCompoundingPlan } from "./compounding";

export * from "./types";
export * from "./risk";
export * from "./propFirm";
export * from "./compounding";

export function runMathTask(task: MathTask): MathTaskResult {
  switch (task.type) {
    case "position-size": {
      const result = calculatePositionSize(task.input);
      return { type: "position-size", result };
    }
    case "prop-firm-plan": {
      const result = buildPropFirmPlan(task.input);
      return { type: "prop-firm-plan", result };
    }
    case "compounding-plan": {
      const result = buildCompoundingPlan(task.input);
      return { type: "compounding-plan", result };
    }
    default: {
      // Exhaustive check
      const _never: never = task;
      throw new Error("Unknown math task type");
    }
  }
}
