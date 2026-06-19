import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Multi-Site CMS',
  description: 'Headless, engine-based CMS for managing content across sites.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
