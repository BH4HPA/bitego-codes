import { create } from "zustand";

export type ToastItem = { id: string; message: string; createdAt: number };

type State = {
  queue: ToastItem[];
  push: (message: string) => void;
  shift: () => void;
  clear: () => void;
};

let seq = 0;

export const useToastStore = create<State>((set) => ({
  queue: [],
  push: (message: string) => {
    const v = (message || "").trim();
    if (!v) return;
    const id = `t_${Date.now()}_${(seq += 1)}`;
    const item: ToastItem = { id, message: v, createdAt: Date.now() };
    set((s) => ({ queue: [...s.queue, item].slice(-6) }));
  },
  shift: () => set((s) => ({ queue: s.queue.slice(1) })),
  clear: () => set({ queue: [] }),
}));
