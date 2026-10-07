import { createRoot } from "react-dom/client";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import App from "./App.tsx";
import "./index.css";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY || "phc_w3P5BnZop9Bn7XZr4Tjguo2BfK6ut3JgqJKgNztR2XBR";
if (typeof window !== "undefined") {
  posthog.init(posthogKey, {
    api_host: "https://j.bellevillesystems.com",
    ui_host: "https://us.posthog.com",
    defaults: "2025-05-24",
    person_profiles: "identified_only",
  });
}

createRoot(document.getElementById("root")!).render(
  <PostHogProvider client={posthog}>
    <App />
  </PostHogProvider>
);
