import { redirect } from 'next/navigation';

/**
 * `/workshop` — the workshop pack's index.
 *
 * 🔴 THIS FILE USED TO BE A SECOND COPY OF THE PUBLIC MARKETPLACE, and running
 * the merged app is what exposed it. `workshop-web` served the apex, so its `/`
 * rendered `MarketplaceLanding` — the parts storefront and VIN search that
 * strangers arrive at. `customer-web`'s `/` rendered the same landing for the
 * same reason. Two applications, two front doors, one product: correct.
 *
 * Under ADR-021 both moved into one artifact, and the result was the SAME
 * STOREFRONT AT TWO URLS — `/` and `/workshop` — differing only in whether
 * their links were relative or absolute. Nothing failed. Both returned 200,
 * both rendered, and the build reported 345 healthy routes. It is a duplicate
 * canonical URL for the product's most public page, which is the kind of defect
 * that costs search ranking quietly and forever rather than breaking anything.
 *
 * The artifact's `/` keeps the storefront, and it is the customer pack's
 * version deliberately: one origin means relative links are now correct, and
 * that copy already used them. This mount becomes what the other five packs'
 * indexes are — a door into the pack.
 *
 * ⚠️ The absolute-URL helpers this file used (`requestServiceHrefFrom`,
 * `supplierRegisterHrefFrom`) exist to point at ANOTHER HOST. With seven packs
 * in one artifact there is no other host, so they are not merely unused here —
 * using them would build cross-origin links to ourselves.
 */
export default function WorkshopIndex() {
  redirect('/workshop/home/dashboard');
}
