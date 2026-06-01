import { parseCsv } from "@/lib/activity-csv";
import { readActivityCsv } from "@/lib/activity-store";

export type ActivityDay = {
  date: string;
  movingTimeSeconds: number;
  runSeconds: number;
  rideSeconds: number;
  distanceKm: number;
  elevationGainMeters: number;
  activityCount: number;
  intensity: 0 | 1 | 2 | 3 | 4 | 5;
};

export type ActivityCell = ActivityDay & {
  weekIndex: number;
  dayIndex: number;
};

export type ActivityTimeline = {
  all: ActivityCell[];
  latestYear: ActivityCell[];
  latestSixMonths: ActivityCell[];
  archive: ActivityCell[];
  totals: {
    activities: number;
    movingTimeSeconds: number;
    distanceKm: number;
    elevationGainMeters: number;
    firstDate: string | null;
    lastDate: string | null;
  };
  parse: {
    missingFile: boolean;
    skippedRows: number;
  };
};

type RawActivity = {
  id: string;
  date: Date;
  type: string;
  movingTimeSeconds: number;
  distanceKm: number;
  elevationGainMeters: number;
};

const INCLUDED_TYPES = new Set(["Run", "Trail Run", "Ride", "Virtual Ride"]);
const RUN_TYPES = new Set(["Run", "Trail Run"]);
const RIDE_TYPES = new Set(["Ride", "Virtual Ride"]);

export async function getActivityTimeline(): Promise<ActivityTimeline> {
  const { csv } = await readActivityCsv();

  if (!csv) {
    return createEmptyTimeline(true);
  }

  const rows = parseCsv(csv);

  if (rows.length < 2) {
    return createEmptyTimeline(false);
  }

  const headers = rows[0];
  const columns = {
    id: headers.indexOf("Activity ID"),
    date: headers.indexOf("Activity Date"),
    type: headers.indexOf("Activity Type"),
    movingTime: headers.indexOf("Moving Time"),
    distance: headers.indexOf("Distance"),
    elevation: headers.indexOf("Elevation Gain"),
  };

  let skippedRows = 0;
  const activities: RawActivity[] = [];

  for (const row of rows.slice(1)) {
    const activity = normalizeActivity(row, columns);

    if (!activity) {
      skippedRows += 1;
      continue;
    }

    if (INCLUDED_TYPES.has(activity.type)) {
      activities.push(activity);
    }
  }

  if (activities.length === 0) {
    return {
      ...createEmptyTimeline(false),
      parse: { missingFile: false, skippedRows },
    };
  }

  const days = aggregateByDay(activities);
  const sortedDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const lastDate = parseDateKey(sortedDays[sortedDays.length - 1].date);
  const firstDate = parseDateKey(sortedDays[0].date);
  const latestYearStart = startOfWeek(subtractMonths(lastDate, 12));
  const latestStart = startOfWeek(subtractMonths(lastDate, 6));
  const latestEnd = endOfWeek(lastDate);
  const archiveEnd = addDays(latestStart, -1);

  const totals = sortedDays.reduce(
    (acc, day) => {
      acc.activities += day.activityCount;
      acc.movingTimeSeconds += day.movingTimeSeconds;
      acc.distanceKm += day.distanceKm;
      acc.elevationGainMeters += day.elevationGainMeters;
      return acc;
    },
    {
      activities: 0,
      movingTimeSeconds: 0,
      distanceKm: 0,
      elevationGainMeters: 0,
      firstDate: formatDateKey(firstDate),
      lastDate: formatDateKey(lastDate),
    }
  );

  return {
    all: buildGrid(startOfWeek(firstDate), endOfWeek(lastDate), days),
    latestYear: buildGrid(latestYearStart, latestEnd, days),
    latestSixMonths: buildGrid(latestStart, latestEnd, days),
    archive: archiveEnd >= firstDate ? buildGrid(startOfWeek(firstDate), endOfWeek(archiveEnd), days) : [],
    totals,
    parse: { missingFile: false, skippedRows },
  };
}

