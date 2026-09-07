import { configuredSpotifyClientId } from '@/lib/pairing-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(
    { spotifyClientId: configuredSpotifyClientId() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
