# Cadence

Cadence is a personal activity dashboard for tracking running and cycling history from a CSV activity archive. It renders a contribution-style activity grid, recent training totals, and historical activity patterns.

The app is built with Next.js and stores its canonical activity CSV in Vercel Blob. During local development it can fall back to the checked-out `activities.csv` file when Blob is unavailable.

## How It Works

Activity data is stored as `activities.csv`. The app reads that file through `src/lib/activity-store.ts`:

- Vercel Blob is used as the canonical storage source.
- The local `activities.csv` file is used as a development fallback.
- The homepage parses the CSV and builds the activity timeline from included activity types.

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Run checks before deploying:

```bash
npm run lint
npm run build
```

## Storage Notes

Create a private Vercel Blob store for the project and connect it through Vercel Project Settings.

If Blob is missing or unreadable in local development, the app falls back to the local `activities.csv` file so the dashboard can still render.
