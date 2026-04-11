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
  | { readonly kind: "user"; readonly text: string }
  | { readonly kind: "system"; readonly text: string }
  | { readonly kind: "event"; readonly event: Dispatch.Event };

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
  const listeners = new Set<() => void>();

  const notify = () => { for (const cb of listeners) cb(); };

  const update = (partial: Partial<StoreState>) => {
    state = { ...state, ...partial };
    notify();
  };

  const push = (event: Dispatch.Event) => {
    const lines = [...state.lines, { kind: "event" as const, event }];
    let { streamText, iteration, agent, result, running } = state;

    if (event.agent && !agent) agent = event.agent;

    switch (event._tag) {
      case "Calling":
        iteration = event.iteration;
        streamText = "";
        break;
      case "TextDelta":
        streamText += event.content;
        break;
      case "Done":
        result = event.result;
        running = false;
        break;
    }

    state = { lines, streamText, iteration, agent, result, running };
    notify();
  };

  const pushUserMessage = (text: string) => {
    update({ lines: [...state.lines, { kind: "user", text }] });
  };

  const pushSystem = (text: string) => {
    update({ lines: [...state.lines, { kind: "system", text }] });
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
