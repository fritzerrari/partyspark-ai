// Global dock/module open-state. Single source of truth so multiple
// trigger surfaces (TransportBar, ModuleDock FAB, deep links) don't
// render duplicate overlays.
import { create } from "zustand";

export type ModuleId =
  | "twin-deck"
  | "sequencer"
  | "loop-pads"
  | "vocal"
  | "coach"
  | "remix"
  | "autotune"
  | "mashup"
  | "project-tray";

type DockState = {
  open: Record<ModuleId, boolean>;
  toggle: (id: ModuleId) => void;
  openModule: (id: ModuleId) => void;
  close: (id: ModuleId) => void;
  isOpen: (id: ModuleId) => boolean;
};

const EMPTY: Record<ModuleId, boolean> = {
  "twin-deck": false,
  sequencer: false,
  "loop-pads": false,
  vocal: false,
  coach: false,
  remix: false,
  autotune: false,
  mashup: false,
  "project-tray": false,
};

export const useDock = create<DockState>((set, get) => ({
  open: { ...EMPTY },
  toggle: (id) =>
    set((s) => ({ open: { ...s.open, [id]: !s.open[id] } })),
  openModule: (id) => set((s) => ({ open: { ...s.open, [id]: true } })),
  close: (id) => set((s) => ({ open: { ...s.open, [id]: false } })),
  isOpen: (id) => get().open[id],
}));