import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cleanLine, cleanText } from '@/lib/apply';

// Server-only: the service role key never reaches the browser.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS: Record<string, string> = {
  impersonation: 'Pretending to be someone else',
  unsafe_contact_info: 'Unsafe or personal info',
  harassment: 'Harassment or abuse',
  spam: 'Spam or scam',
  other: 'Something else',
};
const DAY_MS = 24 * 3600 * 1000;

export async function POST(req: Request) {
  // 1. Authenticate the caller from their Supabase JWT.
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  const { data: { user } } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!user) return fail('Not signed in.', 401);

  // 2. Validate.
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail('Bad request.', 400); }
  const targetId = String(body.targetId ?? '');
  const reason = String(body.reason ?? '');
  const details = cleanText(body.details, 500);
  if (!UUID.test(targetId) || !Object.hasOwn(REASONS, reason)) return fail('Bad request.', 400);
  if (targetId === user.id) return fail('You cannot report yourself.', 400);

  // 3. Only members can report, and the profile must exist.
  const { data: me } = await admin.from('profiles').select('artist_name').eq('id', user.id).maybeSingle();
  if (!me) return fail('Only members can report profiles.', 403);
  const { data: target } = await admin.from('profiles').select('artist_name, tier').eq('id', targetId).maybeSingle();
  if (!target) return fail('Profile not found.', 404);

  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.APPLICATIONS_TO_EMAIL;
  if (!resendKey || !to) return fail('Reporting is not set up yet. Please try again later.', 503);

  // 4. Limits: one report per profile per day, five reports a day in total.
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { count: same } = await admin.from('reports').select('id', { count: 'exact', head: true })
    .eq('reporter_id', user.id).eq('target_id', targetId).gte('created_at', since);
  if ((same ?? 0) > 0) return fail('You already reported this profile. We will look into it.', 409);
  const { count: total } = await admin.from('reports').select('id', { count: 'exact', head: true })
    .eq('reporter_id', user.id).gte('created_at', since);
  if ((total ?? 0) >= 5) return fail('Too many reports today. Please try again tomorrow.', 429);

  // 5. Record it, then email it.
  const { data: row, error: insErr } = await admin.from('reports')
    .insert({ reporter_id: user.id, target_id: targetId, reason }).select('id').single();
  if (insErr || !row) return fail('Could not save your report.', 500);

  const targetName = cleanLine(target.artist_name, 60);
  const text = [
    'New profile report',
    '',
    `Reason:      ${REASONS[reason]}`,
    `Reported:    ${targetName} (${target.tier} tier)`,
    `Reported ID: ${targetId}`,
    `Reporter:    ${cleanLine(me.artist_name, 60)} (${user.id})`,
    '',
    'Details:',
    details || '(none)',
    '',
    '--- To look at it (Supabase SQL editor) ---',
    `select p.artist_name, p.tier, c.* from public.profiles p left join public.profile_contacts c on c.user_id = p.id where p.id = '${targetId}';`,
    '',
    '--- If you decide to act ---',
    'Remove their bio and contact info:',
    `delete from public.profile_contacts where user_id = '${targetId}';`,
    'Remove their access (this also deletes their messages):',
    `delete from public.profiles where id = '${targetId}';`,
  ].join('\n');

  let sent = false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: 'Artists Link <onboarding@resend.dev>',
        to: [to],
        subject: `Artists Link report: ${targetName}`,
        text,
      }),
      signal: AbortSignal.timeout(15000),
    });
    sent = res.ok;
  } catch { sent = false; }

  if (!sent) {
    await admin.from('reports').delete().eq('id', row.id); // a failed send should not count against the reporter
    return fail('Could not send your report. Try again in a minute.', 502);
  }
  return NextResponse.json({ ok: true });
}
