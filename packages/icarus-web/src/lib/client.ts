/**
 * Client singleton — shared TheseusClient instance.
 *
 * We keep the RPC client as a module-level singleton so it survives
 * React re-renders and route transitions. TanStack Query handles
 * caching/refetching; this is just the transport.
 */

import { TheseusClient } from "./rpc-client";

const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const WS_URL = `${wsProtocol}//${window.location.host}/rpc`;

export const client = new TheseusClient(WS_URL);
client.connect();
