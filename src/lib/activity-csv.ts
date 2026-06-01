import fs from "node:fs";
import path from "node:path";

export const ACTIVITY_CSV_FILENAME = "activities.csv";

export const ACTIVITY_CSV_HEADERS = [
  "Activity ID",
  "Activity Date",
  "Activity Name",
  "Activity Type",
  "Activity Description",
  "Elapsed Time",
  "Distance",
  "Max Heart Rate",
  "Relative Effort",
  "Commute",
  "Activity Private Note",
  "Activity Gear",
  "Filename",
  "Athlete Weight",
  "Bike Weight",
  "Elapsed Time",
  "Moving Time",
  "Distance",
  "Max Speed",
  "Average Speed",
  "Elevation Gain",
] as const;

export function getActivityCsvPath() {
  return path.join(process.cwd(), ACTIVITY_CSV_FILENAME);
}

export function readActivityCsvRows(csvPath = getActivityCsvPath()) {
  if (!fs.existsSync(csvPath)) {
    return [Array.from(ACTIVITY_CSV_HEADERS)];
  }

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  return rows.length > 0 ? rows : [Array.from(ACTIVITY_CSV_HEADERS)];
}

export function writeActivityCsvRows(rows: string[][], csvPath = getActivityCsvPath()) {
  fs.writeFileSync(csvPath, formatCsvRows(rows));
}

export function formatCsvRows(rows: string[][]) {
  return `${rows.map(formatCsvRow).join("\n")}\n`;
}

export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((csvRow) => csvRow.some((value) => value.length > 0));
}

export function formatCsvRow(row: string[]) {
  return row.map(formatCsvCell).join(",");
}

function formatCsvCell(value: string) {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll("\"", "\"\"")}"`;
}
