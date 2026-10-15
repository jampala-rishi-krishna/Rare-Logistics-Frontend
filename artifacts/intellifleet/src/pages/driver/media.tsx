import { useEffect, useState } from "react";
import { useT, useLang, photoCaption } from "./i18n";
import type { PhotoMeta } from "@/lib/tripTypes";
import { C } from "./ui";
import * as driverApi from "@/services/api/driver";

// Photos sit behind authenticated /api/media/{id}; bytes are fetched
// through the authenticated client and shown from an object URL.
export function PhotoViewer({ src, caption, onClose }: { src: string; caption: string; onClose: () => void }) {
 const t = useT();
 useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; const close = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onClose(); } }; window.addEventListener("keydown", close, true); return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close, true); }; }, [onClose]);
 return <div role="dialog" aria-modal="true" aria-label={t.photoOpen} data-testid="driver-photo-viewer" style={{ position: "fixed", inset: 0, zIndex: 100, background: C.ink, color: C.onInk, display: "flex", flexDirection: "column", padding: 20, gap: 12 }}>
  <button type="button" autoFocus onClick={onClose} style={{ minHeight: 48, padding: 12, background: C.card, color: C.ink, alignSelf: "flex-end", borderRadius: 12 }}>{t.photoClose}</button>
  <img src={src} alt={caption} style={{ flex: 1, minHeight: 0, objectFit: "contain", width: "100%" }} />
  <div style={{ overflowWrap: "anywhere" }}>{caption}</div>
 </div>;
}
export function MediaPhoto({ photoId, alt, meta }: { photoId: number | string; alt: string; meta?: PhotoMeta }) {
  const t = useT();
  const [lang] = useLang();
  const [open, setOpen] = useState(false);
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
      <button type="button" onClick={() => setAttempt((n) => n + 1)} style={{ minHeight: 48, border: `1px solid ${C.line}`, color: C.so, padding: 12 }}>
        {t.photoRetry}
      </button>
    );
  if (!url) return <span className="inline-block h-24 w-24 animate-pulse" style={{ background: C.muted }} aria-label={t.photoLoading} />;
  const caption = meta ? photoCaption(meta, lang) : alt;
  return <figure style={{ margin: 0, maxWidth: "100%" }} data-testid="driver-proof-photo">
    <button type="button" onClick={() => setOpen(true)} aria-label={t.photoOpen} style={{ padding: 0, background: C.card, border: 0 }}>
      <img src={url} alt={alt} className="h-24 w-24 object-cover" style={{ border: `1px solid ${C.line}`, borderRadius: 12 }} />
    </button>
    <figcaption style={{ color: C.sub, fontSize: 12, overflowWrap: "anywhere" }}>{caption}</figcaption>
    {open && <PhotoViewer src={url} caption={caption} onClose={() => setOpen(false)} />}
  </figure>;
}
