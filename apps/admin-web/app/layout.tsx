import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AutoWorkshop AI — Admin',
  description: 'Platform administration, security operations, MCP registry',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
