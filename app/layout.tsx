import './globals.css';
import Footer from '@/components/Footer';

export const metadata = { title: 'Artists Link', description: 'Tier-locked messaging for underground rap artists.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
