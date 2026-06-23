// Cockpit Copilot log — single zustand store that the Auto-DJ engine
// pushes commentary into, and the right-hand panel renders.
import { create } from "zustand";

export type LogKind = "info" | "act" | "ok" | "warn";
export type LogEntry = { id: string; ts: number; msg: string; kind: LogKind };

type State = {
  entries: LogEntry[];
  push: (msg: string, kind?: LogKind) => void;
  clear: () => void;
};

let counter = 0;

export const useCopilotLog = create<State>((set) => ({
  entries: [],
  push(msg, kind = "info") {
    const entry: LogEntry = { id: `cp-${Date.now()}-${counter++}`, ts: Date.now(), msg, kind };
    set((s) => ({ entries: [entry, ...s.entries].slice(0, 80) }));
  },
  clear() { set({ entries: [] }); },
}));

/** Convenience pusher importable from non-React code without hooks. */
export function pushLog(msg: string, kind: LogKind = "info") {
  try { useCopilotLog.getState().push(msg, kind); } catch { /* noop */ }
}