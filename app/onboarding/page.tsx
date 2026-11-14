'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { GENRES } from '@/lib/tiers';

type Verify = { code: string; artistName: string };

export default function Onboarding() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [genre, setGenre] = useState(GENRES[0]);
  const [verify, setVerify] = useState<Verify | null>(null);
  const [proofUrl, setProofUrl] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  // Existing members go straight to the chat. No session goes back to the start.
  // New members need the consent they gave on the first page.
  useEffect(() => {
    let live = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/'); return; }
      const { data: me } = await supabase.from('profiles').select('id').eq('id', session.user.id).maybeSingle();
      if (!live) return;
      if (me) { router.replace('/chat'); return; }
      if (!sessionStorage.getItem('al_consent')) { router.replace('/'); return; }
      setReady(true);
    })();
    return () => { live = false; };
  }, [router]);

  async function send(extra: Record<string, string>) {
    const { data: { session } } = await supabase.auth.getSession();
    const consent = JSON.parse(sessionStorage.getItem('al_consent') ?? '{}');
    const res = await fetch('/api/onboard', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ artistName: name, subGenre: genre, ...consent, ...extra }),
    });
    const j = await res.json().catch(() => ({ error: 'Something went wrong. Try again.' }));
    return { ok: res.ok, j };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const { ok, j } = await send(verify ? { proofUrl } : {});
      if (!ok) { setErr(j.error); return; }
      if (j.step === 'verify') { setVerify({ code: j.code, artistName: j.artistName }); return; }
      router.replace('/chat');
    } catch {
      setErr('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <main className="gate">
        <h1>Find your tier</h1>
        <p className="lede">Checking your account…</p>
      </main>
    );
  }

  return (
    <main className="gate">
      <h1>Find your tier</h1>
      <form onSubmit={submit}>
        {!verify ? (
          <>
            <label>Artist name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
            <label>Sub-genre<select value={genre} onChange={(e) => setGenre(e.target.value)}>{GENRES.map((g) => <option key={g}>{g}</option>)}</select></label>
            <button disabled={busy}>{busy ? 'Checking Last.fm…' : 'Check my listeners'}</button>
          </>
        ) : (
          <>
            <p>Found <b>{verify.artistName}</b>. To prove it&apos;s you, add this code anywhere in the bio of your SoundCloud, Bandcamp or Linktree page, save it, then paste the link to that page below.</p>
            <p><code>{verify.code}</code></p>
            <label>Link to your page<input type="url" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="https://soundcloud.com/your-name" required /></label>
            <button disabled={busy}>{busy ? 'Checking your page…' : 'Verify and join'}</button>
          </>
        )}
        {err && <p className="err" role="alert">{err}</p>}
      </form>
      <p>Can&apos;t verify, or ended up in the wrong tier? <Link href="/apply">Apply for manual review</Link></p>
    </main>
  );
}