function normalizeActivity(
  row: string[],
  columns: Record<"id" | "date" | "type" | "movingTime" | "distance" | "elevation", number>
): RawActivity | null {
  const id = getCell(row, columns.id);
  const type = getCell(row, columns.type);
  const date = new Date(getCell(row, columns.date));
  const movingTimeSeconds = Number(getCell(row, columns.movingTime));
  const distanceKm = Number(getCell(row, columns.distance));
  const elevationGainMeters = Number(getCell(row, columns.elevation));

  if (!id || !type || Number.isNaN(date.getTime()) || !Number.isFinite(movingTimeSeconds)) {
    return null;
  }

  return {
    id,
    type,
    date,
    movingTimeSeconds,
    distanceKm: Number.isFinite(distanceKm) ? distanceKm : 0,
    elevationGainMeters: Number.isFinite(elevationGainMeters) ? elevationGainMeters : 0,
  };
}

function aggregateByDay(activities: RawActivity[]) {
  const days = new Map<string, ActivityDay>();

  for (const activity of activities) {
    const date = formatDateKey(activity.date);
    const current = days.get(date) ?? {
      date,
      movingTimeSeconds: 0,
      runSeconds: 0,
      rideSeconds: 0,
      distanceKm: 0,
      elevationGainMeters: 0,
      activityCount: 0,
      intensity: 0,
    };

    current.movingTimeSeconds += activity.movingTimeSeconds;
    if (RUN_TYPES.has(activity.type)) {
      current.runSeconds += activity.movingTimeSeconds;
    }
    if (RIDE_TYPES.has(activity.type)) {
      current.rideSeconds += activity.movingTimeSeconds;
    }
    current.distanceKm += activity.distanceKm;
    current.elevationGainMeters += activity.elevationGainMeters;
    current.activityCount += 1;
    current.intensity = getIntensity(current.movingTimeSeconds);
    days.set(date, current);
  }

  return days;
}

function buildGrid(startDate: Date, endDate: Date, days: Map<string, ActivityDay>): ActivityCell[] {
  const cells: ActivityCell[] = [];
  let cursor = new Date(startDate);
  let weekIndex = 0;

  while (cursor <= endDate) {
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = formatDateKey(cursor);
      const day = days.get(date) ?? {
        date,
        movingTimeSeconds: 0,
        runSeconds: 0,
        rideSeconds: 0,
        distanceKm: 0,
        elevationGainMeters: 0,
        activityCount: 0,
        intensity: 0 as const,
      };

      cells.push({ ...day, weekIndex, dayIndex });
      cursor = addDays(cursor, 1);
    }

    weekIndex += 1;
  }

  return cells;
}

function getCell(row: string[], index: number) {
  return index >= 0 ? row[index]?.trim() ?? "" : "";
}

function getIntensity(seconds: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (seconds <= 0) return 0;
  if (seconds < 30 * 60) return 1;
  if (seconds < 60 * 60) return 2;
  if (seconds < 120 * 60) return 3;
  if (seconds < 5 * 60 * 60) return 4;
  return 5;
}

function startOfWeek(date: Date) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysFromMonday = (next.getDay() + 6) % 7;

  next.setDate(next.getDate() - daysFromMonday);
  return next;
}

function endOfWeek(date: Date) {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 6);
  return next;
}

function subtractMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() - months, date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  next.setDate(next.getDate() + days);
  return next;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function createEmptyTimeline(missingFile: boolean): ActivityTimeline {
  return {
    all: [],
    latestYear: [],
    latestSixMonths: [],
    archive: [],
    totals: {
      activities: 0,
      movingTimeSeconds: 0,
      distanceKm: 0,
      elevationGainMeters: 0,
      firstDate: null,
      lastDate: null,
    },
    parse: {
      missingFile,
      skippedRows: 0,
    },
  };
}
