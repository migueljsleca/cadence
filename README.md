This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Strava Sync

The app reads activity data from Vercel Blob when `BLOB_READ_WRITE_TOKEN` is
available, falling back to the local `activities.csv` file during development. A
protected route handler at `/api/strava/sync` refreshes a Strava access token,
fetches the previous completed Monday-to-Monday week, and prepends any new
activities to `activities.csv` in Blob.

Set these environment variables before running the sync:

```bash
BLOB_READ_WRITE_TOKEN=...
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_REFRESH_TOKEN=...
CRON_SECRET=...
```

Create a private Vercel Blob store in the Vercel project Storage tab. Vercel
will add `BLOB_READ_WRITE_TOKEN` to the selected environments automatically.

Vercel runs the route every Monday at 06:00 UTC via `vercel.json`. To run a custom
range manually, call the route with the same bearer token:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/strava/sync?after=2026-05-25T00:00:00Z&before=2026-06-01T00:00:00Z"
```

If the Blob file does not exist yet, the first sync will seed it from the local
`activities.csv` fallback when available.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
