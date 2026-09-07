'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  CircleAlert,
  CircleCheck,
  ExternalLink,
  LogOut,
  Minus,
  Pause,
  Play,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Settings,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type LyricLine = { time: number; text: string };

type TrackInfo = {
  id: string;
  name: string;
  artist: string;
  album: string;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
  coverUrl?: string;
  spotifyUrl?: string;
};

type StoredToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type LrcLibTrack = {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  syncedLyrics?: string | null;
};

type SpotifyTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

type PairingSession = {
  sessionId: string;
  secret: string;
  pairUrl: string;
  expiresAt: number;
  qrDataUrl: string;
};

type PairingStatusResponse = {
  status?: 'pending' | 'authorized' | 'denied' | 'expired' | 'complete';
  code?: string;
  error?: string;
};

type SpotifyNowPlayingResponse = {
  progress_ms?: number | null;
  is_playing?: boolean;
  item?: {
    id: string;
    type: string;
    name: string;
    duration_ms: number;
    artists: Array<{ name: string }>;
    album: {
      name: string;
      images?: Array<{ url: string }>;
    };
    external_urls?: { spotify?: string };
  } | null;
};

const TOKEN_KEY = 'tesla-lyrics-token-v1';
const CLIENT_ID_KEY = 'tesla-lyrics-client-id';
const VERIFIER_KEY = 'tesla-lyrics-code-verifier';
const STATE_KEY = 'tesla-lyrics-oauth-state';
const LRC_KEY_PREFIX = 'tesla-lyrics-lrc:';
const LRC_OFFSET_KEY_PREFIX = 'tesla-lyrics-lrc-offset:';
const AUTO_LRC_KEY_PREFIX = 'tesla-lyrics-auto-lrc:';
const AUTO_LRC_CACHED_AT_PREFIX = 'tesla-lyrics-auto-lrc-cached-at:';
const AUTO_LRC_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_POLL_INTERVAL_MS = 2000;
const IDLE_POLL_INTERVAL_MS = 8000;
const MAX_NETWORK_COMPENSATION_MS = 750;

const demoTrack: TrackInfo = {
  id: 'demo-track',
  name: 'Night Drive',
  artist: 'Tesla Lyrics Demo',
  album: 'Browser Compatibility Test',
  durationMs: 42000,
  progressMs: 0,
  isPlaying: true,
};

const demoLyrics: LyricLine[] = [
  { time: 0, text: 'Night settles over the road ahead' },
  { time: 5.5, text: 'City lights slowly fade behind us' },
  { time: 11, text: 'Let the rhythm carry us forward' },
  { time: 17, text: 'This line lights up with the music' },
  { time: 23.5, text: 'If you see it scroll in the car' },
  { time: 30, text: 'The browser compatibility test works' },
  { time: 37, text: 'Ready — back to the first line' },
];

function formatTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function parseSyncedLyrics(raw: string, offsetMs = 0): LyricLine[] {
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
      if (!match) return null;
      return {
        time: Math.max(0, Number(match[1]) * 60 + Number(match[2]) + offsetMs / 1000),
        text: match[3].trim() || '♪',
      };
    })
    .filter((line): line is LyricLine => Boolean(line));
}

function normalizeTrackText(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\([^)]*(?:feat|ft\.)[^)]*\)/gi, '')
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();
}

function artistNames(value: string) {
  return value
    .split(/\s*(?:,|&|;|feat\.?|ft\.?)\s*/i)
    .map(normalizeTrackText)
    .filter(Boolean);
}

function scoreLrcLibTrack(candidate: LrcLibTrack, track: TrackInfo) {
  const wantedTrack = normalizeTrackText(track.name);
  const wantedArtist = normalizeTrackText(track.artist);
  const wantedAlbum = normalizeTrackText(track.album);
  const candidateTrack = normalizeTrackText(candidate.trackName);
  const candidateArtist = normalizeTrackText(candidate.artistName);
  const candidateAlbum = normalizeTrackText(candidate.albumName);
  const wantedArtists = artistNames(track.artist);
  const candidateArtists = artistNames(candidate.artistName);
  const durationDifference = Math.abs(candidate.duration - track.durationMs / 1000);

  let score = 0;
  if (candidateTrack === wantedTrack) score += 8;
  else if (candidateTrack.includes(wantedTrack) || wantedTrack.includes(candidateTrack)) score += 3;
  if (candidateArtist === wantedArtist) score += 6;
  else if (
    wantedArtists.some((wanted) =>
      candidateArtists.some(
        (available) => available === wanted || available.includes(wanted) || wanted.includes(available),
      ),
    )
  ) {
    score += 5;
  } else if (candidateArtist.includes(wantedArtist) || wantedArtist.includes(candidateArtist)) score += 2;
  if (candidateAlbum === wantedAlbum) score += 2;
  if (durationDifference <= 2) score += 6;
  else if (durationDifference <= 5) score += 3;
  else if (durationDifference > 15) score -= 5;
  return score;
}

