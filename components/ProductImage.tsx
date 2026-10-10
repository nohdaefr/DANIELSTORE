import Image from "next/image";
import { artFor } from "@/lib/product-art";
import type { Product } from "@/types";
import ProductArt from "./ProductArt";
import styles from "./ProductImage.module.css";

interface ProductImageProps {
  product: Pick<Product, "name" | "imageUrl" | "category"> & { sku?: string };
  size?: "card" | "thumb" | "mini";
}

/** Product photo, or a drawing of its packaging when there is no photo yet. */
export default function ProductImage({ product, size = "card" }: ProductImageProps) {
  const className = `${styles.frame} ${styles[size]}`;

  if (product.imageUrl) {
    return (
      <div className={className} data-category={product.category.slug}>
        <Image
          src={product.imageUrl}
          alt="" // decorative: the product name is shown as text right next to it
          fill
          sizes={size === "card" ? "(max-width: 600px) 50vw, 240px" : "72px"}
          className={styles.photo}
        />
      </div>
    );
  }

  return (
    <div className={className} data-category={product.category.slug} aria-hidden="true">
      <ProductArt spec={artFor(product)} className={styles.art} />
    </div>
  );
}
