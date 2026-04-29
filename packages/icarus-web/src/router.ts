/**
 * Router instance — one active workbench root.
 */

import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { RootLayout } from "./routes/__root";
import { MissionListPage } from "./routes/index";
import { PrimitivesPage } from "./routes/primitives";

export const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: MissionListPage,
});

const primitivesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/primitives",
  component: PrimitivesPage,
});

const missionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/missions/$missionId",
  component: MissionListPage,
});

const missionInspectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/missions/$missionId/inspect",
  component: MissionListPage,
});

const workNodeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/missions/$missionId/work/$workNodeId",
  component: MissionListPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  primitivesRoute,
  missionRoute,
  missionInspectRoute,
  workNodeRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
