'use client';
import { useEffect, useState } from 'react';
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

  useEffect(() => { if (!sessionStorage.getItem('al_consent')) router.replace('/'); }, [router]);

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
    </main>
  );
}
