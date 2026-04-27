/**
 * Lightweight reactive client state.
 */

import { client } from "./client";

export const connection = {
  subscribe: client.onStateChange.bind(client),
  getState: () => client.state,
  isConnected: () => client.connected,
};
