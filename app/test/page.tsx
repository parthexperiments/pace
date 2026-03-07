'use client';

import { useState } from "react";

interface SyncResult {
  synced_count?: number;
  skipped_count?: number;
  synced_activity_ids?: number[];
  skipped_activity_ids?: number[];
  error?: string;
}

export default function TestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/strava/sync", {
        method: "POST",
      });

      const json = (await res.json()) as SyncResult;

      if (!res.ok) {
        setError(json.error ?? "Sync request failed");
      } else {
        setResult(json);
      }
    } catch (err) {
      setError("Unexpected error while calling /api/strava/sync");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-xl space-y-6 rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">
          Strava Sync Test
        </h1>
        <p className="text-sm text-zinc-600">
          This page is for development/testing only. It will call{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">
            POST /api/strava/sync
          </code>{" "}
          using your current session.
        </p>

        <button
          type="button"
          onClick={handleSync}
          disabled={loading}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Syncing…" : "Sync latest Strava runs"}
        </button>

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-2 rounded-md bg-zinc-50 p-3 text-sm text-zinc-800">
            <div>
              <span className="font-medium">Synced count:</span>{" "}
              {result.synced_count ?? 0}
            </div>
            <div>
              <span className="font-medium">Skipped count:</span>{" "}
              {result.skipped_count ?? 0}
            </div>
            {(result.synced_activity_ids || result.skipped_activity_ids) && (
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-black/90 p-2 text-xs text-zinc-100">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

