'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PLATFORMS, BIO_MAX, parseHandle, cleanBio, type PlatformKey } from '@/lib/contacts';
import s from '../profile.module.css';

type Vals = Record<PlatformKey, string>;
const emptyVals = (): Vals => Object.fromEntries(PLATFORMS.map((p) => [p.key, ''])) as Vals;

export default function EditProfile() {
  const router = useRouter();
  const [uid, setUid] = useState('');
  const [ready, setReady] = useState(false);
  const [bio, setBio] = useState('');
  const [vals, setVals] = useState<Vals>(emptyVals());
  const [errs, setErrs] = useState<Partial<Record<PlatformKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [isErr, setIsErr] = useState(false);
  const [discordHint, setDiscordHint] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/'); return; }
      const { data: prof } = await supabase.from('profiles').select('id').eq('id', session.user.id).maybeSingle();
      if (!live) return;
      if (!prof) { router.replace('/onboarding'); return; }
      const { data: c } = await supabase.from('profile_contacts').select('*').eq('user_id', session.user.id).maybeSingle();
      if (!live) return;
      setUid(session.user.id);
      if (c) {
        setBio(c.bio ?? '');
        setVals(Object.fromEntries(PLATFORMS.map((p) => [p.key, (c[p.key] as string | null) ?? ''])) as Vals);
      }
      setReady(true);
    })();
    return () => { live = false; };
  }, [router]);

  async function useDiscordName() {
    const { data: { session } } = await supabase.auth.getSession();
    const md = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
    const raw = [md.name, md.preferred_username, md.user_name, md.full_name].find((x) => typeof x === 'string' && x) as string | undefined;
    const r = parseHandle('discord', (raw ?? '').split('#')[0]);
    if (!raw || !r.ok || !r.value) { setDiscordHint("We couldn't read your Discord username. Type it in instead."); return; }
    setVals((v) => ({ ...v, discord: r.value as string }));
    setDiscordHint('Filled in. Check that it is right, then save.');
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(''); setIsErr(false);
    const row: Record<string, string | null> = { user_id: uid, bio: cleanBio(bio) || null, updated_at: new Date().toISOString() };
    const found: Partial<Record<PlatformKey, string>> = {};
    for (const pl of PLATFORMS) {
      const r = parseHandle(pl.key, vals[pl.key]);
      if (r.ok) row[pl.key] = r.value; else found[pl.key] = r.error;
    }
    setErrs(found);
    if (Object.keys(found).length) { setMsg('Fix the highlighted fields and try again.'); setIsErr(true); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('profile_contacts').upsert(row, { onConflict: 'user_id' });
      if (error) { setMsg('Could not save. Try again.'); setIsErr(true); return; }
      // Show what was actually stored (links turned into handles, @ removed, and so on).
      setVals(Object.fromEntries(PLATFORMS.map((p) => [p.key, row[p.key] ?? ''])) as Vals);
      setBio(String(row.bio ?? ''));
      setMsg('Saved.');
    } catch {
      setMsg('Network error. Try again.'); setIsErr(true);
    } finally {
      setBusy(false);
    }
  }

  async function removeAll() {
    if (!window.confirm('Remove your bio and all contact info from your profile?')) return;
    setBusy(true); setMsg(''); setIsErr(false);
    const { error } = await supabase.from('profile_contacts').delete().eq('user_id', uid);
    setBusy(false);
    if (error) { setMsg('Could not remove. Try again.'); setIsErr(true); return; }
    setBio(''); setVals(emptyVals()); setErrs({}); setDiscordHint(''); setMsg('Removed.');
  }

  if (!ready) return <main className={`gate ${s.card}`}><p className="lede">Loading…</p></main>;

  return (
    <main className={`gate ${s.card}`}>
      <h1 className={s.name}>Your profile</h1>
      <p className={s.note}>
        Everything here is optional. Anyone signed in to your tier can see what you add, and you can change or remove it any time.
        Don&apos;t share anything you wouldn&apos;t want strangers to have, like a phone number, home address, or school.
      </p>
      <form onSubmit={save} noValidate>
        <label>Bio
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={BIO_MAX} rows={4} placeholder="A line or two about your music." />
          <span className={s.count}>{bio.length}/{BIO_MAX}</span>
        </label>

        {PLATFORMS.map((pl) => (
          <div key={pl.key}>
            <label>{pl.label}
              <input value={vals[pl.key]} maxLength={120} autoComplete="off" placeholder={pl.placeholder}
                onChange={(e) => setVals((v) => ({ ...v, [pl.key]: e.target.value }))} />
            </label>
            {pl.key === 'discord' && (
              <>
                <button type="button" className="ghost" onClick={useDiscordName}>Use my Discord name</button>
                {discordHint && <p className={s.note}>{discordHint}</p>}
              </>
            )}
            {errs[pl.key] && <span className={s.fieldErr} role="alert">{errs[pl.key]}</span>}
          </div>
        ))}

        <button disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
        {msg && <p className={isErr ? 'err' : s.ok} role="status">{msg}</p>}
      </form>
      <div className={s.actions}>
        <Link href={`/profile?id=${uid}`}>View my profile</Link>
        <Link href="/chat">Back to chat</Link>
        <button type="button" className="ghost" onClick={removeAll} disabled={busy}>Remove everything</button>
      </div>
    </main>
  );
}
