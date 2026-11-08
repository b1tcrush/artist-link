'use client';
import { useRef, useState } from 'react';

// Must be read to the end, then actively accepted. Have a lawyer review this text.
export default function TermsModal({ onAccept, onClose }: { onAccept: () => void; onClose: () => void }) {
  const [atEnd, setAtEnd] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="tos-h">
      <div className="modal">
        <h2 id="tos-h">Terms of Service</h2>
        <div className="tos" ref={ref} tabIndex={0}
          onScroll={(e) => { const t = e.currentTarget; if (t.scrollTop + t.clientHeight >= t.scrollHeight - 8) setAtEnd(true); }}>
          <p><b>1. Platform role.</b> Artists Link is an interactive computer service under 47 U.S.C. § 230. We are not the publisher or speaker of content users post. Each user is solely responsible for what they send.</p>
          <p><b>2. No liability for collaborations.</b> We disclaim all liability for financial agreements, payments, scams, copyright or ownership disputes, and misconduct that happens in user-to-user dealings. Verify who you work with and put deals in writing.</p>
          <p><b>3. Copyright.</b> Only share music, loops, and lyrics you have the right to share. Send infringement notices through the “Report Copyright / DMCA” link. We remove infringing material and may terminate repeat infringers.</p>
          <p><b>4. Age.</b> You must be at least 13 years old to use Artists Link.</p>
          <p><b>5. Data.</b> We store your sign-in identifier, artist name, sub-genre, tier, and messages. We do not collect phone numbers, addresses, or payment details.</p>
          <p><b>6. Tiers.</b> Access is based on public Last.fm listener counts. We may change your tier or remove access if the data is inaccurate or misused.</p>
        </div>
        <div className="row">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button disabled={!atEnd} onClick={onAccept}>{atEnd ? 'I accept the Terms' : 'Scroll to the end to accept'}</button>
        </div>
      </div>
    </div>
  );
}
