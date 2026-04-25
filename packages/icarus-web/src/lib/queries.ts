/**
 * TanStack Query factories — all server data fetching in one place.
 *
 * Convention: queryOptions factories, not raw useQuery calls.
 * Components call useQuery(missions.list()) etc.
 */

import { queryOptions } from "@tanstack/react-query";
import { client } from "./client";

// ---------------------------------------------------------------------------
// Dispatches (existing, will be replaced by missions)
// ---------------------------------------------------------------------------

export const dispatches = {
  list: (limit?: number) =>
    queryOptions({
      queryKey: ["dispatches", { limit }],
      queryFn: () => client.listDispatches(limit),
      staleTime: 10_000,
    }),

  messages: (dispatchId: string) =>
    queryOptions({
      queryKey: ["dispatches", dispatchId, "messages"],
      queryFn: () => client.getMessages(dispatchId),
      enabled: !!dispatchId,
    }),
};

// ---------------------------------------------------------------------------
// Missions (stub — server doesn't have these RPCs yet)
// ---------------------------------------------------------------------------

export interface MissionSummary {
  id: string;
  goal: string;
  status: "defining" | "active" | "closed";
  criteriaTotal: number;
  criteriaMet: number;
  createdAt: string;
  lockedAt?: string;
  closedAt?: string;
}

export interface Mission {
  id: string;
  goal: string;
  status: "defining" | "active" | "closed";
  criteria: Array<{ text: string; status: "pending" | "met" | "failed" }>;
  artifacts: Array<{
    kind: string;
    source: string;
    ref: string;
    title?: string;
    direction: "input" | "output";
  }>;
  dispatches: string[];
  createdAt: string;
  lockedAt?: string;
  closedAt?: string;
  closedReason?: string;
}

// Stub data for UI development — replace with real RPCs
const STUB_MISSIONS: MissionSummary[] = [
  {
    id: "m-1",
    goal: "Migrate auth from session cookies to OAuth2 (Google + GitHub)",
    status: "active",
    criteriaTotal: 5,
    criteriaMet: 2,
    createdAt: "2026-04-13T10:00:00Z",
    lockedAt: "2026-04-13T10:05:00Z",
  },
  {
    id: "m-2",
    goal: "Fix flaky test suite in CI",
    status: "defining",
    criteriaTotal: 0,
    criteriaMet: 0,
    createdAt: "2026-04-13T11:00:00Z",
  },
  {
    id: "m-3",
    goal: "Add CSV export to dashboard",
    status: "closed",
    criteriaTotal: 4,
    criteriaMet: 4,
    createdAt: "2026-04-12T09:00:00Z",
    lockedAt: "2026-04-12T09:03:00Z",
    closedAt: "2026-04-12T09:45:00Z",
  },
];

const STUB_MISSION_DETAIL: Mission = {
  id: "m-1",
  goal: "Migrate auth from session cookies to OAuth2 (Google + GitHub)",
  status: "active",
  criteria: [
    { text: "OAuth2 login flow works for Google", status: "met" },
    { text: "OAuth2 login flow works for GitHub", status: "met" },
    { text: "Session cookie code removed", status: "pending" },
    { text: "All existing auth tests pass (adapted)", status: "pending" },
    { text: "New OAuth integration tests added", status: "pending" },
  ],
  artifacts: [
    {
      kind: "issue",
      source: "linear",
      ref: "PROJ-456",
      title: "Migrate to OAuth2",
      direction: "input",
    },
    { kind: "branch", source: "github", ref: "org/repo:feat/oauth", direction: "output" },
  ],
  dispatches: ["d-1", "d-2", "d-3"],
  createdAt: "2026-04-13T10:00:00Z",
  lockedAt: "2026-04-13T10:05:00Z",
};

export const missions = {
  list: () =>
    queryOptions({
      queryKey: ["missions"],
      queryFn: (): MissionSummary[] => {
        // TODO: replace with client.listMissions() when RPC exists
        return STUB_MISSIONS;
      },
      staleTime: 5_000,
    }),

  detail: (missionId: string) =>
    queryOptions({
      queryKey: ["missions", missionId],
      queryFn: (): Mission => {
        // TODO: replace with client.getMission(missionId) when RPC exists
        return { ...STUB_MISSION_DETAIL, id: missionId };
      },
      enabled: !!missionId,
    }),
};

// ---------------------------------------------------------------------------
// Connection state — not a query, just reactive state
// ---------------------------------------------------------------------------

export const connection = {
  /** Subscribe to connection state changes. Returns unsubscribe fn. */
  subscribe: client.onStateChange.bind(client),
  getState: () => client.state,
  isConnected: () => client.connected,
};
