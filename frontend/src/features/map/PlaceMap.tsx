import { Box } from "@mui/material";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { Link as RouterLink } from "react-router-dom";
import "leaflet/dist/leaflet.css";

import { COLORS } from "../../theme/themes";
import { MapStylePicker } from "./MapStylePicker";
import { useMapStyle } from "./mapStyles";

const MAX_ZOOM = 19;

export type MapPin = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  color: string;
  label: string;
  detail?: string;
  href?: string | null;
};

type PlaceMapProps = {
  center: { latitude: number; longitude: number };
  zoom: number;
  pins: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onPick?: (latitude: number, longitude: number) => void;
  fitPins?: boolean;
  showRoute?: boolean;
  height?: number | string | { xs?: number | string; sm?: number | string; md?: number | string };
};

export function PlaceMap({
  center,
  zoom,
  pins,
  selectedId,
  onSelect,
  onPick,
  fitPins = false,
  showRoute = false,
  height = 440,
}: PlaceMapProps) {
  const position: [number, number] = [center.latitude, center.longitude];
  const { tiles } = useMapStyle();

  return (
    <Box
      sx={{
        position: "relative",
        height,
        borderRadius: 2,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        "& .leaflet-container": {
          height: "100%",
          width: "100%",
          background: COLORS.map,
          fontFamily: "inherit",
          cursor: onPick ? "crosshair" : undefined,
        },
        "& .leaflet-popup-content": { margin: "10px 12px", minWidth: 140 },
        "& .leaflet-popup-content a": { color: "primary.main" },
      }}
    >
      <MapStylePicker />
      <MapContainer center={position} zoom={zoom} maxZoom={MAX_ZOOM} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          key={tiles.url}
          attribution={tiles.attribution}
          url={tiles.url}
          maxZoom={MAX_ZOOM}
          maxNativeZoom={tiles.maxZoom}
          {...(tiles.subdomains ? { subdomains: tiles.subdomains } : {})}
        />
        {tiles.labels && <TileLayer key={tiles.labels} url={tiles.labels} maxZoom={MAX_ZOOM} maxNativeZoom={tiles.maxZoom} />}
        {fitPins && pins.length > 0 ? <FitPins pins={pins} /> : <Recenter center={position} zoom={zoom} />}
        {onPick && <PickHandler onPick={onPick} />}
        <FocusPin pins={pins} selectedId={selectedId} />
        {showRoute && pins.length >= 2 && (
          <Polyline
            positions={pins.map((pin) => [pin.latitude, pin.longitude] as [number, number])}
            pathOptions={{ color: "#0f766e", weight: 4, opacity: 0.85 }}
          />
        )}
        {pins.map((pin) => (
          <CircleMarker
            key={pin.id}
            center={[pin.latitude, pin.longitude]}
            radius={selectedId === pin.id ? 12 : 9}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: pin.color,
              fillOpacity: 0.95,
            }}
            eventHandlers={{ click: () => onSelect?.(pin.id) }}
          >
            <Popup>
              <strong>{pin.name}</strong>
              <div>{pin.label}</div>
              {pin.detail ? <div>{pin.detail}</div> : null}
              {pin.href ? <RouterLink to={pin.href}>View</RouterLink> : null}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </Box>
  );
}

function FitPins({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  const key = pins.map((pin) => `${pin.latitude.toFixed(5)},${pin.longitude.toFixed(5)}`).join("|");
  useEffect(() => {
    const points = key.split("|").map((item) => item.split(",").map(Number) as [number, number]);
    if (points.length === 1) {
      map.flyTo(points[0], Math.max(map.getZoom(), 15), { duration: 0.45 });
      return;
    }
    map.fitBounds(points, { padding: [48, 48], maxZoom: 16, animate: true });
  }, [key, map]);
  return null;
}

function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const latitude = center[0];
  const longitude = center[1];
  useEffect(() => {
    map.setView([latitude, longitude], zoom);
  }, [latitude, longitude, zoom, map]);
  return null;
}

function FocusPin({ pins, selectedId }: { pins: MapPin[]; selectedId?: string | null }) {
  const map = useMap();
  useEffect(() => {
    const pin = pins.find((item) => item.id === selectedId);
    if (!pin) return;
    map.flyTo([pin.latitude, pin.longitude], Math.max(map.getZoom(), 16), { duration: 0.6 });
  }, [selectedId, pins, map]);
  return null;
}

function PickHandler({ onPick }: { onPick: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}
