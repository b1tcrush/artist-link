// Persistent footer on every page: DMCA contact point.
export default function Footer() {
  const mail = process.env.NEXT_PUBLIC_DMCA_EMAIL ?? 'dmca@example.com';
  return (
    <footer className="foot">
      <a href={`mailto:${mail}?subject=DMCA%20Takedown%20Notice`}>Report Copyright / DMCA</a>
    </footer>
  );
}
