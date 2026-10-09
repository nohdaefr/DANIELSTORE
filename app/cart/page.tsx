import type { Metadata } from "next";
import CartView from "@/components/cart/CartView";

export const metadata: Metadata = {
  title: "עגלת קניות | סופר שכונתי",
};

export default function CartPage() {
  return (
    <>
      <h1 className="page-title">עגלת הקניות</h1>
      <CartView />
    </>
  );
}
