# Privacy notice template

> Template for operators of a Tesla Lyrics deployment. Replace every bracketed item and verify the behavior of your hosting provider before publishing. This is not legal advice.

## Operator

This instance of Tesla Lyrics is operated by [OPERATOR NAME OR ORGANIZATION]. Contact: [CONTACT METHOD].

## Data the application accesses

After you authorize Spotify, the application reads the currently playing track, artist, album, artwork, playback position, and play/pause state. It requests the `user-read-currently-playing` scope and does not request permission to control playback.

## Where data is stored

The application stores the Spotify Client ID, OAuth access and refresh tokens, cached lyrics, per-track timing offsets, and optional manual LRC text in the current browser's local storage. OAuth access and refresh tokens are not sent to or stored in the application database.

When phone pairing is used, the application database temporarily stores a pairing-session identifier, a hashed pairing secret, the Spotify Client ID, a PKCE challenge, OAuth state, and the one-time authorization result. The pairing link expires after five minutes. The authorization code is cleared after the Tesla browser successfully exchanges it for tokens.

The hosting provider may process standard request information such as IP address, browser details, timestamps, security events, and operational logs. Describe the actual provider and retention here: [HOSTING AND LOGGING DETAILS].

## Third-party services

- Spotify receives OAuth and Web API requests under Spotify's own terms and privacy policy.
- LRCLIB receives song title, artist, album, and duration when the browser requests lyrics.
- [LIST ANY HOST ANALYTICS, ERROR REPORTING, OR OTHER SERVICES].

## Retention and deletion

Local data remains in the browser until the user disconnects, clears site data, or the browser removes it. Disconnecting removes the stored Spotify token; clearing site data removes the Client ID, lyric cache, timing offsets, and manual lyrics as well. Expired phone-pairing records are removed during subsequent pairing activity; operators should document any additional database-retention or cleanup policy.

Explain any host-side logs or analytics retention and deletion process here: [RETENTION AND DELETION DETAILS].

## Sharing and sale

[STATE WHETHER DATA IS SHARED OR SOLD, CONSISTENT WITH THE ACTUAL DEPLOYMENT.]

## Changes

The operator may update this notice when the application's behavior or providers change. Last updated: [DATE].
