import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AutoWorkshop AI — Supplier',
  description: 'Suppliers — products, verification, orders',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
