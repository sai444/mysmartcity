import { Box } from "@mui/material";
import { useEffect, useRef } from "react";

import type { TripPoint } from "../../api/types";
import { COLORS } from "../../theme/themes";
import type { GoogleDirectionsRenderer, GoogleMap, GoogleMapsApi, GoogleMarker } from "./googleMaps";

export type RoadRoute = {
  distanceKm: number;
  minutes: number;
};

type GoogleTravelMapProps = {
  api: GoogleMapsApi;
  center: { latitude: number; longitude: number };
  zoom: number;
  origin: TripPoint | null;
  destination: TripPoint | null;
  onPick: (latitude: number, longitude: number) => void;
  onRoute: (route: RoadRoute | null) => void;
  height?: number | string | { xs?: number | string; sm?: number | string; md?: number | string };
};

export function GoogleTravelMap({
  api,
  center,
  zoom,
  origin,
  destination,
  onPick,
  onRoute,
  height = 440,
}: GoogleTravelMapProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const originMarker = useRef<GoogleMarker | null>(null);
  const destMarker = useRef<GoogleMarker | null>(null);
  const rendererRef = useRef<GoogleDirectionsRenderer | null>(null);
  const start = useRef({ center, zoom });
  const onPickRef = useRef(onPick);
  const onRouteRef = useRef(onRoute);
  onPickRef.current = onPick;
  onRouteRef.current = onRoute;

  useEffect(() => {
    if (!host.current || mapRef.current) return;
    const map = new api.Map(host.current, {
      center: { lat: start.current.center.latitude, lng: start.current.center.longitude },
      zoom: start.current.zoom,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      clickableIcons: false,
      gestureHandling: "greedy",
      backgroundColor: COLORS.map,
    });
    mapRef.current = map;
    rendererRef.current = new api.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#0f766e", strokeWeight: 5, strokeOpacity: 0.9 },
    });
    const click = map.addListener("click", (event) => {
      const latLng = event.latLng;
      if (!latLng) return;
      onPickRef.current(latLng.lat(), latLng.lng());
    });
    return () => {
      click.remove();
      rendererRef.current?.setMap(null);
      originMarker.current?.setMap(null);
      destMarker.current?.setMap(null);
      mapRef.current = null;
      rendererRef.current = null;
    };
  }, [api]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    originMarker.current?.setMap(null);
    destMarker.current?.setMap(null);
    originMarker.current = origin ? placeMarker(api, map, origin, "#0f766e", "A") : null;
    destMarker.current = destination ? placeMarker(api, map, destination, "#b45309", "B") : null;
    if (origin && destination) {
      const bounds = new api.LatLngBounds();
      bounds.extend({ lat: origin.latitude, lng: origin.longitude });
      bounds.extend({ lat: destination.latitude, lng: destination.longitude });
      map.fitBounds(bounds, 72);
    } else if (origin) {
      map.panTo({ lat: origin.latitude, lng: origin.longitude });
      map.setZoom(Math.max(zoom, 15));
    } else if (destination) {
      map.panTo({ lat: destination.latitude, lng: destination.longitude });
      map.setZoom(Math.max(zoom, 15));
    }
  }, [api, origin, destination, zoom]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!origin || !destination) {
      renderer?.set("directions", null);
      onRouteRef.current(null);
      return;
    }
    renderer?.set("directions", null);
    onRouteRef.current(null);
    let active = true;
    const directions = new api.DirectionsService();
    directions.route(
      {
        origin: { lat: origin.latitude, lng: origin.longitude },
        destination: { lat: destination.latitude, lng: destination.longitude },
        travelMode: api.TravelMode.DRIVING,
        region: "IN",
      },
      (result, status) => {
        if (!active) return;
        const leg = result?.routes?.[0]?.legs?.[0];
        const meters = leg?.distance?.value ?? 0;
        if (status === "OK" && result && meters >= 50) {
          renderer?.setDirections(result);
          onRouteRef.current({
            distanceKm: meters / 1000,
            minutes: Math.max(1, Math.round((leg?.duration?.value ?? 60) / 60)),
          });
          return;
        }
        renderer?.set("directions", null);
        onRouteRef.current(null);
      },
    );
    return () => {
      active = false;
    };
  }, [api, origin, destination]);

  return (
    <Box
      sx={{
        position: "relative",
        height,
        borderRadius: 2,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box ref={host} sx={{ height: "100%", width: "100%" }} />
    </Box>
  );
}

function placeMarker(api: GoogleMapsApi, map: GoogleMap, point: TripPoint, color: string, label: string): GoogleMarker {
  return new api.Marker({
    map,
    position: { lat: point.latitude, lng: point.longitude },
    title: point.label,
    label: { text: label, color: "#ffffff", fontWeight: "700" },
    animation: api.Animation.DROP,
    icon: {
      path: api.SymbolPath.CIRCLE,
      scale: 12,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2,
    },
  });
}
