import { RedesignRouterProvider } from "./router";
import { RedesignStateProvider } from "./state";

export function RedesignApp() {
  return (
    <RedesignStateProvider>
      <RedesignRouterProvider />
    </RedesignStateProvider>
  );
}
