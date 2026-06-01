import {
  ACTIVITY_CSV_HEADERS,
  formatCsvRows,
  parseCsv,
} from "@/lib/activity-csv";
import { readActivityCsv, writeActivityCsv } from "@/lib/activity-store";

type StravaTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
};

type StravaSummaryActivity = {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  start_date: string;
  start_date_local?: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  total_elevation_gain?: number;
  max_speed?: number;
  average_speed?: number;
  max_heartrate?: number;
  suffer_score?: number;
  commute?: boolean;
  gear_id?: string | null;
  kilojoules?: number;
  calories?: number;
  average_heartrate?: number;
  max_watts?: number;
  average_watts?: number;
  weighted_average_watts?: number;
};

export type StravaSyncResult = {
  fetched: number;
  inserted: number;
  skipped: number;
  after: string;
  before: string;
  storage: "blob" | "file";
  pathname?: string;
  url?: string;
};

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";
const PER_PAGE = 200;

export async function syncStravaActivities(options: { after?: Date; before?: Date } = {}) {
  const range = getSyncRange(options);
  const accessToken = await refreshAccessToken();
  const activities = await fetchActivities(accessToken, range.after, range.before);
  const stored = await readActivityCsv();
  const rows = stored.csv ? parseCsv(stored.csv) : [Array.from(ACTIVITY_CSV_HEADERS)];
  const headers = ensureHeaders(rows);
  const columns = getColumnIndexes(headers);
  const existingIds = new Set(rows.slice(1).map((row) => getCell(row, columns.id)));
  const newRows = activities
    .filter((activity) => !existingIds.has(String(activity.id)))
    .map((activity) => formatActivityRow(activity, headers, columns));

  let writeResult:
    | Awaited<ReturnType<typeof writeActivityCsv>>
    | { source: typeof stored.source; pathname?: string; url?: string } = { source: stored.source };

  if (newRows.length > 0) {
    rows.splice(1, 0, ...newRows);
    writeResult = await writeActivityCsv(formatCsvRows(rows));
  }

  return {
    fetched: activities.length,
    inserted: newRows.length,
    skipped: activities.length - newRows.length,
    after: range.after.toISOString(),
    before: range.before.toISOString(),
    storage: writeResult.source === "blob" ? "blob" : "file",
    pathname: writeResult.pathname,
    url: writeResult.url,
  } satisfies StravaSyncResult;
}

function getSyncRange(options: { after?: Date; before?: Date }): { after: Date; before: Date } {
  if (options.after && options.before) {
    return {
      after: options.after,
      before: options.before,
    };
  }

  const now = new Date();
  const thisMonday = startOfUtcWeek(now);
  const lastMonday = addUtcDays(thisMonday, -7);

  return {
    after: options.after ?? lastMonday,
    before: options.before ?? thisMonday,
  };
}

async function refreshAccessToken() {
  const clientId = requireEnv("STRAVA_CLIENT_ID");
  const clientSecret = requireEnv("STRAVA_CLIENT_SECRET");
  const refreshToken = requireEnv("STRAVA_REFRESH_TOKEN");
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Strava token refresh failed with ${response.status}`);
  }

  const token = (await response.json()) as StravaTokenResponse;

  if (!token.access_token) {
    throw new Error("Strava token refresh did not return an access token");
  }

  return token.access_token;
}

async function fetchActivities(accessToken: string, after: Date, before: Date) {
  const activities: StravaSummaryActivity[] = [];

  for (let page = 1; ; page += 1) {
    const url = new URL(STRAVA_ACTIVITIES_URL);
    url.searchParams.set("after", toUnixSeconds(after).toString());
    url.searchParams.set("before", toUnixSeconds(before).toString());
    url.searchParams.set("page", page.toString());
    url.searchParams.set("per_page", PER_PAGE.toString());

    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Strava activities fetch failed with ${response.status}`);
    }

    const pageActivities = (await response.json()) as StravaSummaryActivity[];
    activities.push(...pageActivities);

    if (pageActivities.length < PER_PAGE) {
      break;
    }
  }

  return activities;
}

function ensureHeaders(rows: string[][]) {
  if (rows.length === 0) {
    rows.push(Array.from(ACTIVITY_CSV_HEADERS));
  }

  return rows[0];
}

