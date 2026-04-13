/**
 * useTheseusClient — creates and manages a shared RPC client connection.
 */

import { useState, useEffect, useRef } from "react";
import { TheseusClient } from "../lib/rpc-client";

export function useTheseusClient() {
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<TheseusClient | null>(null);

  useEffect(() => {
    const wsUrl = window.location.protocol === "https:" ? "wss:" : "ws:";
    const client = new TheseusClient(`${wsUrl}//${window.location.host}/rpc`);
    clientRef.current = client;

    const unsub = client.onStateChange((state) => {
      setConnected(state === "connected");
    });

    client.connect();

    return () => {
      unsub();
      client.disconnect();
    };
  }, []);

  return { client: clientRef.current, connected };
}
