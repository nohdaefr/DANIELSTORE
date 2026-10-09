"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Re-runs the server components on this page (re-fetches from the DB). */
export default function RetryButton({ label = "לנסות שוב" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "טוען…" : label}
    </button>
  );
}
