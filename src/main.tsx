import ReactDOM from "react-dom/client";
import { StrictMode } from "react";
import App from "./App";
import "./style.css";
import "./styles/theme-enhancements.css";
import { ModuleRegistry, AllCommunityModule, provideGlobalGridOptions } from 'ag-grid-community';

provideGlobalGridOptions({ theme: "legacy" });
ModuleRegistry.registerModules([AllCommunityModule]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
