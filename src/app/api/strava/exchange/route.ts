export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StravaTokenResponse = {
  refresh_token?: string;
  scope?: string;
  message?: string;
  errors?: unknown;
};

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = (await request.json()) as { code?: string };

  if (!code) {
    return Response.json({ error: "Missing code" }, { status: 400 });
  }

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  const token = (await response.json()) as StravaTokenResponse;

  if (!response.ok || !token.refresh_token) {
    return Response.json(
      { ok: false, error: token.message ?? "Strava token exchange failed", details: token.errors },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    refreshToken: token.refresh_token,
    scope: token.scope,
  });
}
