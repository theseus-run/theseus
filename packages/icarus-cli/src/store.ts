/**
 * Store — minimal React state bridge for daemon event streams.
 *
 * Provides a mutable store that Ink components subscribe to via
 * useSyncExternalStore. The daemon event pump pushes events into
 * the store from the Effect world; React re-renders on change.
 */

import { useSyncExternalStore } from "react";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import type * as Agent from "@theseus.run/core/Agent";

// ---------------------------------------------------------------------------
// Chat line — unified display model
// ---------------------------------------------------------------------------

export type ChatLine =
  | { readonly kind: "user"; readonly text: string; readonly id: number }
  | { readonly kind: "assistant"; readonly text: string; readonly id: number }
  | { readonly kind: "system"; readonly text: string; readonly id: number }
  | { readonly kind: "event"; readonly event: Dispatch.Event; readonly id: number };

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface StoreState {
  readonly lines: ReadonlyArray<ChatLine>;
  /** Accumulated text from TextDelta events (current response). */
  readonly streamText: string;
  /** Latest iteration number. */
  readonly iteration: number;
  /** Agent name (from first event). */
  readonly agent: string;
  /** Final result of current turn, if done. */
  readonly result: Agent.Result | null;
  /** Whether the dispatch is still running. */
  readonly running: boolean;
}

const initialState: StoreState = {
  lines: [],
  streamText: "",
  iteration: 0,
  agent: "",
  result: null,
  running: false,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface Store {
  getState: () => StoreState;
  subscribe: (cb: () => void) => () => void;
  push: (event: Dispatch.Event) => void;
  pushUserMessage: (text: string) => void;
  pushSystem: (text: string) => void;
  reset: () => void;
}

export const createStore = (): Store => {
  let state = initialState;
  let nextId = 0;
  const listeners = new Set<() => void>();

  const notify = () => { for (const cb of listeners) cb(); };

  const update = (partial: Partial<StoreState>) => {
    state = { ...state, ...partial };
    notify();
  };

  const push = (event: Dispatch.Event) => {
    let { streamText, iteration, agent, result, running } = state;

    if (event.agent && !agent) agent = event.agent;

    // Only non-delta events go into the scrollback lines
    const isDisplayable =
      event._tag !== "TextDelta" &&
      event._tag !== "ThinkingDelta" &&
      event._tag !== "Thinking";

    // Flush accumulated stream text before any non-delta event
    let currentLines = state.lines;
    if (isDisplayable && streamText) {
      currentLines = [...currentLines, { kind: "assistant" as const, text: streamText, id: nextId++ }];
      streamText = "";
    }

    const lines = isDisplayable
      ? [...currentLines, { kind: "event" as const, event, id: nextId++ }]
      : currentLines;

    switch (event._tag) {
      case "Calling":
        iteration = event.iteration;
        streamText = "";
        break;
      case "TextDelta":
        streamText += event.content;
        break;
      case "Done":
        // Flush accumulated stream text as a line before Done
        if (streamText) {
          const flushed = [
            ...lines,
            { kind: "assistant" as const, text: streamText, id: nextId++ },
          ];
          state = { lines: flushed, streamText: "", iteration, agent, result: event.result, running: false };
          notify();
          return;
        }
        result = event.result;
        running = false;
        break;
    }

    state = { lines, streamText, iteration, agent, result, running };
    notify();
  };

  const pushUserMessage = (text: string) => {
    update({ lines: [...state.lines, { kind: "user", text, id: nextId++ }] });
  };

  const pushSystem = (text: string) => {
    update({ lines: [...state.lines, { kind: "system", text, id: nextId++ }] });
  };

  const reset = () => {
    state = initialState;
    notify();
  };

  return {
    getState: () => state,
    subscribe: (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    push,
    pushUserMessage,
    pushSystem,
    reset,
  };
};

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export const useStore = (store: Store): StoreState =>
  useSyncExternalStore(store.subscribe, store.getState, store.getState);
