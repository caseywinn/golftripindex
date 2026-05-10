"use client";

import Link from "next/link";
import { useUserItems } from "@/lib/userItems";
import SaveButton from "@/components/SaveButton";
import styles from "@/styles/bag.module.css";

export type BagItem = {
  itemType: "trip" | "journey";
  itemId: string;
  initialStatus: "wishlist" | "played";
  name: string;
  href: string;
  imageUrl: string;
  ranking?: number;
};

function Carousel({ title, items, emptyText }: {
  title: string;
  items: BagItem[];
  emptyText: string;
}) {
  return (
    <section className={styles.carouselSection}>
      <h2 className={styles.carouselTitle}>
        {title}
        <span className={styles.carouselCount}>{items.length}</span>
      </h2>

      {items.length === 0 ? (
        <p className={styles.carouselEmpty}>{emptyText}</p>
      ) : (
        <div className={styles.carouselScroll}>
          {items.map((item) => (
            <div key={`${item.itemType}:${item.itemId}`} className={styles.bagCard}>
              <Link href={item.href} className={styles.bagCardImageLink}>
                <div
                  className={styles.bagCardImage}
                  style={{ backgroundImage: `url("${item.imageUrl}")` }}
                  aria-hidden="true"
                >
                  {item.ranking && (
                    <span className={styles.bagCardRank}>#{item.ranking}</span>
                  )}
                  <span className={styles.bagCardTypeBadge}>
                    {item.itemType === "trip" ? "Trip" : "Journey"}
                  </span>
                </div>
              </Link>
              <div className={styles.bagCardBody}>
                <Link href={item.href} className={styles.bagCardName}>
                  {item.name}
                </Link>
                <div className={styles.bagCardActions}>
                  <SaveButton itemType={item.itemType} itemId={item.itemId} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function BagCarousels({ items }: { items: BagItem[] }) {
  const { getStatus, loading } = useUserItems();

  function currentStatus(item: BagItem): "wishlist" | "played" | null {
    if (loading) return item.initialStatus;
    return getStatus(item.itemType, item.itemId);
  }

  const wishlist = items.filter((i) => currentStatus(i) === "wishlist");
  const played = items.filter((i) => currentStatus(i) === "played");

  return (
    <div className={styles.carousels}>
      <Carousel title="Wishlist" items={wishlist} emptyText="Nothing wishlisted yet." />
      <Carousel title="Played" items={played} emptyText="Nothing marked as played yet." />
    </div>
  );
}
