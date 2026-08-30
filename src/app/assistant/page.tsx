import { Suspense } from "react";
import { AssistantClient } from "./AssistantClient";

export default function AssistantPage() {
  return (
    <div className="shell">
      <Suspense
        fallback={
          <div className="card p-8 text-[var(--muted)]">Loading assistant...</div>
        }
      >
        <AssistantClient />
      </Suspense>
    </div>
  );
}
