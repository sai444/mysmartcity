import { useColorScheme } from "@mui/material/styles";
import { useCallback, useSyncExternalStore } from "react";

import type { MapStyle } from "../../api/types";
import { useAuth } from "../auth/AuthContext";

export type TileStyle = {
  label: string;
  hint: string;
  url: string;
  labels?: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string;
  swatch: string;
};

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

export const TILE_STYLES: Record<Exclude<MapStyle, "auto">, TileStyle> = {
  street: {
    label: "Street",
    hint: "Classic OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: OSM,
    maxZoom: 19,
    swatch: "linear-gradient(135deg, #f2efe9 0 45%, #f7c873 45% 55%, #aad3df 55%)",
  },
  voyager: {
    label: "Colourful",
    hint: "Bright roads and buildings",
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    attribution: `${OSM} &copy; <a href="https://www.hotosm.org/">Humanitarian OSM Team</a>`,
    maxZoom: 19,
    subdomains: "abc",
    swatch: "linear-gradient(135deg, #f6f4ee 0 45%, #f5c48a 45% 55%, #b8dbe6 55%)",
  },
  light: {
    label: "Light",
    hint: "Clean grey, pins stand out",
    url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: "Tiles &copy; Esri, HERE, Garmin, OpenStreetMap contributors",
    maxZoom: 16,
    swatch: "linear-gradient(135deg, #fafafa 0 45%, #e3e3e3 45% 55%, #d4dadc 55%)",
  },
  dark: {
    label: "Dark",
    hint: "Easy on the eyes at night",
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: "Tiles &copy; Esri, HERE, Garmin, OpenStreetMap contributors",
    maxZoom: 16,
    swatch: "linear-gradient(135deg, #2b2b2b 0 45%, #4a4a4a 45% 55%, #1a1d24 55%)",
  },
  satellite: {
    label: "Satellite",
    hint: "Aerial photos",
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
    swatch: "linear-gradient(135deg, #3d5a2a 0 40%, #7a6a4a 40% 60%, #2c4a5a 60%)",
  },
  terrain: {
    label: "Terrain",
    hint: "Hills, contours, and parks",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: `${OSM} &copy; <a href="https://opentopomap.org">OpenTopoMap</a>`,
    maxZoom: 17,
    subdomains: "abc",
    swatch: "linear-gradient(135deg, #e8eccd 0 40%, #c9b98a 40% 60%, #9cc29a 60%)",
  },
};

export const MAP_STYLE_OPTIONS: { id: MapStyle; label: string; hint: string; swatch: string }[] = [
  {
    id: "auto",
    label: "Match theme",
    hint: "Light by day, dark in dark mode",
    swatch: "linear-gradient(135deg, #fafafa 0 50%, #2b2b2b 50%)",
  },
  ...(Object.entries(TILE_STYLES) as [Exclude<MapStyle, "auto">, TileStyle][]).map(([id, style]) => ({
    id,
    label: style.label,
    hint: style.hint,
    swatch: style.swatch,
  })),
];

const STORAGE_KEY = "mynagari-map-style";
const listeners = new Set<() => void>();

function readLocal(): MapStyle {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return MAP_STYLE_OPTIONS.some((option) => option.id === value) ? (value as MapStyle) : "auto";
  } catch {
    return "auto";
  }
}

function writeLocal(style: MapStyle) {
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // Private browsing can block storage; the choice still applies for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMapStyle() {
  const { user, updateProfile } = useAuth();
  const { mode, systemMode } = useColorScheme();
  const local = useSyncExternalStore(subscribe, readLocal, () => "auto" as MapStyle);
  const style: MapStyle = user?.map_style ?? local;
  const dark = (mode === "system" ? systemMode : mode) === "dark";
  const tiles = TILE_STYLES[style === "auto" ? (dark ? "dark" : "voyager") : style];

  const setStyle = useCallback(
    async (next: MapStyle) => {
      writeLocal(next);
      if (user) await updateProfile({ map_style: next });
    },
    [user, updateProfile],
  );

  return { style, tiles, setStyle, saved: Boolean(user) };
}
