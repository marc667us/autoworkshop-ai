import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AutoWorkshop AI — Fleet',
  description: 'Fleet operators — vehicles, approvals, cost analytics',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
