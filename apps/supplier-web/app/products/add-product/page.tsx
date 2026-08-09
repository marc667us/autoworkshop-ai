import { redirect } from 'next/navigation';

/**
 * `/products/add-product` — sends you where products are actually added.
 *
 * 🔴 THE OWNER'S REPORT: "got 404 of the supplier web when add product". Two
 * separate faults met on this one menu entry, and only the first was a 404:
 *
 * 1. THE 404. This route had no page, so it fell through to the catch-all,
 *    which called a guard asking "is this role foreign to the WORKSHOP" while
 *    rendering the SUPPLIER app. `supplier_owner` is in that set, so the
 *    catch-all refused a supplier on their own product menu. Fixed in
 *    `isForeignToWorkspace` — it now asks about the workspace being rendered.
 *
 * 2. THE DEAD END UNDERNEATH IT. With the guard fixed this route renders the
 *    honest "Add Product has not been built yet" placeholder — no longer an
 *    error, still not a way to add a product. Meanwhile adding one HAS been
 *    built: `SupplierCatalogueScreen` carries `createPartAction`, and it is
 *    mounted on `/products/product-catalogue`. The capability existed and the
 *    menu entry named for it led nowhere.
 *
 * ⚠️ A REDIRECT, NOT A SECOND MOUNT OF THE SAME SCREEN. Rendering the catalogue
 * at two URLs is what this repository's §18 note warns about: breadcrumbs and
 * active-nav highlighting start disagreeing the moment one screen has two
 * canonical addresses. One URL owns the catalogue; this one points at it.
 *
 * ⚠️ AND IT IS DELIBERATELY NOT A DELETION OF THE MENU ENTRY. `02.txt` lists Add
 * Product, Bulk Upload and Draft Products as distinct screens, so the entry is
 * part of the approved navigation and removing it would be changing approved
 * navigation without review — forbidden by CLAUDE.md. When the dedicated screen
 * is built it replaces this file; until then the entry reaches the thing that
 * works rather than an apology.
 */
export default function AddProduct() {
  redirect('/products/product-catalogue');
}
