import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";
import "./styles/theme-enhancements.css";
import { ModuleRegistry, AllCommunityModule, provideGlobalGridOptions } from 'ag-grid-community';

provideGlobalGridOptions({ theme: "legacy" });
ModuleRegistry.registerModules([AllCommunityModule]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
