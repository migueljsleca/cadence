import fs from "node:fs";
import { get, put, BlobNotFoundError, type BlobAccessType } from "@vercel/blob";
import { getActivityCsvPath } from "@/lib/activity-csv";

export const ACTIVITY_BLOB_PATHNAME = "activities.csv";

export type ActivityStoreRead = {
  csv: string | null;
  source: "blob" | "file" | "missing";
};

export type ActivityStoreWrite = {
  source: "blob" | "file";
  pathname?: string;
  url?: string;
};

export async function readActivityCsv(): Promise<ActivityStoreRead> {
  if (hasBlobToken()) {
    const blobCsv = await readActivityCsvFromBlob();

    if (blobCsv !== null) {
      return {
        csv: blobCsv,
        source: "blob",
      };
    }
  }

  const csvPath = getActivityCsvPath();

  if (!fs.existsSync(csvPath)) {
    return {
      csv: null,
      source: "missing",
    };
  }

  return {
    csv: fs.readFileSync(csvPath, "utf8"),
    source: "file",
  };
}

export async function writeActivityCsv(csv: string): Promise<ActivityStoreWrite> {
  if (hasBlobToken()) {
    const blob = await put(ACTIVITY_BLOB_PATHNAME, csv, {
      access: getBlobAccess(),
      allowOverwrite: true,
      contentType: "text/csv; charset=utf-8",
      cacheControlMaxAge: 60,
    });

    return {
      source: "blob",
      pathname: blob.pathname,
      url: blob.url,
    };
  }

  fs.writeFileSync(getActivityCsvPath(), csv);

  return {
    source: "file",
  };
}

async function readActivityCsvFromBlob() {
  try {
    const result = await get(ACTIVITY_BLOB_PATHNAME, {
      access: getBlobAccess(),
      useCache: false,
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return null;
    }

    return new Response(result.stream).text();
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return null;
    }

    throw error;
  }
}

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function getBlobAccess(): BlobAccessType {
  return process.env.ACTIVITY_BLOB_ACCESS === "public" ? "public" : "private";
}
