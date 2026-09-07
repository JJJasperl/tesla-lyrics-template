'use client';

import { CircleAlert, LoaderCircle, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function PairPage() {
  const [error, setError] = useState('');

  useEffect(() => {
    const start = async () => {
      try {
        const [sessionId, secret] = window.location.hash.slice(1).split('.');
        if (!sessionId || !secret) throw new Error('This pairing link is invalid.');
        window.history.replaceState({}, '', window.location.pathname);
        const response = await fetch('/api/pairings/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, secret }),
        });
        const data = (await response.json()) as { authorizationUrl?: string; error?: string };
        if (!response.ok || !data.authorizationUrl) {
          throw new Error(data.error || 'Could not open Spotify.');
        }
        window.location.replace(data.authorizationUrl);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not open Spotify.');
      }
    };
    void start();
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-[#07090c] p-6 text-white">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#1ed760]/12 text-[#1ed760]">
          {error ? <CircleAlert className="size-7 text-amber-400" /> : <Smartphone className="size-7" />}
        </span>
        <h1 className="mt-6 text-2xl font-semibold">{error ? 'Pairing link unavailable' : 'Opening Spotify'}</h1>
        <p className="mt-3 text-base leading-6 text-white/55">
          {error || 'Continue in Spotify to authorize Tesla Lyrics.'}
        </p>
        {!error && <LoaderCircle className="mx-auto mt-6 size-5 animate-spin text-white/35" />}
      </div>
    </main>
  );
}
