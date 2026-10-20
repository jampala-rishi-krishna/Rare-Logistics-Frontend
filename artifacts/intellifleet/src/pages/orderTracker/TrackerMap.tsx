// Truck map shared by the desktop order card and the phone order screen. Uses the existing Google Maps loader (useMaps);
// shows the plate label + "updated N min ago" over the map, and a grey "no live location" panel when there is no safe fix.
import { useEffect, useRef } from "react";
import { Truck } from "lucide-react";
import { useMaps } from "@/components/maps/GoogleMaps";
import type { Gps, LastEvent } from "@/lib/orderTrackerView";
import "./media.css";

export function TrackerMap({ gps, lastEvent, reason, emptyTitle, height, variant }: {
  gps: Gps | null; lastEvent: LastEvent | null; reason?: string | null; emptyTitle: string; height: number; variant: "desk" | "phone";
}) {
  if (!gps) return <NoLocation lastEvent={lastEvent} reason={reason ?? null} title={emptyTitle} variant={variant} />;
  return <LiveMap gps={gps} height={height} variant={variant} />;
}

function LiveMap({ gps, height, variant }: { gps: Gps; height: number; variant: "desk" | "phone" }) {
  const { api, error } = useMaps();
  const element = useRef<HTMLDivElement>(null);
  const { lat, lng, plate } = gps;
  useEffect(() => {
    if (!api || !element.current) return;
    // Centre on the fix and keep it centred (no panning) so the overlay pin + plate label stay on the truck.
    const map = new api.maps.Map(element.current, {
      center: { lat, lng }, zoom: 14, disableDefaultUI: true, zoomControl: variant === "desk",
      gestureHandling: "none", keyboardShortcuts: false, clickableIcons: false,
    });
    return () => { api.maps.event.clearInstanceListeners(map); };
  }, [api, lat, lng, variant]);
  const label = `Truck ${plate} location ${gps.coords}, GPS fix ${gps.ago}`;
  return (
    <div className={`otm-map otm-map-${variant}`} style={{ height }} role="img" aria-label={label}>
      <div className="otm-map-canvas" ref={element} />
      {(error || !api) && <span className="otm-map-note">{error ? `Map unavailable · ${gps.coords}` : "Loading map…"}</span>}
      <span className="otm-pin" aria-hidden="true">
        {variant === "desk" && <span className="otm-plate"><Truck size={15} strokeWidth={2.2} />{plate}</span>}
        <span className="otm-dot" />
      </span>
      <span className={`otm-tag otm-tag-${variant}`} aria-hidden="true">
        {variant === "desk" ? `Truck now · updated ${gps.ago}` : `${plate} · ${gps.ago}`}
      </span>
    </div>
  );
}

function NoLocation({ lastEvent, reason, title, variant }: { lastEvent: LastEvent | null; reason: string | null; title: string; variant: "desk" | "phone" }) {
  return (
    <div className={`otm-empty otm-empty-${variant}`}>
      <span className="otm-empty-icon" aria-hidden="true"><Truck size={22} strokeWidth={2} /></span>
      <div className="otm-empty-text">
        <p className="otm-empty-title">{title}</p>
        {/* The phone screen shows the last event in its own big line under the panel, so it passes lastEvent=null. */}
        {(lastEvent || variant === "desk") && <p className="otm-empty-sub">
          {lastEvent ? <>Last recorded: {lastEvent.label} <b>{lastEvent.time}</b></> : "No journey event recorded yet"}
        </p>}
        {reason && <p className="otm-empty-sub">{reason}</p>}
      </div>
    </div>
  );
}
