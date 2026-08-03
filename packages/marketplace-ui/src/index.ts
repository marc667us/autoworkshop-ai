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