function randomString(length = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => chars[value % chars.length]).join('');
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [clientId, setClientId] = useState('');
  const [draftClientId, setDraftClientId] = useState('');
  const [managedClientId, setManagedClientId] = useState(false);
  const [token, setToken] = useState<StoredToken | null>(null);
  const [mode, setMode] = useState<'demo' | 'spotify'>('demo');
  const [track, setTrack] = useState<TrackInfo>(demoTrack);
  const [lyrics, setLyrics] = useState<LyricLine[]>(demoLyrics);
  const [displayMs, setDisplayMs] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const [status, setStatus] = useState('Demo mode');
  const [error, setError] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairing, setPairing] = useState<PairingSession | null>(null);
  const [pairingStatus, setPairingStatus] = useState('Preparing phone pairing…');
  const [phoneCallbackStatus, setPhoneCallbackStatus] = useState<'success' | 'error' | null>(null);
  const [manualLrc, setManualLrc] = useState('');
  const [lyricOffsetMs, setLyricOffsetMs] = useState(0);
  const lrcFileInput = useRef<HTMLInputElement | null>(null);
  const lyricsRequestId = useRef(0);
  const spotifyRequestInFlight = useRef(false);
  const spotifyRetryAt = useRef(0);
  const lyricRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const lyricViewport = useRef<HTMLDivElement | null>(null);
  const pairingVerifier = useRef('');
  const pairingExchangeInFlight = useRef(false);

  const saveToken = useCallback((nextToken: StoredToken | null) => {
    setToken(nextToken);
    if (nextToken) localStorage.setItem(TOKEN_KEY, JSON.stringify(nextToken));
    else localStorage.removeItem(TOKEN_KEY);
  }, []);

  const refreshAccessToken = useCallback(
    async (current: StoredToken) => {
      if (!clientId || !current.refreshToken) throw new Error('Spotify login expired. Please reconnect.');
      const body = new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: current.refreshToken,
      });
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!response.ok) throw new Error('Could not refresh the Spotify login.');
      const data = (await response.json()) as SpotifyTokenResponse;
      const next: StoredToken = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || current.refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
      };
      saveToken(next);
      return next.accessToken;
    },
    [clientId, saveToken],
  );

  const getAccessToken = useCallback(async () => {
    const current = readToken();
    if (!current) throw new Error('Connect Spotify first.');
    if (current.expiresAt - Date.now() < 60000) return refreshAccessToken(current);
    return current.accessToken;
  }, [refreshAccessToken]);

  const loadLyrics = useCallback(async (nextTrack: TrackInfo, forceRefresh = false) => {
    const requestId = ++lyricsRequestId.current;
    const saved = localStorage.getItem(`${LRC_KEY_PREFIX}${nextTrack.id}`) || '';
    const savedOffset = Number(localStorage.getItem(`${LRC_OFFSET_KEY_PREFIX}${nextTrack.id}`)) || 0;
    setManualLrc(saved);
    setLyricOffsetMs(savedOffset);
    const parsed = parseSyncedLyrics(saved, savedOffset);
    if (parsed.length) {
      setLyrics(parsed);
      return;
    }

    const cached = localStorage.getItem(`${AUTO_LRC_KEY_PREFIX}${nextTrack.id}`) || '';
    const cachedAt = Number(
      localStorage.getItem(`${AUTO_LRC_CACHED_AT_PREFIX}${nextTrack.id}`),
    );
    const cachedLyrics = parseSyncedLyrics(cached, savedOffset);
    const cacheIsFresh = cachedAt > 0 && Date.now() - cachedAt < AUTO_LRC_CACHE_TTL_MS;
    if (cachedLyrics.length && cacheIsFresh && !forceRefresh) {
      setLyrics(cachedLyrics);
      return;
    }

    setLyrics([{ time: 0, text: 'Matching synchronized lyrics…' }]);

    try {
      const exactParams = new URLSearchParams({
        track_name: nextTrack.name,
        artist_name: nextTrack.artist,
        album_name: nextTrack.album,
        duration: String(Math.round(nextTrack.durationMs / 1000)),
      });
      const exactResponse = await fetch(`https://lrclib.net/api/get?${exactParams}`, {
        headers: { Accept: 'application/json' },
      });

      let match: LrcLibTrack | null = null;
      if (exactResponse.ok) {
        match = (await exactResponse.json()) as LrcLibTrack;
      } else if (exactResponse.status !== 404) {
        throw new Error(`LRCLIB returned ${exactResponse.status}`);
      }

      if (!match?.syncedLyrics && !match?.instrumental) {
        const searchParams = new URLSearchParams({
          track_name: nextTrack.name,
          artist_name: nextTrack.artist.split(',')[0].trim(),
        });
        const searchResponse = await fetch(`https://lrclib.net/api/search?${searchParams}`, {
          headers: { Accept: 'application/json' },
        });
        if (!searchResponse.ok) throw new Error(`LRCLIB returned ${searchResponse.status}`);
        const candidates = ((await searchResponse.json()) as LrcLibTrack[])
          .filter((candidate) => Boolean(candidate.syncedLyrics) || candidate.instrumental)
          .sort((a, b) => scoreLrcLibTrack(b, nextTrack) - scoreLrcLibTrack(a, nextTrack));
        if (candidates[0] && scoreLrcLibTrack(candidates[0], nextTrack) >= 8) {
          match = candidates[0];
        }
      }

      if (requestId !== lyricsRequestId.current) return;
      if (match?.instrumental) {
        setLyrics([{ time: 0, text: 'Instrumental · No lyrics' }]);
        return;
      }

      const synced = match?.syncedLyrics || '';
      const automaticLyrics = parseSyncedLyrics(synced, savedOffset);
      if (automaticLyrics.length) {
        localStorage.setItem(`${AUTO_LRC_KEY_PREFIX}${nextTrack.id}`, synced);
        localStorage.setItem(`${AUTO_LRC_CACHED_AT_PREFIX}${nextTrack.id}`, String(Date.now()));
        setLyrics(automaticLyrics);
        setError('');
        return;
      }

      if (cachedLyrics.length) {
        setLyrics(cachedLyrics);
      } else {
        setLyrics([{ time: 0, text: 'No synchronized lyrics found for this track' }]);
      }
    } catch {
      if (requestId !== lyricsRequestId.current) return;
      if (cachedLyrics.length) {
        setLyrics(cachedLyrics);
      } else {
        setLyrics([{ time: 0, text: 'The automatic lyrics service is temporarily unavailable' }]);
      }
    }
  }, []);

  const pollSpotify = useCallback(async () => {
    if (mode !== 'spotify' || spotifyRequestInFlight.current) return;
    if (Date.now() < spotifyRetryAt.current) return;
    spotifyRequestInFlight.current = true;
    setIsSyncing(true);
    try {
      const accessToken = await getAccessToken();
      const requestStartedAt = Date.now();
      const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const responseReceivedAt = Date.now();
      if (response.status === 204) {
        setTrack((current) => ({ ...current, isPlaying: false }));
        setStatus('Nothing is currently playing on Spotify');
        setError('');
        return;
      }
      if (response.status === 429) {
        const retryAfterSeconds = Number(response.headers.get('Retry-After')) || 5;
        spotifyRetryAt.current = Date.now() + retryAfterSeconds * 1000;
        throw new Error('Spotify is rate-limiting requests. Retrying automatically.');
      }
      if (!response.ok) throw new Error(`Spotify returned ${response.status}`);
      spotifyRetryAt.current = 0;
      const data = (await response.json()) as SpotifyNowPlayingResponse;
      if (!data.item || data.item.type !== 'track') {
        setTrack((current) => ({ ...current, isPlaying: false }));
        setStatus('Waiting for a Spotify track');
        setError('');
        return;
      }
      const networkCompensationMs = data.is_playing
        ? Math.min(
            MAX_NETWORK_COMPENSATION_MS,
            Math.max(0, Math.round((responseReceivedAt - requestStartedAt) / 2)),
          )
        : 0;
      const nextTrack: TrackInfo = {
        id: data.item.id,
        name: data.item.name,
        artist: data.item.artists.map((artist: { name: string }) => artist.name).join(', '),
        album: data.item.album.name,
        durationMs: data.item.duration_ms,
        progressMs: Math.min(
          data.item.duration_ms,
          (data.progress_ms || 0) + networkCompensationMs,
        ),
        isPlaying: Boolean(data.is_playing),
        coverUrl: data.item.album.images?.[0]?.url,
        spotifyUrl: data.item.external_urls?.spotify,
      };
      setTrack((previous) => {
        if (previous.id !== nextTrack.id) void loadLyrics(nextTrack);
        return nextTrack;
      });
      setDisplayMs(nextTrack.progressMs);
      setLastSyncAt(responseReceivedAt);
      setStatus(nextTrack.isPlaying ? 'Synced with Spotify' : 'Spotify is paused');
      setError('');
    } catch (reason) {
      setTrack((current) => ({ ...current, isPlaying: false }));
      setStatus('Connection interrupted');
      setError(reason instanceof Error ? reason.message : 'Could not read Spotify playback.');
    } finally {
      spotifyRequestInFlight.current = false;
      setIsSyncing(false);
    }
  }, [getAccessToken, loadLyrics, mode]);

  useEffect(() => {
    const initialize = async () => {
      const savedClientId = localStorage.getItem(CLIENT_ID_KEY) || '';
      let configuredClientId = '';
      try {
        const configResponse = await fetch('/api/config', { cache: 'no-store' });
        if (configResponse.ok) {
          const config = (await configResponse.json()) as { spotifyClientId?: string | null };
          configuredClientId = config.spotifyClientId?.trim() || '';
        }
      } catch {
        // A public template can run without a managed Client ID.
      }
      const effectiveClientId = configuredClientId || savedClientId;
      setClientId(effectiveClientId);
      setDraftClientId(effectiveClientId);
      setManagedClientId(Boolean(configuredClientId));
      if (configuredClientId) localStorage.setItem(CLIENT_ID_KEY, configuredClientId);
      const restoredToken = readToken();
      setToken(restoredToken);

      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const returnedState = params.get('state');
      const verifier = localStorage.getItem(VERIFIER_KEY);
      const expectedState = localStorage.getItem(STATE_KEY);

      if (returnedState?.startsWith('qr_') && (code || params.get('error'))) {
        window.history.replaceState({}, '', window.location.pathname);
        try {
          const callbackResponse = await fetch('/api/pairings/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              state: returnedState,
              code,
              error: params.get('error'),
            }),
          });
          if (!callbackResponse.ok) throw new Error('The pairing session has expired.');
          setPhoneCallbackStatus('success');
        } catch {
          setPhoneCallbackStatus('error');
        }
        return;
      }

      if (!code) {
        if (restoredToken) {
          setMode('spotify');
          setStatus('Restoring Spotify connection');
        }
        return;
      }
      window.history.replaceState({}, '', window.location.pathname);
      if (!effectiveClientId || !verifier || !returnedState || returnedState !== expectedState) {
        setError('Spotify login validation failed. Please reconnect.');
        return;
      }

      const exchangeCode = async () => {
        try {
          const body = new URLSearchParams({
            client_id: effectiveClientId,
            grant_type: 'authorization_code',
            code,
            redirect_uri: `${window.location.origin}/`,
            code_verifier: verifier,
          });
          const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
          });
          if (!response.ok) throw new Error('Spotify authorization failed.');
          const data = (await response.json()) as SpotifyTokenResponse;
          if (!data.refresh_token) throw new Error('Spotify did not return a refresh token. Please reconnect.');
          saveToken({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + data.expires_in * 1000,
          });
          setMode('spotify');
          setStatus('Spotify connected');
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : 'Spotify authorization failed.');
        } finally {
          localStorage.removeItem(VERIFIER_KEY);
          localStorage.removeItem(STATE_KEY);
        }
      };
      void exchangeCode();
    };
    const initializeTimer = window.setTimeout(() => void initialize(), 0);
    return () => window.clearTimeout(initializeTimer);
  }, [saveToken]);

  useEffect(() => {
    const syncViewportHeight = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
    };
    syncViewportHeight();
    window.addEventListener('resize', syncViewportHeight);
    return () => window.removeEventListener('resize', syncViewportHeight);
  }, []);

  useEffect(() => {
    const clock = window.setInterval(() => {
      if (!track.isPlaying) return;
      setDisplayMs((current) => {
        if (mode === 'demo') return (current + 250) % track.durationMs;
        return Math.min(track.durationMs, track.progressMs + Date.now() - lastSyncAt);
      });
    }, 250);
    return () => window.clearInterval(clock);
  }, [lastSyncAt, mode, track.durationMs, track.isPlaying, track.progressMs]);

  useEffect(() => {
    if (mode !== 'spotify' || !token) return;
    const initialPoller = window.setTimeout(() => void pollSpotify(), 0);
    const poller = window.setInterval(
      () => void pollSpotify(),
      track.isPlaying ? ACTIVE_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS,
    );
    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') void pollSpotify();
    };
    window.addEventListener('focus', syncWhenVisible);
    document.addEventListener('visibilitychange', syncWhenVisible);
    return () => {
      window.clearTimeout(initialPoller);
      window.clearInterval(poller);
      window.removeEventListener('focus', syncWhenVisible);
      document.removeEventListener('visibilitychange', syncWhenVisible);
    };
  }, [mode, pollSpotify, token, track.isPlaying]);

  const activeIndex = useMemo(() => {
    const seconds = displayMs / 1000;
    let index = 0;
    for (let i = 0; i < lyrics.length; i += 1) {
      if (lyrics[i].time <= seconds) index = i;
      else break;
    }
    return index;
  }, [displayMs, lyrics]);

  useEffect(() => {
    const line = lyricRefs.current[activeIndex];
    const viewport = lyricViewport.current;
    if (!line || !viewport) return;
    const top = line.offsetTop - viewport.clientHeight * 0.42 + line.clientHeight / 2;
    viewport.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [activeIndex]);

  const beginSpotifyLogin = async () => {
    const trimmed = (draftClientId || clientId).trim();
    if (!trimmed) {
      setError('Enter your Spotify Client ID first.');
      return;
    }
    localStorage.setItem(CLIENT_ID_KEY, trimmed);
    setClientId(trimmed);
    const verifier = randomString();
    const stateValue = randomString(24);
    localStorage.setItem(VERIFIER_KEY, verifier);
    localStorage.setItem(STATE_KEY, stateValue);
    const challenge = await sha256Base64Url(verifier);
    const params = new URLSearchParams({
      client_id: trimmed,
      response_type: 'code',
      redirect_uri: `${window.location.origin}/`,
      scope: 'user-read-currently-playing',
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state: stateValue,
    });
    window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
  };

  const startPhonePairing = async () => {
    const trimmed = (draftClientId || clientId).trim();
    if (!trimmed) {
      setError('Enter your Spotify Client ID first.');
      setSettingsOpen(true);
      return;
    }

    setPairingOpen(true);
    setPairing(null);
    setPairingStatus('Preparing phone pairing…');
    setError('');
    try {
      localStorage.setItem(CLIENT_ID_KEY, trimmed);
      setClientId(trimmed);
      const verifier = randomString();
      pairingVerifier.current = verifier;
      const codeChallenge = await sha256Base64Url(verifier);
      const response = await fetch('/api/pairings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: trimmed, codeChallenge }),
      });
      const data = (await response.json()) as {
        sessionId?: string;
        secret?: string;
        pairUrl?: string;
        expiresAt?: number;
        error?: string;
      };
      if (!response.ok || !data.sessionId || !data.secret || !data.pairUrl || !data.expiresAt) {
        throw new Error(data.error || 'Could not create a phone pairing session.');
      }
      const qrDataUrl = await QRCode.toDataURL(data.pairUrl, {
        width: 360,
        margin: 2,
        color: { dark: '#061109', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
      setPairing({
        sessionId: data.sessionId,
        secret: data.secret,
        pairUrl: data.pairUrl,
        expiresAt: data.expiresAt,
        qrDataUrl,
      });
      setPairingStatus('Scan with your phone, then approve Spotify access.');
      setSettingsOpen(false);
    } catch (reason) {
      pairingVerifier.current = '';
      const message = reason instanceof Error ? reason.message : 'Phone pairing is unavailable.';
      setPairingStatus(message);
      setError(message);
    }
  };

  const closePhonePairing = () => {
    setPairingOpen(false);
    setPairing(null);
    pairingVerifier.current = '';
    pairingExchangeInFlight.current = false;
  };

  useEffect(() => {
    if (!pairing) return;
    let cancelled = false;
    let closeTimer: number | undefined;

    const checkPairing = async () => {
      if (cancelled || pairingExchangeInFlight.current) return;
      if (Date.now() > pairing.expiresAt) {
        setPairingStatus('This QR code has expired. Close this window and try again.');
        return;
      }
      try {
        const response = await fetch('/api/pairings/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: pairing.sessionId, secret: pairing.secret }),
        });
        const data = (await response.json()) as PairingStatusResponse;
        if (data.status === 'pending') return;
        if (data.status === 'expired' || response.status === 410) {
          setPairingStatus('This QR code has expired. Close this window and try again.');
          return;
        }
        if (data.status === 'denied') {
          setPairingStatus('Spotify access was not approved. Close this window and try again.');
          return;
        }
        if (data.status !== 'authorized' || !data.code) {
          if (!response.ok) throw new Error(data.error || 'Could not check phone pairing.');
          return;
        }

        pairingExchangeInFlight.current = true;
        setPairingStatus('Authorization received. Finishing on this screen…');
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            grant_type: 'authorization_code',
            code: data.code,
            redirect_uri: `${window.location.origin}/`,
            code_verifier: pairingVerifier.current,
          }),
        });
        if (!tokenResponse.ok) throw new Error('Spotify could not complete the paired login.');
        const tokenData = (await tokenResponse.json()) as SpotifyTokenResponse;
        if (!tokenData.refresh_token) throw new Error('Spotify did not return a refresh token.');
        saveToken({
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: Date.now() + tokenData.expires_in * 1000,
        });
        setMode('spotify');
        setStatus('Spotify connected');
        setError('');
        setPairingStatus('Connected. You can close Spotify on your phone.');
        void fetch('/api/pairings/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: pairing.sessionId, secret: pairing.secret }),
        });
        closeTimer = window.setTimeout(() => closePhonePairing(), 1200);
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : 'Could not finish phone pairing.';
        setPairingStatus(message);
        setError(message);
      }
    };

    void checkPairing();
    const poller = window.setInterval(() => void checkPairing(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(poller);
      if (closeTimer) window.clearTimeout(closeTimer);
    };
  }, [clientId, pairing, saveToken]);

  const chooseDemo = useCallback(() => {
    setMode('demo');
    setTrack({ ...demoTrack, isPlaying: true });
    setLyrics(demoLyrics);
    setDisplayMs(0);
    setStatus('Demo mode');
    setError('');
  }, []);

  const toggleDemo = () => {
    if (mode !== 'demo') return;
    setTrack((current) => ({ ...current, isPlaying: !current.isPlaying }));
    setStatus(track.isPlaying ? 'Demo paused' : 'Demo mode');
  };

  const disconnect = () => {
    saveToken(null);
    chooseDemo();
  };

  const syncNow = useCallback(async () => {
    if (!token) {
      setStatus('Connect Spotify first');
      setSettingsOpen(true);
      return;
    }
    setStatus('Syncing with Spotify');
    setError('');
    await pollSpotify();
  }, [pollSpotify, token]);

  const refreshAutomaticLyrics = () => {
    if (mode !== 'spotify') return;
    if (manualLrc) {
      setError('Clear the local lyric override before re-fetching automatic lyrics.');
      return;
    }
    setSettingsOpen(false);
    void loadLyrics(track, true);
  };

  const saveManualLrc = () => {
    if (mode !== 'spotify') return;
    const parsed = parseSyncedLyrics(manualLrc, lyricOffsetMs);
    if (!parsed.length) {
      setError('No [minutes:seconds] LRC timestamps were found.');
      return;
    }
    localStorage.setItem(`${LRC_KEY_PREFIX}${track.id}`, manualLrc);
    localStorage.setItem(`${LRC_OFFSET_KEY_PREFIX}${track.id}`, String(lyricOffsetMs));
    setLyrics(parsed);
    setError('');
    setSettingsOpen(false);
  };

  const importLrcFile = async (file?: File) => {
    if (!file || mode !== 'spotify') return;
    if (file.size > 512 * 1024) {
      setError('The LRC file is too large. Choose a file smaller than 512 KB.');
      return;
    }
    try {
      const content = await file.text();
      const parsed = parseSyncedLyrics(content, lyricOffsetMs);
      if (!parsed.length) throw new Error('No [minutes:seconds] LRC timestamps were found.');
      setManualLrc(content);
      setLyrics(parsed);
      localStorage.setItem(`${LRC_KEY_PREFIX}${track.id}`, content);
      localStorage.setItem(`${LRC_OFFSET_KEY_PREFIX}${track.id}`, String(lyricOffsetMs));
      setError('');
      setSettingsOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not read the LRC file.');
    }
  };

  const adjustLyricOffset = (deltaMs: number) => {
    if (mode !== 'spotify') return;
    const nextOffset = Math.max(-10000, Math.min(10000, lyricOffsetMs + deltaMs));
    setLyricOffsetMs(nextOffset);
    localStorage.setItem(`${LRC_OFFSET_KEY_PREFIX}${track.id}`, String(nextOffset));
    const sourceLyrics =
      manualLrc || localStorage.getItem(`${AUTO_LRC_KEY_PREFIX}${track.id}`) || '';
    const parsed = parseSyncedLyrics(sourceLyrics, nextOffset);
    if (parsed.length) setLyrics(parsed);
  };

  const clearPersonalLrc = () => {
    if (mode !== 'spotify') return;
    localStorage.removeItem(`${LRC_KEY_PREFIX}${track.id}`);
    localStorage.removeItem(`${LRC_OFFSET_KEY_PREFIX}${track.id}`);
    setManualLrc('');
    setLyricOffsetMs(0);
    setError('');
    void loadLyrics(track);
  };

  useEffect(() => {
    type ModelContext = {
      registerTool: (
        tool: {
          name: string;
          title: string;
          description: string;
          inputSchema: object;
          annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
          execute: () =>
            | { mode: string; status: string }
            | Promise<{ mode: string; status: string }>;
        },
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'sync_current_track',
            title: 'Sync current Spotify track',
            description: 'Refresh the current Spotify track and playback position now.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute: async () => {
              await syncNow();
              return { mode: token ? 'spotify' : 'setup', status: token ? 'synced' : 'needs_login' };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => undefined);
    } catch {
      // WebMCP is optional and unsupported in most browsers.
    }
    return () => lifecycle.abort();
  }, [syncNow, token]);

  const progress = Math.min(100, Math.max(0, (displayMs / track.durationMs) * 100));
  const compactStatus = error
    ? 'Connection issue'
    : mode === 'demo'
      ? track.isPlaying
        ? 'Demo playing'
        : 'Demo paused'
      : isSyncing
        ? 'Updating…'
        : status === 'Nothing is currently playing on Spotify'
          ? 'Nothing playing'
          : status === 'Spotify is paused'
            ? 'Paused'
            : token
              ? 'Spotify connected'
              : 'Not connected';

  if (phoneCallbackStatus) {
    const success = phoneCallbackStatus === 'success';
    return (
      <main className="grid min-h-screen place-items-center bg-[#07090c] p-6 text-white">
        <div className="w-full max-w-sm text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#1ed760]/12 text-[#1ed760]">
            {success ? <CircleCheck className="size-8" /> : <CircleAlert className="size-8 text-amber-400" />}
          </span>
          <h1 className="mt-6 text-2xl font-semibold">
            {success ? 'Spotify authorization complete' : 'Pairing could not be completed'}
          </h1>
          <p className="mt-3 text-base leading-6 text-white/55">
            {success
              ? 'Return to the Tesla screen. It will finish connecting automatically.'
              : 'The pairing session may have expired. Return to Tesla and create a new QR code.'}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-[var(--app-height,100dvh)] overflow-hidden bg-[#07090c] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_78%_42%,rgba(30,215,96,0.10),transparent_35%),linear-gradient(135deg,#0b0e12_0%,#050607_72%)]" />

      <div className="tesla-shell relative mx-auto grid h-full min-h-0 w-full max-w-[1920px] grid-cols-[minmax(270px,32vw)_1fr] max-md:grid-cols-1">
        <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-white/10 px-[clamp(24px,3vw,56px)] py-[clamp(20px,3.5vh,46px)] max-md:border-b max-md:border-r-0">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-[#1ed760] text-[#041208]">
                <Radio className="size-5" />
              </span>
              <div>
                <p className="text-[0.72rem] font-semibold tracking-[0.23em] text-white/42 uppercase">
                  Personal display
                </p>
                <h1 className="text-xl font-semibold tracking-tight">Tesla Lyrics</h1>
              </div>
            </div>

            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    aria-label="Spotify settings"
                    className="size-12 rounded-full text-white/65 hover:bg-white/10 hover:text-white"
                  />
                }
              >
                <Settings className="size-5" />
              </DialogTrigger>
              <DialogContent className="max-h-[calc(var(--app-height,100dvh)-32px)] overflow-y-auto border border-white/12 bg-[#12161b] p-6 text-white ring-0 sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-xl">Spotify & lyrics</DialogTitle>
                  <DialogDescription className="text-base leading-6 text-white/55">
                    Connect on your phone with a QR code. The app only reads what is playing and never controls playback.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  {managedClientId ? (
                    <div className="flex items-center gap-3 rounded-xl border border-[#1ed760]/20 bg-[#1ed760]/8 px-4 py-3">
                      <CircleCheck className="size-5 shrink-0 text-[#1ed760]" />
                      <div>
                        <p className="text-sm font-medium text-white/85">Spotify app configured</p>
                        <p className="mt-0.5 text-sm text-white/42">No Client ID entry is needed on this screen.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Label htmlFor="spotify-client-id" className="text-sm text-white/72">
                        Spotify Client ID
                      </Label>
                      <Input
                        id="spotify-client-id"
                        value={draftClientId}
                        onChange={(event) => setDraftClientId(event.target.value)}
                        placeholder="Spotify Client ID"
                        autoComplete="off"
                        className="h-12 border-white/12 bg-white/6 px-4 text-base text-white placeholder:text-white/28"
                      />
                    </>
                  )}
                  <p className="text-sm leading-5 text-white/45">
                    Add this page&apos;s exact homepage URL to Redirect URIs in the Spotify Developer Dashboard.
                  </p>
                </div>
                {mode === 'spotify' && (
                  <div className="space-y-3 border-t border-white/10 pt-4">
                    <div>
                      <Label htmlFor="manual-lrc" className="text-sm text-white/72">
                        Advanced: local lyric override
                      </Label>
                      <p className="mt-1 text-sm leading-5 text-white/42">
                        Lyrics are fetched automatically. Use this only to replace an incorrect match; it stays in this browser.
                      </p>
                    </div>
                    <Textarea
                      id="manual-lrc"
                      value={manualLrc}
                      onChange={(event) => setManualLrc(event.target.value)}
                      placeholder={'[00:12.00] First line\n[00:18.50] Second line'}
                      className="min-h-28 border-white/12 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/25"
                    />
                    <input
                      ref={lrcFileInput}
                      type="file"
                      accept=".lrc,text/plain"
                      className="hidden"
                      onChange={(event) => {
                        void importLrcFile(event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => lrcFileInput.current?.click()}
                        className="h-11 border-white/14 bg-transparent px-4 text-white hover:bg-white/8"
                      >
                        <Upload />Import .lrc file
                      </Button>
                      <Button
                        onClick={saveManualLrc}
                        className="h-11 bg-[#1ed760] px-4 text-[#031007] hover:bg-[#35e475]"
                      >
                        Save pasted lyrics
                      </Button>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-sm text-white/65">Lyric timing offset</span>
                        <span className="text-sm tabular-nums text-[#1ed760]">
                          {lyricOffsetMs >= 0 ? '+' : ''}{(lyricOffsetMs / 1000).toFixed(1)} sec
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => adjustLyricOffset(-250)}
                          className="h-10 bg-white/5 text-white/72 hover:bg-white/10 hover:text-white"
                        >
                          <Minus />0.25 sec earlier
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => adjustLyricOffset(250)}
                          className="h-10 bg-white/5 text-white/72 hover:bg-white/10 hover:text-white"
                        >
                          <Plus />0.25 sec later
                        </Button>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={refreshAutomaticLyrics}
                      disabled={isSyncing}
                      className="h-10 w-full border-white/14 bg-transparent px-3 text-white/65 hover:bg-white/8 hover:text-white"
                    >
                      <RefreshCw className={isSyncing ? 'animate-spin' : ''} />Re-fetch automatic lyrics
                    </Button>
                    {manualLrc && (
                      <Button
                        variant="ghost"
                        onClick={clearPersonalLrc}
                        className="h-10 px-3 text-white/42 hover:bg-white/8 hover:text-white"
                      >
                        <Trash2 />Clear lyrics for this track
                      </Button>
                    )}
                  </div>
                )}
                <DialogFooter className="-mx-6 -mb-6 border-white/10 bg-white/[0.025] p-6">
                  {token && (
                    <Button
                      variant="ghost"
                      onClick={disconnect}
                      className="h-11 px-4 text-white/60 hover:bg-white/8 hover:text-white"
                    >
                      <LogOut />Disconnect
                    </Button>
                  )}
                  {!token && (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() => void beginSpotifyLogin()}
                        className="h-11 px-4 text-white/60 hover:bg-white/8 hover:text-white"
                      >
                        Connect on this screen
                      </Button>
                      <Button
                        onClick={() => void startPhonePairing()}
                        className="h-11 bg-[#1ed760] px-5 text-[#031007] hover:bg-[#35e475]"
                      >
                        <QrCode />Connect with phone
                      </Button>
                    </>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={pairingOpen}
              onOpenChange={(open) => {
                if (!open) closePhonePairing();
              }}
            >
              <DialogContent className="border border-white/12 bg-[#12161b] p-6 text-white ring-0 sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <Smartphone className="size-5 text-[#1ed760]" />Connect with your phone
                  </DialogTitle>
                  <DialogDescription className="text-base leading-6 text-white/55">
                    Scan the QR code and approve access in Spotify. Keep this page open while connecting.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid min-h-72 place-items-center py-2">
                  {pairing ? (
                    <div className="text-center">
                      {/* oxlint-disable-next-line next/no-img-element -- QR code is generated locally as a data URL. */}
                      <img
                        src={pairing.qrDataUrl}
                        alt="QR code for Spotify phone authorization"
                        className="mx-auto size-64 rounded-2xl bg-white p-2"
                      />
                      <p className="mt-4 text-sm leading-5 text-white/48">QR code expires in five minutes.</p>
                    </div>
                  ) : (
                    <RefreshCw className="size-7 animate-spin text-[#1ed760]" />
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-center text-sm text-white/62" aria-live="polite">
                  {pairingStatus}
                </div>
              </DialogContent>
            </Dialog>
          </header>

          <section className="track-panel my-auto py-[clamp(12px,2.5vh,32px)] max-md:my-0 max-md:grid max-md:grid-cols-[112px_1fr] max-md:items-center max-md:gap-5">
            {track.coverUrl ? (
              // oxlint-disable-next-line next/no-img-element -- Spotify artwork comes from a dynamic authenticated response.
              <img
                src={track.coverUrl}
                alt=""
                className="track-art mb-[clamp(12px,2vh,24px)] aspect-square w-full max-w-[min(350px,30vh)] rounded-[26px] object-cover shadow-[0_24px_80px_rgba(0,0,0,0.45)] max-md:mb-0 max-md:rounded-2xl"
              />
            ) : (
              <div
                aria-hidden="true"
                className="track-art mb-[clamp(12px,2vh,24px)] aspect-square w-full max-w-[min(350px,30vh)] rounded-[26px] bg-[linear-gradient(145deg,#24312b_0%,#1ed760_48%,#092f1a_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.45)] max-md:mb-0 max-md:rounded-2xl"
              />
            )}
            <div className="min-w-0">
              <h2 className="truncate text-[clamp(1.75rem,3vw,3.7rem)] leading-[1.05] font-semibold tracking-[-0.04em]">
                {track.name}
              </h2>
              <p className="mt-3 truncate text-[clamp(1rem,1.35vw,1.45rem)] text-white/55">
                {track.artist}
              </p>
              <p className="mt-1 truncate text-sm text-white/30">{track.album}</p>
              {track.spotifyUrl && (
                <a
                  href={track.spotifyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#1ed760]/80 hover:text-[#1ed760]"
                >
                  Open in Spotify <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          </section>

          <footer>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#1ed760] transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm tabular-nums text-white/38">
              <span>{formatTime(displayMs)}</span>
              <span>{formatTime(track.durationMs)}</span>
            </div>

            <div className="player-actions mt-4 flex min-w-0 items-center gap-3">
              {mode === 'demo' ? (
                <Button
                  onClick={toggleDemo}
                  className="size-10 shrink-0 rounded-full bg-white text-black hover:bg-white/85"
                  aria-label={track.isPlaying ? 'Pause demo' : 'Resume demo'}
                >
                  {track.isPlaying ? (
                    <Pause className="size-5 fill-current" />
                  ) : (
                    <Play className="size-5 fill-current" />
                  )}
                </Button>
              ) : (
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1ed760]/10 text-[#1ed760]">
                  <Radio className="size-4" />
                </span>
              )}
              <p
                className={`min-w-0 flex-1 truncate text-sm font-medium ${error ? 'text-amber-300/85' : 'text-white/58'}`}
                aria-live="polite"
                title={error || status}
              >
                {compactStatus}
              </p>
              {!token && (
                <Button
                  variant="ghost"
                  onClick={() => void startPhonePairing()}
                  className="ml-auto h-10 shrink-0 rounded-full px-3 text-white/58 hover:bg-white/8 hover:text-white"
                >
                  <QrCode className="size-4" />Connect
                </Button>
              )}
            </div>
          </footer>
        </aside>

        <section className="lyrics-panel relative h-full min-h-0 overflow-hidden max-md:h-full">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[18vh] bg-gradient-to-b from-[#07090c] to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[22vh] bg-gradient-to-t from-[#050607] to-transparent" />
          <div
            ref={lyricViewport}
            className="lyric-scroll h-full overflow-y-auto px-[clamp(28px,6vw,112px)] py-[36vh] max-md:py-[20vh]"
          >
            <div className="space-y-[clamp(22px,3.2vh,52px)]">
              {lyrics.map((line, index) => (
                <p
                  key={`${line.time}-${index}`}
                  ref={(element) => {
                    lyricRefs.current[index] = element;
                  }}
                  className={`max-w-[1000px] text-[clamp(2rem,4.1vw,5.25rem)] leading-[1.14] font-semibold tracking-[-0.045em] transition-all duration-[250ms] ${
                    index === activeIndex
                      ? 'translate-x-0 text-white opacity-100'
                      : index < activeIndex
                        ? 'text-white/18 opacity-80'
                        : 'translate-x-2 text-white/25 opacity-90'
                  }`}
                >
                  {line.text}
                </p>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
