import { storeAuthorizationResult } from '@/lib/pairing-store';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { state?: string; code?: string; error?: string };
    const state = body.state || '';
    const validState = /^qr_[A-Za-z0-9_-]{32}$/.test(state);
    const validCode = !body.code || body.code.length <= 2048;
    const validError = !body.error || body.error.length <= 128;
    if (!validState || !validCode || !validError || (!body.code && !body.error)) {
      return Response.json({ error: 'Invalid Spotify callback.' }, { status: 400 });
    }
    const stored = await storeAuthorizationResult(state, body.code || null, body.error || null);
    if (!stored) return Response.json({ error: 'Pairing session expired.' }, { status: 410 });
    return Response.json({ paired: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Could not finish phone pairing.' }, { status: 503 });
  }
}
