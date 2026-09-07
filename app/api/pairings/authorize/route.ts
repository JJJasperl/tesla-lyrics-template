import { PAIRING_ID_PATTERN, PAIRING_SECRET_PATTERN, readPairing } from '@/lib/pairing-store';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId?: string; secret?: string };
    const sessionId = body.sessionId || '';
    const secret = body.secret || '';
    if (!PAIRING_ID_PATTERN.test(sessionId) || !PAIRING_SECRET_PATTERN.test(secret)) {
      return Response.json({ error: 'Invalid pairing link.' }, { status: 400 });
    }
    const pairing = await readPairing(sessionId, secret);
    if (!pairing || pairing.expires_at < Date.now() || pairing.consumed_at) {
      return Response.json({ error: 'This pairing link has expired.' }, { status: 410 });
    }

    const origin = new URL(request.url).origin;
    const params = new URLSearchParams({
      client_id: pairing.client_id,
      response_type: 'code',
      redirect_uri: `${origin}/`,
      scope: 'user-read-currently-playing',
      code_challenge_method: 'S256',
      code_challenge: pairing.code_challenge,
      state: pairing.oauth_state,
    });
    return Response.json(
      { authorizationUrl: `https://accounts.spotify.com/authorize?${params}` },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: 'Could not start Spotify authorization.' }, { status: 503 });
  }
}
