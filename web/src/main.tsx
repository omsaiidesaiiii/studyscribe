import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import { GoogleConfigProvider } from "./lib/google";
import { ensureNotebookStyles } from "./lib/notebook-styles";
import "./index.css";

// Same stylesheet the server uses to print the PDF, so the browser preview and
// the download match.
ensureNotebookStyles();

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <GoogleConfigProvider>
          <App />
        </GoogleConfigProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
