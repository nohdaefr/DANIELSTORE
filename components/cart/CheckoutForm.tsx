"use client";

import { useEffect, useId, useRef } from "react";
import { cartActions } from "@/lib/cart-store";
import type { CustomerField } from "@/lib/checkout";
import { formatAgorot } from "@/lib/format";
import type { CartLine } from "@/types";
import type { CheckoutState } from "./useCheckout";
import styles from "./CheckoutForm.module.css";

interface FieldSpec {
  name: CustomerField;
  label: string;
  required: boolean;
  autoComplete: string;
  type?: "text" | "tel" | "email";
  inputMode?: "text" | "tel" | "email";
  ltr?: boolean;
  multiline?: boolean;
  maxLength: number;
  hint?: string;
}

const FIELDS: FieldSpec[] = [
  { name: "fullName", label: "שם מלא", required: true, autoComplete: "name", maxLength: 80 },
  {
    name: "phone",
    label: "טלפון",
    required: true,
    autoComplete: "tel",
    type: "tel",
    inputMode: "tel",
    ltr: true,
    maxLength: 20,
    hint: "לדוגמה 050-1234567",
  },
  { name: "city", label: "עיר", required: true, autoComplete: "address-level2", maxLength: 60 },
  { name: "address", label: "רחוב, מספר בית ודירה", required: true, autoComplete: "street-address", maxLength: 120 },
  {
    name: "email",
    label: "אימייל",
    required: false,
    autoComplete: "email",
    type: "email",
    inputMode: "email",
    ltr: true,
    maxLength: 254,
  },
  { name: "notes", label: "הערות לשליח", required: false, autoComplete: "off", multiline: true, maxLength: 300 },
];

interface CheckoutFormProps {
  checkout: CheckoutState;
  lines: readonly CartLine[];
  subtotalAgorot: number;
  blockedReason: string | null;
}

export default function CheckoutForm({ checkout, lines, subtotalAgorot, blockedReason }: CheckoutFormProps) {
  const { form, setField, fieldErrors, problem, submitting, submit } = checkout;
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const problemRef = useRef<HTMLDivElement>(null);

  // Move focus into the form when it opens (keyboard / screen-reader users)
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (problem && problem.kind !== "fields") problemRef.current?.focus();
  }, [problem]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blockedReason) return;
    const result = await submit(lines);
    if (result === "invalid") {
      // Focus the first field with an error
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
    }
  }

  return (
    <form
      ref={formRef}
      className={styles.form}
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby={`${id}-title`}
      data-testid="checkout-form"
    >
      <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1} className={styles.title}>
        פרטי משלוח
      </h2>
      <p className={styles.intro}>
        שדות המסומנים ב־<span aria-hidden="true">*</span>
        <span className="visually-hidden">כוכבית</span> הם חובה.
      </p>

      {FIELDS.map((field) => {
        const inputId = `${id}-${field.name}`;
        const error = fieldErrors[field.name];
        const describedBy = [field.hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null]
          .filter(Boolean)
          .join(" ");
        const common = {
          id: inputId,
          name: field.name,
          value: form[field.name],
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setField(field.name, event.target.value),
          autoComplete: field.autoComplete,
          maxLength: field.maxLength,
          required: field.required,
          "aria-required": field.required || undefined,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": describedBy || undefined,
          dir: field.ltr ? "ltr" : undefined,
          className: `${styles.input} ${error ? styles.inputError : ""}`,
          disabled: submitting,
        } as const;

        return (
          <div key={field.name} className={styles.field}>
            <label htmlFor={inputId} className={styles.label}>
              {field.label}
              {field.required ? (
                <span className={styles.required} aria-hidden="true">
                  {" "}
                  *
                </span>
              ) : (
                <span className={styles.optional}> (רשות)</span>
              )}
            </label>
            {field.multiline ? (
              <textarea {...common} rows={2} />
            ) : (
              <input {...common} type={field.type ?? "text"} inputMode={field.inputMode} />
            )}
            {field.hint && (
              <span id={`${inputId}-hint`} className={styles.hint}>
                {field.hint}
              </span>
            )}
            {error && (
              <span id={`${inputId}-error`} className={styles.error} data-testid={`error-${field.name}`}>
                {error}
              </span>
            )}
          </div>
        );
      })}

      {problem && problem.kind !== "fields" && (
        <div ref={problemRef} tabIndex={-1} className={styles.problem} role="alert" data-testid="checkout-problem">
          <p>{problem.message}</p>
          {problem.kind === "stock" && problem.productId !== undefined && problem.available !== undefined && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const productId = problem.productId as number;
                if (problem.available === 0) cartActions.remove(productId);
                else cartActions.setQuantity(productId, problem.available as number);
                checkout.clearProblem();
              }}
            >
              {problem.available === 0 ? "להסיר את המוצר מהעגלה" : `לעדכן לכמות הזמינה (${problem.available})`}
            </button>
          )}
        </div>
      )}
      {problem?.kind === "fields" && (
        <p className={styles.fieldsSummary} role="alert">
          {problem.message}
        </p>
      )}
      {blockedReason && (
        <p className={styles.fieldsSummary} role="status">
          {blockedReason}
        </p>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={submitting || Boolean(blockedReason)}
        aria-busy={submitting || undefined}
        data-testid="place-order"
        style={{ width: "100%" }}
      >
        {submitting ? "שולחים את ההזמנה…" : `שליחת הזמנה · ${formatAgorot(subtotalAgorot)}`}
      </button>
      <p className={styles.fineprint}>
        הסכום הסופי מחושב בשרת לפי המחירים במלאי. האתר לא גובה תשלום ולא שומר פרטי אשראי — התשלום מתבצע בעת המסירה.
      </p>
      <button type="button" className={styles.back} onClick={() => checkout.setOpen(false)} disabled={submitting}>
        חזרה לסיכום
      </button>
    </form>
  );
}
