import { redirect } from 'next/navigation';

/**
 * §18: "The Dashboard shall be the default landing page for each workspace."
 * A redirect, so the dashboard keeps exactly ONE canonical URL — two routes
 * rendering the same page is how breadcrumbs and active-nav highlighting start
 * disagreeing.
 */
export default function Index() {
  redirect('/home/dashboard');
}
