"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import StatusMessage from "@/components/StatusMessage";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusMessage
      title="לא הצלחנו להציג את העמוד"
      tone="error"
      action={
        <button type="button" className="btn btn-primary" onClick={() => retry()}>
          לנסות שוב
        </button>
      }
    >
      <p>משהו השתבש בטעינת העמוד. נסו שוב בעוד רגע.</p>
      {error.digest && <p>קוד שגיאה לבירור: {error.digest}</p>}
    </StatusMessage>
  );
}
