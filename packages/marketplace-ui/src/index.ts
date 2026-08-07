/**
 * THE PUBLIC MARKETPLACE, AS A PACKAGE.
 *
 * WHY IT MOVED OUT OF `customer-web`. The landing page — the free parts
 * catalogue, the mechanic directory and the VIN search — is the product's front
 * door, and it must be served by whichever app owns the public domain. It lived
 * inside one app, so it was reachable only where that app was deployed.
 *
 * ⚠️ LEARNED FROM SOLAR, WHICH HAS NEVER NEEDED A DNS CHANGE FOR THIS. Solar
 * runs ONE service: 421 routes in one app, 88 of them public, with `/` serving
 * the landing to everyone — signed in or not, no redirect — and the free tools
 * as ordinary unauthenticated routes beside the private ones. There is no
 * second service, so there is nothing for a CNAME to point at differently and
 * no Namecheap configuration was ever required.
 *
 * AutoWorkshop keeps its seven apps (that decision stands), so the equivalent
 * move here is narrower: make the public surface a PACKAGE, and mount it in the
 * app that already holds the apex. One implementation, several front doors,
 * still no DNS work.
 *
 * §0.3 is the reason this is a package rather than a second copy: a duplicated
 * landing page would drift, and the two would disagree about what the catalogue
 * contains.
 */
/**
 * Solar's landing grammar, exported so a second public surface (customer-web's
 * own landing, a future supplier front page) renders in the SAME language rather
 * than growing its own near-miss copy — §0.3, and the reason the palette drifted
 * once already.
 *
 * ⚠️ Deliberately NOT in `@autoworkshop/design-tokens`: these are fixed-dark
 * MARKETING values, and putting them in the token package would repaint every
 * workshop screen and break light mode across the product.
 */
export { SOLAR, GradientDivider, SectionLabel, SectionHeading, Stat } from './solar-theme';
export { MarketplaceLanding } from './marketplace-landing';
export type { MarketplaceLandingProps } from './marketplace-landing';
export { VinSearch } from './vin-search';
export {
  fetchParts,
  fetchFacets,
  fetchMechanics,
  fetchStats,
  fetchVin,
} from './public-api';
export type {
  PublicPart,
  PublicMechanic,
  PublicVin,
  CatalogueFacets,
  CatalogueStats,
  PublicResult,
} from './public-api';

// The basket. Browser state, shared by both public mounts — see
// `add-to-basket.tsx` for why this is a move and not a copy.
export {
  BASKET_KEY,
  readBasket,
  addToBasket,
  setQuantity,
  removeFromBasket,
  clearBasket,
  basketCount,
} from './basket';
export type { BasketItem } from './basket';
export { AddToBasket } from './add-to-basket';
export { BasketPanel } from './basket-panel';
export type { BasketPanelProps, BasketPart, PlaceResult } from './basket-panel';
export { BasketLink } from './basket-link';
// Where the customer app lives, for the app that owns the apex. The landing's
// primary call to action renders only when this resolves — see the file for
// what it refuses and why each refusal is a real failure.
export { REQUEST_SERVICE_PATH, requestServiceHrefFrom } from './customer-app';
