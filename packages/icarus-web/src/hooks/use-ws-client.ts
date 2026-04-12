/**
 * useWsClient — creates and manages a shared WebSocket client.
 */

import { useState, useEffect, useRef } from "react";
import { WsClient } from "../lib/ws-client";

export function useWsClient() {
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<WsClient | null>(null);

  useEffect(() => {
    const wsUrl = window.location.protocol === "https:" ? "wss:" : "ws:";
    const client = new WsClient(`${wsUrl}//${window.location.host}/ws`);
    clientRef.current = client;

    const unsub = client.subscribe((msg) => {
      if (msg._tag === "Connected") setConnected(true);
      if (msg._tag === "Disconnected") setConnected(false);
    });

    client.connect();

    return () => {
      unsub();
      client.disconnect();
    };
  }, []);

  return { client: clientRef.current, connected };
}
