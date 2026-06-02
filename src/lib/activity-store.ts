import fs from "node:fs";
import { get, put, BlobError, BlobNotFoundError, type BlobAccessType } from "@vercel/blob";
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
  if (hasBlobAccess()) {
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
  if (hasBlobAccess()) {
    const blob = await put(ACTIVITY_BLOB_PATHNAME, csv, {
      access: getBlobAccess(),
      allowOverwrite: true,
      contentType: "text/csv; charset=utf-8",
      cacheControlMaxAge: 60,
      token: getBlobToken(),
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
      token: getBlobToken(),
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return null;
    }

    return new Response(result.stream).text();
  } catch (error) {
    if (error instanceof BlobNotFoundError || isBlobReadAuthError(error)) {
      return null;
    }

    throw error;
  }
}

function isBlobReadAuthError(error: unknown) {
  return error instanceof BlobError && /Failed to fetch blob: (401|403)\b/.test(error.message);
}

function hasBlobAccess() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      process.env.VERCEL_OIDC_TOKEN ||
      (process.env.VERCEL && process.env.BLOB_STORE_ID)
  );
}

function getBlobAccess(): BlobAccessType {
  return process.env.ACTIVITY_BLOB_ACCESS === "public" ? "public" : "private";
}

function getBlobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN;
}