function getColumnIndexes(headers: string[]) {
  return {
    id: headers.indexOf("Activity ID"),
    date: headers.indexOf("Activity Date"),
    name: headers.indexOf("Activity Name"),
    type: headers.indexOf("Activity Type"),
    elapsedTime: headers.indexOf("Elapsed Time"),
    movingTime: headers.indexOf("Moving Time"),
    distanceKm: headers.indexOf("Distance"),
    distanceMeters: headers.lastIndexOf("Distance"),
    maxSpeed: headers.indexOf("Max Speed"),
    averageSpeed: headers.indexOf("Average Speed"),
    elevation: headers.indexOf("Elevation Gain"),
    maxHeartRate: headers.indexOf("Max Heart Rate"),
    relativeEffort: headers.indexOf("Relative Effort"),
    commute: headers.indexOf("Commute"),
    gear: headers.indexOf("Activity Gear"),
    weightedAveragePower: headers.indexOf("Weighted Average Power"),
    maxWatts: headers.indexOf("Max Watts"),
    averageWatts: headers.indexOf("Average Watts"),
    calories: headers.indexOf("Calories"),
    averageHeartRate: headers.indexOf("Average Heart Rate"),
    totalWork: headers.indexOf("Total Work"),
  };
}

function formatActivityRow(
  activity: StravaSummaryActivity,
  headers: string[],
  columns: ReturnType<typeof getColumnIndexes>
) {
  const row = Array.from({ length: headers.length }, () => "");
  const startedAt = new Date(activity.start_date_local ?? activity.start_date);

  setCell(row, columns.id, String(activity.id));
  setCell(row, columns.date, formatStravaExportDate(startedAt));
  setCell(row, columns.name, activity.name);
  setCell(row, columns.type, normalizeActivityType(activity.sport_type ?? activity.type));
  setCell(row, columns.elapsedTime, formatNumber(activity.elapsed_time));
  setCell(row, columns.movingTime, formatNumber(activity.moving_time));
  setCell(row, columns.distanceKm, formatNumber(activity.distance / 1000, 2));
  setCell(row, columns.distanceMeters, formatNumber(activity.distance, 1));
  setCell(row, columns.maxSpeed, formatOptionalNumber(activity.max_speed, 3));
  setCell(row, columns.averageSpeed, formatOptionalNumber(activity.average_speed, 3));
  setCell(row, columns.elevation, formatOptionalNumber(activity.total_elevation_gain, 1));
  setCell(row, columns.maxHeartRate, formatOptionalNumber(activity.max_heartrate, 1));
  setCell(row, columns.relativeEffort, formatOptionalNumber(activity.suffer_score));
  setCell(row, columns.commute, activity.commute ? "true" : "false");
  setCell(row, columns.gear, activity.gear_id ?? "");
  setCell(row, columns.weightedAveragePower, formatOptionalNumber(activity.weighted_average_watts, 1));
  setCell(row, columns.maxWatts, formatOptionalNumber(activity.max_watts, 1));
  setCell(row, columns.averageWatts, formatOptionalNumber(activity.average_watts, 1));
  setCell(row, columns.calories, formatOptionalNumber(activity.calories, 1));
  setCell(row, columns.averageHeartRate, formatOptionalNumber(activity.average_heartrate, 1));
  setCell(row, columns.totalWork, formatOptionalNumber(activity.kilojoules, 1));

  return row;
}

function normalizeActivityType(type: string) {
  const withSpaces = type.replace(/([a-z])([A-Z])/g, "$1 $2");

  if (withSpaces === "Virtual Ride") {
    return "Virtual Ride";
  }

  if (withSpaces === "Trail Run") {
    return "Trail Run";
  }

  return withSpaces;
}

function formatStravaExportDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

function formatNumber(value: number, digits = 0) {
  return value.toFixed(digits);
}

function formatOptionalNumber(value: number | undefined, digits = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "";
}

function getCell(row: string[], index: number) {
  return index >= 0 ? row[index]?.trim() ?? "" : "";
}

function setCell(row: string[], index: number, value: string) {
  if (index >= 0) {
    row[index] = value;
  }
}

function startOfUtcWeek(date: Date) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysFromMonday = (next.getUTCDay() + 6) % 7;
  next.setUTCDate(next.getUTCDate() - daysFromMonday);
  return next;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toUnixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}
