import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AutoWorkshop AI — Towing',
  description: 'Towing operators — requests, dispatch, proof of delivery',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
