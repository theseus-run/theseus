/**
 * useDispatches — fetches dispatch history from the server.
 */

import type { DispatchSummary } from "@theseus.run/core/Dispatch";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TheseusClient } from "../lib/rpc-client";

export function useDispatches(client: TheseusClient | null) {
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
    const unsub = client.onStateChange((state) => {
      if (state === "connected" && !fetchedRef.current) {
        fetchedRef.current = true;
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
