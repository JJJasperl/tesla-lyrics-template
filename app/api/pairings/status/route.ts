import { PAIRING_ID_PATTERN, PAIRING_SECRET_PATTERN, readPairing } from '@/lib/pairing-store';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId?: string; secret?: string };
    const sessionId = body.sessionId || '';
    const secret = body.secret || '';
    if (!PAIRING_ID_PATTERN.test(sessionId) || !PAIRING_SECRET_PATTERN.test(secret)) {
      return Response.json({ error: 'Invalid pairing session.' }, { status: 400 });
    }
    const pairing = await readPairing(sessionId, secret);
    if (!pairing) return Response.json({ status: 'expired' }, { status: 410 });
    if (pairing.consumed_at) return Response.json({ status: 'complete' });
    if (pairing.expires_at < Date.now()) return Response.json({ status: 'expired' }, { status: 410 });
    if (pairing.authorization_error) {
      return Response.json({ status: 'denied', error: pairing.authorization_error });
    }
    if (pairing.authorization_code) {
      return Response.json(
        { status: 'authorized', code: pairing.authorization_code },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return Response.json({ status: 'pending' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Could not check pairing status.' }, { status: 503 });
  }
}
