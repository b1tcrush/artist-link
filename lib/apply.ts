// Server-only helpers for the manual-review application form.

export const MAX_FILES = 2;
export const MAX_FILE_BYTES = 2_500_000; // keeps the request under Netlify's ~6 MB function limit

/** Single line of printable text: control characters become spaces, trimmed, length-capped. */
export function cleanLine(s: unknown, max: number): string {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim().slice(0, max);
}

/** Multi-line text: control characters other than newline are removed, trimmed, length-capped. */
export function cleanText(s: unknown, max: number): string {
  return String(s ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
}

/** Quote a value as a SQL string literal so it is safe to paste into the SQL editor. */
export function sqlLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export type ImageKind = { ext: 'png' | 'jpg' | 'webp'; mime: string };

/** Identify an image by its first bytes (never trust the filename or declared type). */
export function sniffImage(b: Uint8Array): ImageKind | null {
  const eq = (at: number, bytes: number[]) => bytes.every((v, i) => b[at + i] === v);
  if (b.length >= 8 && eq(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: 'png', mime: 'image/png' };
  if (b.length >= 3 && eq(0, [0xff, 0xd8, 0xff])) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.length >= 12 && eq(0, [0x52, 0x49, 0x46, 0x46]) && eq(8, [0x57, 0x45, 0x42, 0x50])) return { ext: 'webp', mime: 'image/webp' };
  return null;
}

export function applicationEmail(p: {
  applicationId: string; userId: string; email: string; artistName: string; subGenre: string;
  links: string; note: string; tosVersion: string; screenshots: number;
}): string {
  const approve =
    `insert into public.profiles (id, artist_name, sub_genre, tier, listeners, age_attested_at, tos_version, tos_accepted_at, verified_at)\n` +
    `values (${sqlLiteral(p.userId)}, ${sqlLiteral(p.artistName)}, ${sqlLiteral(p.subGenre)}, 'CHANGE_ME', 0, now(), ${sqlLiteral(p.tosVersion)}, now(), now());\n` +
    `update public.applications set status = 'approved' where id = ${sqlLiteral(p.applicationId)};`;
  return [
    `New Artists Link application`,
    ``,
    `Artist name: ${p.artistName}`,
    `Sub-genre:   ${p.subGenre}`,
    `Applicant:   ${p.email} (reply to this email to reach them)`,
    `Screenshots: ${p.screenshots} attached`,
    ``,
    `Links:`,
    p.links || '(none)',
    ``,
    `Note:`,
    p.note || '(none)',
    ``,
    `--- To approve ---`,
    `Run this in the Supabase SQL editor after changing CHANGE_ME to 1k, 10k, 100k or u100.`,
    `Check the screenshots first, and make sure the name is the real artist.`,
    ``,
    approve,
    ``,
    `--- To reject ---`,
    `Do nothing, or run: update public.applications set status = 'rejected' where id = ${sqlLiteral(p.applicationId)};`,
  ].join('\n');
}
