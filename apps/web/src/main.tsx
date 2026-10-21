import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ready } from "@securecollab/crypto";
import { App } from "./App";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

ready()
  .then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    console.error(err);
    root.render(<p style={{ padding: 24 }}>This browser can't run SecureCollab's encryption. Please update it and try again.</p>);
  });
