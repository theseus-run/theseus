/**
 * Router instance — one active workbench root.
 */

import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { RootLayout } from "./routes/__root";
import { MissionListPage } from "./routes/index";

export const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: MissionListPage,
});

const missionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/missions/$missionId",
  component: MissionListPage,
});

const workNodeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/missions/$missionId/work/$workNodeId",
  component: MissionListPage,
});

const dispatchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/missions/$missionId/dispatches/$dispatchId",
  component: MissionListPage,
});

const eventRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/missions/$missionId/dispatches/$dispatchId/events/$eventIndex",
  component: MissionListPage,
});

const cortexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/missions/$missionId/dispatches/$dispatchId/cortex/$iteration",
  component: MissionListPage,
});

const signalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/missions/$missionId/dispatches/$dispatchId/cortex/$iteration/signals/$signalId",
  component: MissionListPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  missionRoute,
  workNodeRoute,
  dispatchRoute,
  eventRoute,
  cortexRoute,
  signalRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
