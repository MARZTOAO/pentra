import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyTheme, loadStoredTheme } from "./lib/themes";
import { isDesktopApp } from "./lib/platform";

// Before React renders anything, put up the palette this machine used
// last time. Otherwise every start flashes the default colours for a
// moment while the profile loads.
applyTheme(loadStoredTheme());

// Lets the stylesheet tell the installed app from a browser tab.
if (isDesktopApp()) document.documentElement.dataset.desktop = "";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
