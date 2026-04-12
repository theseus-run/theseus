/**
 * useDispatches — fetches dispatch history from the daemon.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { WsClient, DispatchSummary } from "../lib/ws-client";

export function useDispatches(client: WsClient | null) {
  const [dispatches, setDispatches] = useState<ReadonlyArray<DispatchSummary>>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!client?.connected) return;
    setLoading(true);
    const result = await client.listDispatches(50);
    setDispatches(result);
    setLoading(false);
  }, [client]);

  // Fetch on connect
  useEffect(() => {
    if (!client) return;
    const unsub = client.subscribe((msg) => {
      if (msg._tag === "Connected" && !fetchedRef.current) {
        fetchedRef.current = true;
        refresh();
      }
      // Refresh when a dispatch completes
      if (msg._tag === "Result") {
        refresh();
      }
    });
    // If already connected
    if (client.connected && !fetchedRef.current) {
      fetchedRef.current = true;
      refresh();
    }
    return unsub;
  }, [client, refresh]);

  return { dispatches, loading, refresh };
}
