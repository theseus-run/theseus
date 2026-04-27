import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Link as RouterLink,
  RouterProvider,
} from "@tanstack/react-router";
import { StatusMark } from "@/components/ui/status-mark";
import { StatusStrip, StatusStripItem } from "@/components/ui/status-strip";
import { RuntimeTreePocPage } from "@/routes/poc-tree";
import { DashboardPage } from "./routes/dashboard-page";
import { ShowcaseFieldsPage } from "./routes/showcase-fields-page";
import { ShowcaseIndexPage } from "./routes/showcase-index-page";
import { ShowcasePatternsPage } from "./routes/showcase-patterns-page";
import { ShowcaseStatusPage } from "./routes/showcase-status-page";
import { ShowcaseTypographyPage } from "./routes/showcase-typography-page";
import { useRedesignState } from "./state";
import { ToolDetailsSheet } from "./tool-details-sheet";

function Link({ to, children }: { readonly to: string; readonly children: React.ReactNode }) {
  return <RouterLink to={to as never}>{children}</RouterLink>;
}

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
          <StatusStripItem>
            <Link to="/poc-tree">tree poc</Link>
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

const runtimeTreePocRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/poc-tree",
  component: RuntimeTreePocPage,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  showcaseIndexRoute,
  showcaseTypographyRoute,
  showcaseStatusRoute,
  showcaseFieldsRoute,
  showcasePatternsRoute,
  runtimeTreePocRoute,
]);

const redesignRouter = createRouter({ routeTree });

export function RedesignRouterProvider() {
  return <RouterProvider router={redesignRouter} />;
}
