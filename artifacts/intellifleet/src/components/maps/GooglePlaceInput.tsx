import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useEffect, useRef, useState } from "react";
import type { RouteLocationSuggestion } from "@/services/api/routes";

let placesPromise: Promise<typeof google.maps.places> | null = null;
function placesApi() {
  if (!placesPromise) {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    if (!key) return Promise.reject(new Error("Google Maps is not configured."));
    setOptions({ key, v: "weekly" });
    placesPromise = importLibrary("places") as Promise<typeof google.maps.places>;
  }
  return placesPromise;
}

export function GooglePlaceInput({ label, value, onChange, placeholder }: { label: string; value: RouteLocationSuggestion | null; onChange: (value: RouteLocationSuggestion | null) => void; placeholder: string }) {
  const [text, setText] = useState(value?.label ?? "");
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setText(value?.label ?? ""), [value?.label]);
  useEffect(() => {
    let active = true;
    placesApi().then((api) => {
      if (!active || !inputRef.current) return;
      const autocomplete = new api.Autocomplete(inputRef.current, { componentRestrictions: { country: "ph" }, fields: ["place_id", "formatted_address", "name", "geometry"] });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const location = place.geometry?.location;
        if (!location) { setError("Select a place from the Google suggestions."); return; }
        const selected: RouteLocationSuggestion = { label: place.formatted_address || place.name || "Selected place", lat: location.lat(), lng: location.lng(), type: "Google place" };
        setText(selected.label); setError(""); onChange(selected);
      });
    }).catch(() => setError("Google Places suggestions are unavailable."));
    return () => { active = false; };
  }, []);
  return (
    <div className="relative grid min-w-0 gap-2">
      <label className="text-xs font-semibold">{label}</label>
      <input
        ref={inputRef}
        required
        value={text}
        title={text}
        onChange={(e) => { setText(e.target.value); onChange(null); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-11 w-full min-w-0 truncate rounded-[4px] border border-[#d8d7d2] px-3 text-base font-normal outline-none focus:border-black sm:text-sm"
      />
      {focused && text.length > 38 && <div className="break-words text-[11px] leading-snug text-[#77787b]">{text}</div>}
      {error && <div className="text-[10px] text-[#a16819]">{error}</div>}
    </div>
  );
}
