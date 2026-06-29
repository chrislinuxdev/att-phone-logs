import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { PhoneLogsApp } from "./PhoneLogsApp";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <PhoneLogsApp />
  </StrictMode>,
);
