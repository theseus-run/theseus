import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { StatusMark } from "@/components/ui/status-mark";
import { StatusStrip, StatusStripItem } from "@/components/ui/status-strip";
import { DashboardPage } from "./routes/dashboard-page";
import { ShowcaseFieldsPage } from "./routes/showcase-fields-page";
import { ShowcaseIndexPage } from "./routes/showcase-index-page";
import { ShowcasePatternsPage } from "./routes/showcase-patterns-page";
import { ShowcaseStatusPage } from "./routes/showcase-status-page";
import { ShowcaseTypographyPage } from "./routes/showcase-typography-page";
import { useRedesignState } from "./state";
import { ToolDetailsSheet } from "./tool-details-sheet";

function RedesignLayout() {
  const { selectedTool, closeTool, liveFrame } = useRedesignState();

  return (
    <main className="page-shell dashboard-shell">
      <div className="dashboard-frame rhythm">
        <ToolDetailsSheet tool={selectedTool} onClose={closeTool} />
        <StatusStrip>
          <StatusStripItem>icarus</StatusStripItem>
          <StatusStripItem>
            <StatusMark symbol="◆" tone="good">
              connected
            </StatusMark>
          </StatusStripItem>
          <StatusStripItem>
            <StatusMark symbol={liveFrame} tone="process">
              redesign
            </StatusMark>
          </StatusStripItem>
          <StatusStripItem>
            <Link to="/">dashboard</Link>
          </StatusStripItem>
          <StatusStripItem>
            <Link to="/showcase">showcase</Link>
          </StatusStripItem>
        </StatusStrip>
        <Outlet />
      </div>
    </main>
  );
}

const rootRoute = createRootRoute({ component: RedesignLayout });

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const showcaseIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/showcase",
  component: ShowcaseIndexPage,
});

const showcaseTypographyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/showcase/typography",
  component: ShowcaseTypographyPage,
});

const showcaseStatusRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/showcase/status",
  component: ShowcaseStatusPage,
});

const showcaseFieldsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/showcase/fields",
  component: ShowcaseFieldsPage,
});

const showcasePatternsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/showcase/patterns",
  component: ShowcasePatternsPage,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  showcaseIndexRoute,
  showcaseTypographyRoute,
  showcaseStatusRoute,
  showcaseFieldsRoute,
  showcasePatternsRoute,
]);

const redesignRouter = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    redesignRouter: typeof redesignRouter;
  }
}

export function RedesignRouterProvider() {
  return <RouterProvider router={redesignRouter} />;
}
