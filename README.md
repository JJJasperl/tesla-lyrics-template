# Tesla Lyrics

Tesla Lyrics is a personal, read-only companion display for the song currently playing on Spotify. It is designed for a Tesla landscape browser, while remaining usable in any modern browser.

The app does not play or capture audio. It reads the current track and playback position from Spotify, finds synchronized lyrics through LRCLIB, and highlights the matching line locally in the browser.

> This is an independent personal project. It is not affiliated with or endorsed by Spotify, Tesla, or LRCLIB. Review the [Spotify policy notes](docs/SPOTIFY_POLICY_NOTES.md) before operating a public or commercial service.

## Highlights

- Automatic track detection from the active Spotify account
- Synchronized LRCLIB lyrics with exact matching and scored search fallback
- Smooth local playback tracking between Spotify updates
- Immediate manual synchronization and per-track timing adjustment
- Seven-day lyric cache with offline-friendly stale-cache fallback
- A responsive, touch-friendly layout for the Tesla browser
- Spotify Authorization Code with PKCE, with no Client Secret required
- Read-only `user-read-currently-playing` permission
- Browser-only storage for tokens, settings, lyric overrides, and caches

## How it works

1. The browser asks Spotify for the current track, play/pause state, and playback position.
2. Spotify is checked every two seconds while music is playing and every eight seconds while paused or idle. Returning to the page or pressing **Sync** triggers an immediate update.
3. Between Spotify responses, the app advances a local clock every 250 milliseconds and applies a small correction for network latency.
4. When the track changes, the app checks local overrides and its lyric cache before requesting a match from LRCLIB using the title, artist, album, and duration.
5. The latest lyric timestamp at or before the estimated playback position becomes the active line.

## What you need

- A modern browser
- A Spotify account and a Spotify Developer app
- A Spotify Premium account for the owner of a current Development Mode app
- Node.js 22.13 or newer if you want to develop the project locally

Spotify Development Mode currently limits an app to a small allowlist of users. Add every tester in **User Management**. Each deployment should use its own Spotify Client ID; never publish or add a Spotify Client Secret to this project.

## First-time setup

Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), then add the exact homepage address of your local or hosted copy to its **Redirect URIs**. The scheme, host, port, path, and trailing slash must match exactly.

Open Tesla Lyrics, enter the app's Client ID in settings, choose **Connect Spotify**, and approve the read-only permission. Start playback on the same Spotify account from the Tesla or any Spotify device.

## Deployment options

This repository can be deployed through several serverless or edge-hosting platforms:

- **ChatGPT Sites** — Ask Codex to create a private Site from your copy of the project. The included manifest is intentionally not linked to another person's Site.
- **Cloudflare Workers** — The current Vinext build produces a Cloudflare-compatible Worker bundle.
- **Other JavaScript edge platforms** — Adapt the generated server bundle to the platform's Worker or serverless runtime.
- **GitHub Pages** — Pages only serves static files, so the current Worker build needs a static-export adaptation before it can be hosted there.

After any deployment, add the production homepage URL to Spotify's Redirect URIs before connecting. Keep early deployments private while validating login, lyric availability, and Tesla browser behavior.

## Privacy and local data

Tesla Lyrics has no application database. Spotify OAuth tokens, the Client ID, cached lyrics, timing offsets, and manual LRC overrides stay in browser `localStorage`. Track metadata is sent directly from the browser to LRCLIB only when lyrics are requested.

See the [privacy template](docs/PRIVACY_TEMPLATE.md) before sharing a hosted copy with other people.

## Lyrics and availability

LRCLIB is a free, community-maintained service. Coverage, timing quality, uptime, and licensing for redistribution are not guaranteed. Successful automatic lyrics are cached for seven days. **Re-fetch automatic lyrics** bypasses a fresh cache, and local LRC overrides remain available for personal corrections.

No lyric text is bundled with this repository.

## Responsible use

Do not interact with the page while driving. Configure and test it while parked, or use it as a passenger display, subject to local law and Tesla guidance.

## Development

The available development, build, formatting, and linting scripts are documented in `package.json`. Contributions should keep the app read-only, avoid server-side storage of Spotify credentials, and preserve the low-distraction in-car interface.

## License

The source code is available under the [MIT License](LICENSE). Third-party services and lyric content remain subject to their own terms and licenses.
