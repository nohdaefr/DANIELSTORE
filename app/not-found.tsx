import Link from "next/link";
import StatusMessage from "@/components/StatusMessage";

export default function NotFound() {
  return (
    <StatusMessage
      title="העמוד לא נמצא"
      action={
        <Link href="/" className="btn btn-primary">
          לדף הבית
        </Link>
      }
    >
      <p>ייתכן שהקישור שגוי או שהעמוד הוסר.</p>
    </StatusMessage>
  );
}
