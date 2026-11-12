'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { GENRES } from '@/lib/tiers';

const MAX_BYTES = 2_500_000;

export default function Apply() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [genre, setGenre] = useState(GENRES[0]);
  const [links, setLinks] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { if (!sessionStorage.getItem('al_consent')) router.replace('/'); }, [router]);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    if (list.length > 2) { setErr('Attach at most 2 screenshots.'); e.target.value = ''; setFiles([]); return; }
    if (list.some((f) => f.size > MAX_BYTES)) { setErr('Each screenshot must be under 2.5 MB.'); e.target.value = ''; setFiles([]); return; }
    setErr(''); setFiles(list);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const consent = JSON.parse(sessionStorage.getItem('al_consent') ?? '{}');
      const fd = new FormData();
      fd.set('artistName', name);
      fd.set('subGenre', genre);
      fd.set('links', links);
      fd.set('note', note);
      fd.set('ageConfirmed', String(consent.ageConfirmed === true));
      fd.set('tosVersion', String(consent.tosVersion ?? ''));
      files.forEach((f) => fd.append('screenshots', f));
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { authorization: `Bearer ${session?.access_token}` }, // browser sets the multipart boundary
        body: fd,
      });
      const j = await res.json().catch(() => ({ error: 'Something went wrong. Try again.' }));
      if (!res.ok) { setErr(j.error); return; }
      setDone(true);
    } catch {
      setErr('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="gate">
        <h1>Application sent</h1>
        <p>Thanks. We&apos;ll review it and reply by email. Once you&apos;re approved, sign in again and you&apos;ll land in your tier.</p>
        <p><Link href="/">Back to start</Link></p>
      </main>
    );
  }

  return (
    <main className="gate">
      <h1>Apply for review</h1>
      <p>Use this if the automatic check didn&apos;t work for you, or you ended up in the wrong tier. We&apos;ll check your details by hand.</p>
      <form onSubmit={submit}>
        <label>Artist name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
        <label>Sub-genre<select value={genre} onChange={(e) => setGenre(e.target.value)}>{GENRES.map((g) => <option key={g}>{g}</option>)}</select></label>
        <label>Links to your music (one per line)<textarea value={links} onChange={(e) => setLinks(e.target.value)} maxLength={1000} rows={3} placeholder="https://open.spotify.com/artist/..." /></label>
        <label>Screenshots of your artist profile (up to 2, PNG/JPG/WebP, under 2.5 MB each)<input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={pick} /></label>
        <label>Anything else we should know (optional)<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} /></label>
        <button disabled={busy}>{busy ? 'Sending…' : 'Send application'}</button>
        {err && <p className="err" role="alert">{err}</p>}
      </form>
      <p><Link href="/onboarding">Back to automatic check</Link></p>
    </main>
  );
}
