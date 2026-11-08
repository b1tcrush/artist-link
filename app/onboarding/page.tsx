'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { GENRES } from '@/lib/tiers';

export default function Onboarding() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [genre, setGenre] = useState(GENRES[0]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!sessionStorage.getItem('al_consent')) router.replace('/'); }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const { data: { session } } = await supabase.auth.getSession();
    const consent = JSON.parse(sessionStorage.getItem('al_consent') ?? '{}');
    const res = await fetch('/api/onboard', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ artistName: name, subGenre: genre, ...consent }),
    });
    const j = await res.json();
    if (!res.ok) { setErr(j.error); setBusy(false); return; }
    router.replace('/chat');
  }

  return (
    <main className="gate">
      <h1>Find your tier</h1>
      <form onSubmit={submit}>
        <label>Artist name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
        <label>Sub-genre<select value={genre} onChange={(e) => setGenre(e.target.value)}>{GENRES.map((g) => <option key={g}>{g}</option>)}</select></label>
        <button disabled={busy}>{busy ? 'Checking Last.fm…' : 'Check my listeners'}</button>
        {err && <p className="err" role="alert">{err}</p>}
      </form>
    </main>
  );
}
