// Proof-of-delivery thumbnails + lightbox, shared by desktop card and phone screen. Photos are fetched with the
// authenticated tracker.photo(id) call and shown through object URLs that are revoked on unmount / retry.
import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import * as tracker from "@/services/api/orderTracker";
import type { PhotoView } from "@/lib/orderTrackerView";
import "./media.css";

function usePhotoUrl(id: number, attempt: number) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true, objectUrl = "";
    setError(false); setUrl("");
    tracker.photo(id)
      .then(blob => {
        if (!active) return;
        // An empty or non-image body (e.g. an error page served as 200) would paint as a blank tile: treat it as a failure.
        if (!blob || blob.size === 0 || (blob.type && !blob.type.startsWith("image/"))) { setError(true); return; }
        objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, attempt]);
  return { url, error, fail: () => setError(true) };
}

export function ProofPhotos({ photos, variant, emptyHint }: { photos: PhotoView[]; variant: "desk" | "phone"; emptyHint: string }) {
  const [open, setOpen] = useState<{ photo: PhotoView; url: string } | null>(null);
  if (!photos.length) {
    return (
      <div className={`otm-thumbs otm-thumbs-${variant}`}>
        {[0, 1, 2].map(i => (
          <span key={i} className="otm-thumb-empty" aria-hidden={i > 0 ? "true" : undefined}>
            {i === 0 && <><Camera size={24} strokeWidth={1.8} aria-hidden="true" /><span className="otm-thumb-empty-text">{emptyHint}</span></>}
          </span>
        ))}
      </div>
    );
  }
  return (
    <>
      <div className={`otm-thumbs otm-thumbs-${variant}`}>
        {photos.map(p => <Thumb key={p.id} photo={p} variant={variant} onOpen={url => setOpen({ photo: p, url })} />)}
      </div>
      {open && <Lightbox photo={open.photo} url={open.url} onClose={() => setOpen(null)} />}
    </>
  );
}

function Thumb({ photo, variant, onOpen }: { photo: PhotoView; variant: "desk" | "phone"; onOpen: (url: string) => void }) {
  const [attempt, setAttempt] = useState(0);
  const { url, error, fail } = usePhotoUrl(photo.id, attempt);
  const caption = variant === "desk" && <><span className="otm-cap-label">{photo.label}</span><span className="otm-cap-time">{photo.caption}</span></>;
  if (error) {
    return (
      <div className="otm-thumb">
        <span className="otm-thumb-box otm-thumb-error" role="status">
          Photo unavailable
          <button type="button" className="otm-retry" onClick={() => setAttempt(a => a + 1)}>Retry photo</button>
        </span>
        {caption}
      </div>
    );
  }
  return (
    <button type="button" className="otm-thumb" disabled={!url} onClick={() => url && onOpen(url)}
      aria-label={`Open photo: ${photo.label}, ${photo.caption} (${photo.basis})`}>
      <span className="otm-thumb-box">{url ? <img src={url} alt="" decoding="async" onError={fail} /> : <span className="otm-thumb-loading">Loading…</span>}</span>
      {caption}
    </button>
  );
}

function Lightbox({ photo, url, onClose }: { photo: PhotoView; url: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal?.();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return (
    <dialog ref={ref} className="otm-lightbox" aria-label={photo.label} onClose={onClose}
      onClick={e => { if (e.target === ref.current) onClose(); }}>
      <div className="otm-lightbox-body">
        <div className="otm-lightbox-head">
          <div><b>{photo.label}</b><span>{photo.caption} · {photo.basis}</span></div>
          <button type="button" className="otm-close" onClick={onClose} aria-label="Close photo" autoFocus><X size={20} strokeWidth={2} aria-hidden="true" /></button>
        </div>
        <img src={url} alt={photo.alt} />
      </div>
    </dialog>
  );
}
