/**
 * Router instance — TanStack Router.
 *
 * Manual route tree — routes reference their parent explicitly.
 */

import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

import { RootLayout } from "./routes/__root";

export const rootRoute = createRootRoute({
  component: RootLayout,
});

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

import { MissionListPage } from "./routes/index";

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: MissionListPage,
});

// ---------------------------------------------------------------------------
// /missions/new
// ---------------------------------------------------------------------------

import { NewMissionPage } from "./routes/missions/new";
import { RuntimeTreePocPage } from "./routes/poc-tree";

const newMissionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/missions/new",
  component: NewMissionPage,
});

// ---------------------------------------------------------------------------
const runtimeTreePocRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/poc-tree",
  component: RuntimeTreePocPage,
});

// ---------------------------------------------------------------------------
// /missions/$missionId
// ---------------------------------------------------------------------------

import { MissionControlPage } from "./routes/missions/$missionId/index";

const missionControlRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/missions/$missionId",
  component: MissionControlPage,
});

// ---------------------------------------------------------------------------
// /missions/$missionId/define
// ---------------------------------------------------------------------------

import { DefinePage } from "./routes/missions/$missionId/define";

const missionDefineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/missions/$missionId/define",
  component: DefinePage,
});

// ---------------------------------------------------------------------------
// Tree + Router
// ---------------------------------------------------------------------------

const routeTree = rootRoute.addChildren([
  indexRoute,
  runtimeTreePocRoute,
  newMissionRoute,
  missionDefineRoute,
  missionControlRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
