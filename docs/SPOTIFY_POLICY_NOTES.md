# Spotify policy notes

This document is a project-maintainer checklist, not legal advice. Spotify policies can change; review the current [Developer Policy](https://developer.spotify.com/policy), [Design Guidelines](https://developer.spotify.com/documentation/design), and [Web API documentation](https://developer.spotify.com/documentation/web-api) before publishing or monetizing a deployment.

## Current architecture

- The project does not stream, download, capture, or modify Spotify audio.
- It reads the current track and playback position with `user-read-currently-playing`.
- Lyrics come from LRCLIB, not Spotify.
- OAuth uses PKCE in the browser. No Spotify Client Secret is used.
- The project does not control playback or seek when a lyric is selected.

## Issues to review before public deployment

### 1. Timed lyrics may raise synchronization questions

Spotify's Developer Policy prohibits synchronizing sound recordings with visual media. This project does not receive the sound recording from the Spotify Platform, but it deliberately aligns third-party text with the playback position reported by Spotify. The policy does not specifically confirm that this lyric-display pattern is allowed. Treat a public hosted service as requiring clarification from Spotify or qualified counsel.

Publishing source code for a personal experiment is different from operating a broadly available service, but open source does not waive Spotify's platform terms.

### 2. Spotify attribution and links are required

The app displays Spotify-provided track metadata and album art. Spotify's guidelines require Spotify attribution and a link back to the applicable content. The app includes a link to the current track, but a public release should also use an approved Spotify mark and verify artwork sizing, corner radius, cropping, and metadata presentation against the current guidelines.

Do not imply that Spotify endorses this project. Do not alter, animate, blur, cover, or place branding over Spotify artwork.

### 3. A public privacy policy is required

Spotify requires transparency about user data. A public deployment should publish a privacy policy tailored to its actual host, operator, logging, analytics, retention, and contact method. Start from `docs/PRIVACY_TEMPLATE.md`; do not publish the template unchanged.

### 4. Every deployment should use its own Spotify app

Do not ship a maintainer's Client ID as a shared default. Spotify Development Mode is intended for development and single-account use, and currently requires a Premium app owner. It permits up to five allowlisted users. Wider distribution requires Spotify's applicable quota mode and approval process.

The current polling strategy is adaptive and observes `Retry-After` after a `429` response, but deployers remain responsible for their own quotas and usage.

### 5. Lyrics have separate copyright and service terms

LRCLIB's software and API availability do not establish that every lyric may be publicly redistributed in every jurisdiction. This repository bundles no lyric text and fetches lyrics on demand, but operators should review LRCLIB's terms, contributor model, takedown process, and applicable lyric-display licensing before providing a public service.

### 6. Commercial and in-vehicle use need additional review

Do not describe the project as an official Tesla or Spotify product. Review Spotify's restrictions on commercial use, streaming applications, business-targeted products, and replacement of core Spotify experiences before charging money or serving a broad audience. In-vehicle operation also requires an appropriate safety review and clear parked/passenger-use guidance.

## Safer initial release posture

- Public source repository, private personal deployments
- No shared hosted service and no shared Client ID
- Read-only Spotify permission only
- No playback controls or lyric-click seeking
- No bundled lyrics
- Clear Spotify, Tesla, and LRCLIB non-affiliation notice
- No advertising, subscription, or monetization

