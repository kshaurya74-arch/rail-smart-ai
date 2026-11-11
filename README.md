# RAILSMART AI — RailRadar-connected backend

## What changed
- Uses the documented RailRadar base URL and `/v1` API prefix.
- Correct trains-between endpoint and nested response normalisation.
- Live running status endpoint.
- PNR enquiry endpoint.
- Seat availability endpoint (new backend route).
- Train timetable endpoint (new backend route).
- Live station autocomplete through RailRadar search.
- API errors and timeouts are returned clearly.
- Demo mode remains available, but demo values are labelled as sample data.

## Requirements
Node.js 18+ and npm.

## Setup
1. Put `.env` in this same folder as `server.js` and `package.json`.
2. Use this configuration (do not commit `.env`):
   ```
   PORT=3000
   RAIL_DATA_MODE=live
   RAIL_API_BASE_URL=https://api.railradar.in
   RAIL_API_KEY=YOUR_NEW_PRIVATE_KEY
   ```
3. Install and run:
   ```
   npm install
   npm start
   ```
4. Open http://localhost:3000

## API routes exposed by this app
- `GET /api/health`
- `GET /api/stations?q=Delhi`
- `GET /api/search?from=RJPB&to=NDLS&date=2026-11-12`
- `GET /api/live/12309`
- `GET /api/pnr/1234567890`
- `GET /api/seats/12952?source=MMCT&destination=NDLS&journeyDate=2026-11-12&classCode=3A&quotaCode=GN`
- `GET /api/schedule/12919?haltsOnly=true`
- `GET /api/recommendations`

## Important frontend note
The current website UI already uses `/api/search`, `/api/live/:trainNo`, `/api/pnr/:pnr` and `/api/stations`. Seat availability and timetable are exposed as backend routes but do not yet have dedicated UI panels. Add UI controls before claiming those features are visible to users.

## Data and trust
RailRadar documents that trains-between, live status and timetable endpoints are provided through its API. Seat availability and PNR status are aggregated from external sources and are not authoritative. Always direct users to official IRCTC channels to confirm booking-critical details. RailRadar is independent and is not affiliated with IRCTC, CRIS or Indian Railways.

## Docs
- https://railradar.in/docs
- https://railradar.in/docs/trains-between-stations
- https://railradar.in/docs/live-train-status
- https://railradar.in/docs/pnr-status
- https://railradar.in/docs/seat-availability
- https://railradar.in/docs/search-stations
- https://railradar.in/docs/get-train-details

## Security
- Never expose the API key in frontend JavaScript, HTML, screenshots, or public repositories.
- Revoke the key that appeared in the earlier screenshot and use a newly generated key.
- Keep `.env` out of Git; add `.env` to `.gitignore`.
- PNRs are sensitive: avoid logging them or retaining their responses unnecessarily.
