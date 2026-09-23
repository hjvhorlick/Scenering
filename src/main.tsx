import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./themes.generated.css";
import "./themes.css";
import { initTheme } from "./lib/themes";

// Apply the persisted theme before first paint (index.html also applies it
// with an inline bootstrap, so this is just a safety net for HMR).
initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
