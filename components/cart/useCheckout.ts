"use client";

import { useCallback, useRef, useState } from "react";
import {
  buildOrderRequest,
  EMPTY_CUSTOMER_FORM,
  interpretOrderResponse,
  newIdempotencyKey,
  orderFingerprint,
  validateCustomer,
  type CustomerField,
  type CustomerForm,
  type FieldErrors,
  type SubmitOutcome,
} from "@/lib/checkout";
import { cartActions } from "@/lib/cart-store";
import type { CartLine, OrderConfirmation } from "@/types";

export type CheckoutProblem = Exclude<SubmitOutcome, { kind: "success" }> | null;

/**
 * Checkout state lives here (in CartView), not in the form, so typed details
 * survive while the cart reloads prices after a stock error.
 */
export function useCheckout({ onStockChanged }: { onStockChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm>(EMPTY_CUSTOMER_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<CheckoutProblem>(null);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<OrderConfirmation | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const inFlight = useRef(false);

  const setField = useCallback((field: CustomerField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }, []);

  const submit = useCallback(
    async (lines: readonly CartLine[]): Promise<"ok" | "invalid" | "failed"> => {
      if (inFlight.current) return "failed"; // double click
      const validation = validateCustomer(form);
      if (!validation.ok) {
        setFieldErrors(validation.fieldErrors);
        setProblem({ kind: "fields", fieldErrors: validation.fieldErrors, message: "יש לתקן את השדות המסומנים" });
        return "invalid";
      }
      if (lines.length === 0) {
        setProblem({ kind: "error", message: "אין בעגלה מוצרים זמינים להזמנה" });
        return "failed";
      }

      const request = buildOrderRequest(validation.customer, lines);
      const fingerprint = orderFingerprint(request);
      // Same content as the last attempt -> same key (safe retry, no duplicate order)
      if (attempt.current?.fingerprint !== fingerprint) {
        attempt.current = { fingerprint, key: newIdempotencyKey() };
      }

      inFlight.current = true;
      setSubmitting(true);
      setProblem(null);
      setFieldErrors({});
      let outcome: SubmitOutcome;
      try {
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.current.key },
          body: JSON.stringify(request),
          cache: "no-store",
        });
        const body: unknown = await response.json().catch(() => null);
        outcome = interpretOrderResponse(response.status, body);
      } catch {
        outcome = { kind: "error", message: "אין חיבור לשרת. בדקו את החיבור ונסו שוב — ההזמנה לא תוכפל." };
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }

      if (outcome.kind === "success") {
        attempt.current = null;
        setOrder(outcome.order);
        setOpen(false);
        setForm(EMPTY_CUSTOMER_FORM);
        cartActions.clear();
        return "ok";
      }
      if (outcome.kind === "fields") setFieldErrors(outcome.fieldErrors);
      if (outcome.kind === "stock") onStockChanged();
      setProblem(outcome);
      return outcome.kind === "fields" ? "invalid" : "failed";
    },
    [form, onStockChanged],
  );

  return {
    open,
    setOpen,
    form,
    setField,
    fieldErrors,
    problem,
    clearProblem: useCallback(() => setProblem(null), []),
    submitting,
    submit,
    order,
    dismissOrder: useCallback(() => setOrder(null), []),
  };
}

export type CheckoutState = ReturnType<typeof useCheckout>;
