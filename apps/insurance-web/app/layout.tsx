import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AutoWorkshop AI — Insurance',
  description: 'Insurers — claims, assessment, repair authorisation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
