import Image from 'next/image'
import styles from './VendorMenuItems.module.css'

function formatPriceLabel(priceCents) {
  if (typeof priceCents !== 'number' || Number.isNaN(priceCents)) return null
  const dollars = priceCents / 100
  return `$${dollars.toFixed(2)}`
}

export default function VendorMenuItems({ menuItems }) {
  if (!Array.isArray(menuItems) || menuItems.length === 0) {
    return (
      <section className={styles.menu} aria-labelledby="vendor-menu-heading">
        <h2 id="vendor-menu-heading" className={styles.heading}>Menu</h2>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No menu items yet</p>
          <p className={styles.emptyBody}>
            This vendor has not published menu items yet.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.menu} aria-labelledby="vendor-menu-heading">
      <h2 id="vendor-menu-heading" className={styles.heading}>Menu</h2>
      <ul className={styles.grid}>
        {menuItems.map(menuItem => {
          const priceLabel = formatPriceLabel(menuItem.price_cents)
          return (
            <li key={menuItem.id} className={styles.item}>
              {menuItem.photo_url ? (
                <Image
                  src={menuItem.photo_url}
                  alt={menuItem.name}
                  width={320}
                  height={220}
                  className={styles.photo}
                />
              ) : (
                <div className={styles.photoPlaceholder} aria-hidden="true">🍽</div>
              )}
              <div className={styles.body}>
                <div className={styles.titleRow}>
                  <h3 className={styles.itemName}>{menuItem.name}</h3>
                  {menuItem.is_signature ? (
                    <span className={styles.signatureBadge}>Signature</span>
                  ) : null}
                </div>
                {menuItem.description ? (
                  <p className={styles.description}>{menuItem.description}</p>
                ) : null}
                {priceLabel ? (
                  <span className={styles.price}>{priceLabel}</span>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
