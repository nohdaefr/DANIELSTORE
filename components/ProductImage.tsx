import Image from "next/image";
import type { Product } from "@/types";
import CategoryIcon from "./CategoryIcon";
import styles from "./ProductImage.module.css";

interface ProductImageProps {
  product: Pick<Product, "name" | "imageUrl" | "category">;
  size?: "card" | "thumb";
}

/** Product photo, or a category illustration when there is no photo yet. */
export default function ProductImage({ product, size = "card" }: ProductImageProps) {
  const className = `${styles.frame} ${size === "thumb" ? styles.thumb : styles.card}`;

  if (product.imageUrl) {
    return (
      <div className={className}>
        <Image
          src={product.imageUrl}
          alt="" // decorative: the product name is the card's heading right next to it
          fill
          sizes={size === "thumb" ? "72px" : "(max-width: 600px) 50vw, 240px"}
          className={styles.photo}
        />
      </div>
    );
  }

  return (
    <div className={className} data-category={product.category.slug} aria-hidden="true">
      <CategoryIcon slug={product.category.slug} className={styles.icon} />
    </div>
  );
}
