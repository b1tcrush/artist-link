import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GENRES, TOS_VERSION } from '@/lib/tiers';
import { MAX_FILES, MAX_FILE_BYTES, cleanLine, cleanText, sniffImage, applicationEmail } from '@/lib/apply';

// Server-only: the service role key never reaches the browser.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  // 1. Authenticate the caller from their Supabase JWT.
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  const { data: { user } } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!user) return fail('Not signed in.', 401);

  // 2. Parse and validate the form.
  let form: FormData;
  try { form = await req.formData(); } catch { return fail('Bad request.', 400); }
  if (form.get('ageConfirmed') !== 'true') return fail('You must be 13 or older.', 403);
  if (form.get('tosVersion') !== TOS_VERSION) return fail('Accept the current Terms first.', 403);

  const artistName = cleanLine(form.get('artistName'), 60);
  const subGenre = String(form.get('subGenre') ?? '');
  if (!artistName || !GENRES.includes(subGenre)) return fail('Enter a valid artist name and sub-genre.', 400);
  const links = cleanText(form.get('links'), 1000);
  const note = cleanText(form.get('note'), 1000);

  const files = form.getAll('screenshots').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) return fail(`Attach at most ${MAX_FILES} screenshots.`, 400);
  if (!links && files.length === 0) return fail('Add a link or a screenshot so we can check it is you.', 400);

  const attachments: { filename: string; content: string }[] = [];
  for (const [i, f] of files.entries()) {
    if (f.size > MAX_FILE_BYTES) return fail('Each screenshot must be under 2.5 MB.', 413);
    const bytes = new Uint8Array(await f.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) return fail('Screenshots must be PNG, JPG or WebP images.', 400);
    attachments.push({ filename: `screenshot-${i + 1}.${kind.ext}`, content: Buffer.from(bytes).toString('base64') });
  }

  // 3. Server must be configured to send mail.
  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.APPLICATIONS_TO_EMAIL;
  if (!resendKey || !to) return fail('Applications are not set up yet. Please try again later.', 503);

  // 4. Already a member? Too many recent applications?
  const { data: existing } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (existing) return fail('You already have a profile.', 409);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from('applications').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).gte('created_at', since);
  if ((count ?? 0) >= 3) return fail('Too many applications today. Please wait for a reply.', 429);

  // 5. Record it, then email it.
  const { data: row, error: insErr } = await admin.from('applications')
    .insert({ user_id: user.id, artist_name: artistName }).select('id').single();
  if (insErr || !row) return fail('Could not save your application.', 500);

  let sent = false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: 'Artists Link <onboarding@resend.dev>',
        to: [to],
        reply_to: user.email ?? undefined,
        subject: `Artists Link application: ${artistName}`,
        text: applicationEmail({
          applicationId: row.id, userId: user.id, email: user.email ?? '(no email)', artistName, subGenre,
          links, note, tosVersion: TOS_VERSION, screenshots: attachments.length,
        }),
        attachments,
      }),
      signal: AbortSignal.timeout(15000),
    });
    sent = res.ok;
  } catch { sent = false; }

  if (!sent) {
    await admin.from('applications').delete().eq('id', row.id); // don't count a failed send against the user
    return fail('Could not send your application. Try again in a minute.', 502);
  }
  return NextResponse.json({ ok: true });
}
