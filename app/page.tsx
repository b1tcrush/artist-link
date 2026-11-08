'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { TOS_VERSION } from '@/lib/tiers';
import TermsModal from '@/components/TermsModal';

export default function Gate() {
  const [age, setAge] = useState(false);
  const [tos, setTos] = useState(false);
  const [open, setOpen] = useState(false);

  async function signIn() {
    if (!age || !tos) return; // COPPA + ToS gate: auth cannot start without both
    sessionStorage.setItem('al_consent', JSON.stringify({ ageConfirmed: true, tosVersion: TOS_VERSION }));
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: `${location.origin}/onboarding` }, // no extra scopes: data minimisation
    });
  }

  return (
    <main className="gate">
      <h1>Artists Link</h1>
      <p className="lede">Talk shop with rappers at your level. Channels open by listener count.</p>
      <label className="check"><input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} />
        I am 13 years old or older.</label>
      <label className="check"><input type="checkbox" checked={tos} readOnly onClick={(e) => { e.preventDefault(); setOpen(true); }} />
        I have read and accept the Terms of Service.</label>
      <button disabled={!age || !tos} onClick={signIn}>Continue with Spotify</button>
      {open && <TermsModal onClose={() => setOpen(false)} onAccept={() => { setTos(true); setOpen(false); }} />}
    </main>
  );
}
