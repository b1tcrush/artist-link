'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { TOS_VERSION } from '@/lib/tiers';
import TermsModal from '@/components/TermsModal';

export default function Gate() {
  const router = useRouter();
  const [age, setAge] = useState(false);
  const [tos, setTos] = useState(false);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [signedIn, setSignedIn] = useState(false); // signed in with Discord but no profile yet

  // Already signed in? Members go straight to the chat. Signed in without a profile continue to sign-up.
  useEffect(() => {
    let live = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (live) setChecking(false); return; }
      const { data: me } = await supabase.from('profiles').select('id').eq('id', session.user.id).maybeSingle();
      if (!live) return;
      if (me) { router.replace('/chat'); return; }
      setSignedIn(true);
      setChecking(false);
    })();
    return () => { live = false; };
  }, [router]);

  async function continueIn() {
    if (!age || !tos) return; // COPPA + ToS gate: auth cannot start without both
    sessionStorage.setItem('al_consent', JSON.stringify({ ageConfirmed: true, tosVersion: TOS_VERSION }));
    if (signedIn) { router.push('/onboarding'); return; } // already authenticated: no need to bounce through Discord
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: `${location.origin}/onboarding` }, // /onboarding sends existing members on to /chat
    });
  }

  if (checking) {
    return (
      <main className="gate">
        <h1>Artists Link</h1>
        <p className="lede">Checking your session…</p>
      </main>
    );
  }

  return (
    <main className="gate">
      <h1>Artists Link</h1>
      <p className="lede">Talk shop with rappers at your level. Channels open by listener count.</p>
      <label className="check"><input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} />
        I am 13 years old or older.</label>
      <label className="check"><input type="checkbox" checked={tos} readOnly onClick={(e) => { e.preventDefault(); setOpen(true); }} />
        I have read and accept the Terms of Service.</label>
      <button disabled={!age || !tos} onClick={continueIn}>{signedIn ? 'Continue' : 'Continue with Discord'}</button>
      {open && <TermsModal onClose={() => setOpen(false)} onAccept={() => { setTos(true); setOpen(false); }} />}
    </main>
  );
}
