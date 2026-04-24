import type { MapStop } from "@/lib/types";

function buildStaticMapUrl(stops: MapStop[], apiKey: string, polyline: string | null): string {
  const base = "https://maps.googleapis.com/maps/api/staticmap";
  const params = new URLSearchParams({
    size: "1200x420",
    scale: "2",
    maptype: "roadmap",
    key: apiKey,
  });

  // Driving route polyline if available, otherwise straight lines
  if (polyline) {
    params.append("path", `color:0x1c2b3aCC|weight:4|enc:${polyline}`);
  } else {
    params.append(
      "path",
      "color:0x1c2b3aCC|weight:4|" + stops.map((s) => `${s.lat},${s.lng}`).join("|")
    );
  }

  // Numbered markers — dark for overnight, grey for drive-through
  stops.forEach((stop) => {
    const color = stop.overnight ? "0x1c2b3a" : "0x9ca3af";
    params.append("markers", `color:${color}|label:${stop.order}|${stop.lat},${stop.lng}`);
  });

  // Minimal map style — muted colours, no POI clutter
  const styleRules = [
    "feature:poi|visibility:off",
    "feature:transit|visibility:off",
    "feature:road|element:labels.icon|visibility:off",
    "feature:landscape|element:geometry|color:0xf4f6f8",
    "feature:water|element:geometry|color:0xc8d8e8",
    "feature:road.highway|element:geometry|color:0xffffff",
    "feature:road.highway|element:geometry.stroke|color:0xdde3ea",
  ];
  styleRules.forEach((rule) => params.append("style", rule));

  return `${base}?${params.toString()}`;
}

export default function JourneyMap({
  stops,
  polyline,
  apiKey,
}: {
  stops: MapStop[];
  polyline: string | null;
  apiKey: string;
}) {
  if (stops.length < 2) return null;
  const src = buildStaticMapUrl(stops, apiKey, polyline);
  return (
    <img
      src={src}
      alt="Journey route map"
      width={1200}
      height={420}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  );
}
