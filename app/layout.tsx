import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tesla Lyrics',
  description: 'A browser-based synchronized lyrics display for Tesla.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
