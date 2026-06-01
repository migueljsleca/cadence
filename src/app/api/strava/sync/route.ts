import { syncStravaActivities } from "@/lib/strava-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const after = parseDateParam(url.searchParams.get("after"));
    const before = parseDateParam(url.searchParams.get("before"));
    const result = await syncStravaActivities({ after, before });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Strava sync error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

function parseDateParam(value: string | null) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date parameter: ${value}`);
  }

  return date;
}
