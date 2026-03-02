import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title:       'VoiceIQ — AI Voice SaaS',
  description: 'Multi-tenant AI Voice Agent for Lead Qualification & Customer Support',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
