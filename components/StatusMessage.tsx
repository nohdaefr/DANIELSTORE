import styles from "./StatusMessage.module.css";

interface StatusMessageProps {
  title: string;
  children?: React.ReactNode;
  tone?: "neutral" | "error";
  action?: React.ReactNode;
}

/** Shared layout for empty, error and setup messages. */
export default function StatusMessage({ title, children, tone = "neutral", action }: StatusMessageProps) {
  return (
    <section
      className={`${styles.box} ${tone === "error" ? styles.error : ""}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <h2 className={styles.title}>{title}</h2>
      {children && <div className={styles.text}>{children}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </section>
  );
}
