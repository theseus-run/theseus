import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../globals.css";
import { RedesignApp } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RedesignApp />
  </StrictMode>,
);
