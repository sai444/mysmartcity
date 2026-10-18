import { useEffect, useState } from "react";

import { apiGet, errorMessage } from "../../api/client";
import type { MapsConfig } from "../../api/types";

export type GoogleMapsApi = {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMap;
  Marker: new (opts: Record<string, unknown>) => GoogleMarker;
  LatLng: new (lat: number, lng: number) => unknown;
  LatLngBounds: new () => GoogleBounds;
  Geocoder: new () => GoogleGeocoder;
  DirectionsService: new () => GoogleDirectionsService;
  DirectionsRenderer: new (opts?: Record<string, unknown>) => GoogleDirectionsRenderer;
  SymbolPath: { CIRCLE: unknown };
  TravelMode: { DRIVING: string };
  Animation: { DROP: unknown };
  places: {
    AutocompleteService: new () => GoogleAutocompleteService;
    PlacesService: new (attr: HTMLElement) => GooglePlacesService;
    AutocompleteSessionToken: new () => unknown;
  };
};

export type GoogleMap = {
  addListener: (event: string, handler: (event: { latLng?: { lat: () => number; lng: () => number } | null }) => void) => { remove: () => void };
  panTo: (latLng: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  fitBounds: (bounds: GoogleBounds, padding?: number) => void;
};

export type GoogleMarker = {
  setMap: (map: GoogleMap | null) => void;
};

export type GoogleBounds = {
  extend: (latLng: { lat: number; lng: number }) => void;
};

export type GoogleGeocoder = {
  geocode: (
    request: { location: { lat: number; lng: number } },
    callback: (results: Array<{ formatted_address?: string }> | null, status: string) => void,
  ) => void;
};

export type GoogleDirectionsService = {
  route: (
    request: Record<string, unknown>,
    callback: (
      result: {
        routes: Array<{
          legs: Array<{
            distance?: { value: number };
            duration?: { value: number };
          }>;
        }>;
      } | null,
      status: string,
    ) => void,
  ) => void;
};

export type GoogleDirectionsRenderer = {
  setMap: (map: GoogleMap | null) => void;
  setDirections: (result: unknown) => void;
  set: (key: string, value: unknown) => void;
};

export type PlacePrediction = {
  description: string;
  place_id: string;
};

export type GoogleAutocompleteService = {
  getPlacePredictions: (
    request: Record<string, unknown>,
    callback: (predictions: PlacePrediction[] | null, status: string) => void,
  ) => void;
};

export type GooglePlacesService = {
  getDetails: (
    request: Record<string, unknown>,
    callback: (
      place: {
        name?: string;
        formatted_address?: string;
        geometry?: { location?: { lat: () => number; lng: () => number } };
      } | null,
      status: string,
    ) => void,
  ) => void;
};

type MapsWindow = Window & {
  google?: { maps: GoogleMapsApi };
  gm_authFailure?: () => void;
  __mynagariGoogleMapsReady?: () => void;
};

let loadPromise: Promise<GoogleMapsApi> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  const existing = (window as MapsWindow).google?.maps;
  if (existing?.Map && existing.places) {
    return Promise.resolve(existing);
  }
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const host = window as MapsWindow;
    const previousAuth = host.gm_authFailure;
    host.gm_authFailure = () => {
      loadPromise = null;
      previousAuth?.();
      reject(new Error("Google Maps refused the API key. Enable Maps JavaScript API and Places API."));
    };
    host.__mynagariGoogleMapsReady = () => {
      const maps = host.google?.maps;
      if (!maps?.Map || !maps.places) {
        loadPromise = null;
        reject(new Error("Google Maps loaded without the Places library."));
        return;
      }
      resolve(maps);
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=__mynagariGoogleMapsReady`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Google Maps failed to load."));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function reverseWithGoogle(api: GoogleMapsApi, latitude: number, longitude: number, fallbackLabel: string): Promise<string> {
  return new Promise((resolve) => {
    const geocoder = new api.Geocoder();
    geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
      const label = results?.[0]?.formatted_address?.trim();
      resolve(status === "OK" && label ? label.slice(0, 160) : fallbackLabel);
    });
  });
}

export function useTravelMaps() {
  const [provider, setProvider] = useState<"google" | "osm">("osm");
  const [api, setApi] = useState<GoogleMapsApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    apiGet<MapsConfig>("/api/v1/transit/maps")
      .then(async (config) => {
        const key = (config.browser_key ?? "").trim() || (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "").trim();
        if (!key) {
          if (!active) return;
          setProvider("osm");
          setReady(true);
          return;
        }
        const maps = await loadGoogleMaps(key);
        if (!active) return;
        setApi(maps);
        setProvider("google");
        setReady(true);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(errorMessage(reason));
        setProvider("osm");
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return { provider, api, error, ready };
}
