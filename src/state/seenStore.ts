import fs from "node:fs";
import path from "node:path";
import type { SeenState } from "../types.js";

export function jstDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function loadSeenState(statePath: string): SeenState {
  if (!fs.existsSync(statePath)) {
    return { seenIds: [], dailyCosts: {}, updatedAt: null };
  }
  const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as Partial<SeenState>;
  return {
    seenIds: Array.isArray(parsed.seenIds) ? parsed.seenIds : [],
    dailyCosts: parsed.dailyCosts ?? {},
    updatedAt: parsed.updatedAt ?? null
  };
}

export function saveSeenState(statePath: string, state: SeenState): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const next: SeenState = {
    seenIds: [...new Set(state.seenIds)].sort(),
    dailyCosts: state.dailyCosts,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(statePath, `${JSON.stringify(next, null, 2)}\n`);
}

export function addDeliveredIds(state: SeenState, ids: string[]): SeenState {
  return {
    ...state,
    seenIds: [...new Set([...state.seenIds, ...ids])]
  };
}

export function addDailyCost(state: SeenState, costUsd: number, dateKey = jstDateKey()): SeenState {
  const current = state.dailyCosts[dateKey] ?? 0;
  return {
    ...state,
    dailyCosts: {
      ...state.dailyCosts,
      [dateKey]: Number((current + costUsd).toFixed(6))
    }
  };
}
