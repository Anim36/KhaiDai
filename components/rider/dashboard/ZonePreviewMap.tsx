"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

/**
 * Read-only Leaflet map showing a single pin + radius circle.
 * Used on the admin rider detail page ("Change zone" preview)
 * and the rider settings page. Lazy-loaded so its leaflet
 * bundle doesn't bleed into every page.
 */
function ZonePreviewMapBody({
  lat,
  lng,
  radiusKm,
}: {
  lat: number;
  lng: number;
  radiusKm: number;
  address: string;
}) {
  const [libs, setLibs] = useState<null | {
    MapContainer: typeof import("react-leaflet").MapContainer;
    TileLayer: typeof import("react-leaflet").TileLayer;
    Circle: typeof import("react-leaflet").Circle;
    Marker: typeof import("react-leaflet").Marker;
  }>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("react-leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled) return;
      setLibs({
        MapContainer: mod.MapContainer,
        TileLayer: mod.TileLayer,
        Circle: mod.Circle,
        Marker: mod.Marker,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  if (!libs) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-[12px] text-ink-muted">
        Loading map…
      </div>
    );
  }
  const { MapContainer, TileLayer, Circle, Marker } = libs;
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={13}
      scrollWheelZoom={false}
      dragging={false}
      doubleClickZoom={false}
      zoomControl={false}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Circle
        center={[lat, lng]}
        radius={radiusKm * 1000}
        pathOptions={{
          color: "#e3340b",
          weight: 2,
          fillColor: "#e3340b",
          fillOpacity: 0.08,
        }}
      />
      <Marker position={[lat, lng]} />
    </MapContainer>
  );
}

const ZonePreviewMap = dynamic(() => Promise.resolve(ZonePreviewMapBody), {
  ssr: false,
});

export { ZonePreviewMap };
