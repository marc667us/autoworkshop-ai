import { renderModulePage, viewerGrants } from '@autoworkshop/next-shell';

/**
 * Catch-all for every navigable route in this workspace. The navigation tree is
 * the allow-list: anything not in it 404s, so a typo in a link cannot hide
 * behind a friendly placeholder. A screen that gets genuinely built gets its
 * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
 */
export default async function ModuleRoute({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  // Same grants the navigation is built from, so the nav can never
  // advertise a module whose route then 404s.
  return renderModulePage('supplier', slug, await viewerGrants('supplier'));
}
