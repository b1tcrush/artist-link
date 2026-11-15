'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { tierLabel } from '@/lib/tiers';
import { PLATFORMS, contactUrl, contactText, type PlatformKey } from '@/lib/contacts';
import s from './profile.module.css';

type Prof = { id: string; artist_name: string; sub_genre: string; tier: string };
type Contacts = { bio: string | null } & Record<PlatformKey, string | null>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS: [string, string][] = [
  ['impersonation', 'Pretending to be someone else'],
  ['unsafe_contact_info', 'Unsafe or personal info (phone, address)'],
  ['harassment', 'Harassment or abuse'],
  ['spam', 'Spam or scam'],
  ['other', 'Something else'],
];

// Read the profile id from ?id=… in the browser (keeps this page a plain client page).
export default function ProfileView() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'missing' | 'ready'>('loading');
  const [me, setMe] = useState('');
  const [p, setP] = useState<Prof | null>(null);
  const [c, setC] = useState<Contacts | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState(REASONS[0][0]);
  const [details, setDetails] = useState('');
  const [msg, setMsg] = useState('');
  const [isErr, setIsErr] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/'); return; }
      const id = new URLSearchParams(window.location.search).get('id') ?? '';
      if (!UUID.test(id)) { if (live) setState('missing'); return; }
      // RLS: you only get profiles and contact info from your own tier. Anything else looks like "not found".
      const { data: prof } = await supabase.from('profiles').select('id, artist_name, sub_genre, tier').eq('id', id).maybeSingle();
      if (!live) return;
      if (!prof) { setState('missing'); return; }
      const { data: contacts } = await supabase.from('profile_contacts').select('*').eq('user_id', id).maybeSingle();
      if (!live) return;
      setMe(session.user.id); setP(prof as Prof); setC((contacts as Contacts | null) ?? null); setState('ready');
    })();
    return () => { live = false; };
  }, [router]);

  async function sendReport(e: React.FormEvent) {
    e.preventDefault(); if (!p) return;
    setBusy(true); setMsg(''); setIsErr(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ targetId: p.id, reason, details }),
      });
      const j = await res.json().catch(() => ({ error: 'Something went wrong. Try again.' }));
      if (!res.ok) { setMsg(j.error); setIsErr(true); return; }
      setReporting(false); setDetails(''); setMsg('Thanks. We will review this report.');
    } catch {
      setMsg('Network error. Try again.'); setIsErr(true);
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') {
    return <main className={`gate ${s.card}`}><p className="lede">Loading profile…</p></main>;
  }
  if (state === 'missing' || !p) {
    return (
      <main className={`gate ${s.card}`}>
        <h1 className={s.name}>Profile not found</h1>
        <p className={s.muted}>It may not exist, or it may belong to a different tier.</p>
        <p><Link href="/chat">Back to chat</Link></p>
      </main>
    );
  }

  const rows = PLATFORMS.map((pl) => ({ pl, v: c?.[pl.key] ?? null })).filter((r) => r.v);
  const mine = p.id === me;

  return (
    <main className={`gate ${s.card}`}>
      <h1 className={s.name}>{p.artist_name}</h1>
      <div className={s.meta}>
        <span className={s.pill}>{tierLabel(p.tier)} tier</span>
        <span className={s.muted}>{p.sub_genre}</span>
      </div>

      {c?.bio && <p className={s.bio}>{c.bio}</p>}

      <h2 className={s.h2}>Contact</h2>
      {rows.length > 0 ? (
        <ul className={s.contacts}>
          {rows.map(({ pl, v }) => {
            const href = contactUrl(pl.key, v as string);
            return (
              <li key={pl.key}>
                <span>{pl.label}</span>
                {href
                  ? <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">{contactText(pl.key, v as string)}</a>
                  : <code>{v}</code>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty">{mine ? 'You have not added any contact info yet.' : 'No contact info shared.'}</p>
      )}
      <p className={s.note}>Only signed-in members of this tier can see this.</p>

      <div className={s.actions}>
        {mine ? <Link href="/profile/edit" className={s.btn}>Edit profile</Link>
          : <button type="button" className="ghost" onClick={() => { setReporting((r) => !r); setMsg(''); }}>Report profile</button>}
        <Link href="/chat">Back to chat</Link>
      </div>

      {reporting && (
        <form className={s.report} onSubmit={sendReport}>
          <label>Why are you reporting this profile?
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          <label>Details (optional)
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} rows={3} />
          </label>
          <button disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
        </form>
      )}
      {msg && <p className={isErr ? 'err' : s.ok} role="status">{msg}</p>}
    </main>
  );
}
