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

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
