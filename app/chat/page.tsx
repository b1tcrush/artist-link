'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Channel = { id: string; name: string; tier: string };
type Msg = { id: number; channel_id: string; user_id: string; body: string; created_at: string };

export default function Chat() {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState<Channel | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [text, setText] = useState('');
  const [tier, setTier] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // Load profile + channels. RLS means we only ever get our own tier's rows.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace('/');
      const { data: me } = await supabase.from('profiles').select('tier').eq('id', user.id).maybeSingle();
      if (!me) return router.replace('/onboarding');
      setTier(me.tier);
      const { data: ch } = await supabase.from('channels').select('*').order('name');
      setChannels(ch ?? []); setActive(ch?.[0] ?? null);
      const { data: ps } = await supabase.from('profiles').select('id, artist_name');
      setNames(Object.fromEntries((ps ?? []).map((p) => [p.id, p.artist_name])));
    })();
  }, [router]);

  // History + realtime for the active channel.
  useEffect(() => {
    if (!active) return;
    let live = true;
    supabase.from('messages').select('*').eq('channel_id', active.id)
      .order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => live && setMsgs((data ?? []).reverse()));

    // Events pass through the messages SELECT policy before delivery.
    const sub = supabase.channel(`room:${active.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${active.id}` },
        (p) => setMsgs((m) => (m.some((x) => x.id === (p.new as Msg).id) ? m : [...m, p.new as Msg])))
      .subscribe();
    return () => { live = false; supabase.removeChannel(sub); };
  }, [active]);

  useEffect(() => { endRef.current?.scrollIntoView(); }, [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !active) return;
    setText('');
    await supabase.from('messages').insert({ channel_id: active.id, body }); // user_id defaults to auth.uid()
  }

  return (
    <div className="app">
      <nav className="side" aria-label="Channels">
        <h2>Artists Link</h2>
        <p className="tier">{tier.toUpperCase()} tier</p>
        {channels.map((c) => (
          <button key={c.id} className={c.id === active?.id ? 'ch on' : 'ch'} onClick={() => setActive(c)}># {c.name}</button>
        ))}
        <button className="ghost out" onClick={() => supabase.auth.signOut().then(() => router.replace('/'))}>Sign out</button>
      </nav>
      <section className="room">
        <header># {active?.name}</header>
        <div className="log" aria-live="polite">
          {msgs.length === 0 && <p className="empty">Nothing here yet. Say something first.</p>}
          {msgs.map((m) => (
            <article key={m.id}>
              <b>{names[m.user_id] ?? 'Artist'}</b>
              <time>{new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
              <p>{m.body}</p> {/* React escapes text: no raw HTML, no XSS */}
            </article>
          ))}
          <div ref={endRef} />
        </div>
        <form onSubmit={send} className="type">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder={`Message #${active?.name ?? ''}`} aria-label="Message" />
          <button>Send</button>
        </form>
      </section>
    </div>
  );
}
