import { createPairing } from '@/lib/pairing-store';

const CLIENT_ID_PATTERN = /^[A-Za-z0-9]{20,64}$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { clientId?: string; codeChallenge?: string };
    const clientId = body.clientId?.trim() || '';
    const codeChallenge = body.codeChallenge?.trim() || '';
    if (!CLIENT_ID_PATTERN.test(clientId) || !CHALLENGE_PATTERN.test(codeChallenge)) {
      return Response.json({ error: 'Invalid pairing request.' }, { status: 400 });
    }

    const pairing = await createPairing(clientId, codeChallenge);
    const pairUrl = `${new URL(request.url).origin}/pair#${pairing.sessionId}.${pairing.secret}`;
    return Response.json(
      { ...pairing, pairUrl },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: 'Phone pairing is temporarily unavailable.' }, { status: 503 });
  }
}
