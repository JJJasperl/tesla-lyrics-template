import { PAIRING_ID_PATTERN, PAIRING_SECRET_PATTERN, completePairing } from '@/lib/pairing-store';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId?: string; secret?: string };
    const sessionId = body.sessionId || '';
    const secret = body.secret || '';
    if (!PAIRING_ID_PATTERN.test(sessionId) || !PAIRING_SECRET_PATTERN.test(secret)) {
      return Response.json({ error: 'Invalid pairing session.' }, { status: 400 });
    }
    const completed = await completePairing(sessionId, secret);
    return Response.json({ completed });
  } catch {
    return Response.json({ error: 'Could not close pairing session.' }, { status: 503 });
  }
}
