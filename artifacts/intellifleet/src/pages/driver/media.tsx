import { useEffect, useState } from "react";
import * as driverApi from "@/services/api/driver";

// Photos sit behind /api/media/{id} (bearer token + 302 to a presigned URL), so they are fetched
// through the authenticated client and shown from an object URL.
export function MediaPhoto({ photoId, alt }: { photoId: number | string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;
    setFailed(false);
    driverApi
      .fetchMediaBlob(photoId)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId, attempt]);
  if (failed)
    return (
      <button type="button" onClick={() => setAttempt((n) => n + 1)} className="min-h-[48px] border border-[#d8d7d2] px-3 text-xs font-semibold text-[#86000B]">
        Photo unavailable. Tap to retry
      </button>
    );
  if (!url) return <span className="inline-block h-24 w-24 animate-pulse bg-[#e4e3df]" aria-label="Loading photo" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${alt}`}>
      <img src={url} alt={alt} className="h-24 w-24 border border-[#e4e3df] object-cover" />
    </a>
  );
}
