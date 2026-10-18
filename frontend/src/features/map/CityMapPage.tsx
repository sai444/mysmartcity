import { Alert, Box, CircularProgress, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";

import { apiGet } from "../../api/client";
import type { CityMap, PropertyType } from "../../api/types";
import { insetSurfaceSx } from "../../theme/surfaces";
import { LiveWeather } from "../city/LiveWeather";
import { KIND_LABEL, PLACE_KIND, SHOP_CATEGORY } from "../city/labels";
import { PROPERTY_TYPE } from "../property/labels";
import { useWard } from "../city/WardContext";
import { PlaceMap, type MapPin } from "./PlaceMap";

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "facility", label: "Facilities" },
  { id: "parking", label: "Parking" },
  { id: "business", label: "Shops" },
  { id: "property", label: "Property" },
];

const PIN_COLOR: Record<string, string> = {
  facility: "#0e7490",
  parking: "#b45309",
  business: "#0f766e",
  property: "#9a3412",
};

export default function CityMapPage() {
  const { wards, wardId, setWardId } = useWard();
  const [scope, setScope] = useState(wardId);
  const [filter, setFilter] = useState("all");
  const [map, setMap] = useState<CityMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [weatherPoint, setWeatherPoint] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    setScope(wardId);
  }, [wardId]);

  useEffect(() => {
    const path = scope ? `/api/v1/city/map?ward_id=${encodeURIComponent(scope)}` : "/api/v1/city/map";
    let active = true;
    setMap(null);
    setError(null);
    setSelectedId(null);
    setWeatherPoint(null);
    apiGet<CityMap>(path)
      .then((payload) => {
        if (active) setMap(payload);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, [scope]);

  const pins = useMemo(() => {
    const places = (map?.places ?? []).filter((place) => filter === "all" || place.kind === filter);
    return places.map(toPin);
  }, [map, filter]);

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h1">City map</Typography>
        <Typography color="text.secondary">
          Facilities, parking, shops, and properties sit on OpenStreetMap. Click the map or a pin to load live weather for that point.
        </Typography>
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ "& .MuiFormControl-root": { width: { xs: "100%", sm: "auto" } } }}>
        <TextField
          select
          label="Ward"
          value={scope}
          onChange={(event) => {
            const next = event.target.value;
            setScope(next);
            if (next) setWardId(next);
          }}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">All wards</MenuItem>
          {wards.map((ward) => (
            <MenuItem key={ward.id} value={ward.id}>
              {ward.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Show" value={filter} onChange={(event) => setFilter(event.target.value)} sx={{ minWidth: 180 }}>
          {FILTERS.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {!map && !error && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress aria-label="Loading map" />
        </Box>
      )}

      {map && (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.6fr) minmax(240px, 0.8fr)" },
            alignItems: "start",
          }}
        >
          <PlaceMap
            center={map.center}
            zoom={map.zoom}
            pins={pins}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              const pin = pins.find((item) => item.id === id);
              if (pin) setWeatherPoint({ latitude: pin.latitude, longitude: pin.longitude });
            }}
            onPick={(latitude, longitude) => {
              setSelectedId(null);
              setWeatherPoint({ latitude, longitude });
            }}
            height={{ xs: 280, sm: 380, md: 480 }}
          />
          <Stack spacing={1.5}>
            <LiveWeather
              latitude={(weatherPoint ?? map.center).latitude}
              longitude={(weatherPoint ?? map.center).longitude}
            />
          <Stack spacing={1} component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
            {pins.length === 0 && <Typography>Nothing in this view yet.</Typography>}
            {pins.map((pin) => (
              <Box
                component="li"
                key={pin.id}
                sx={[insetSurfaceSx, selectedId === pin.id && { borderColor: "primary.main" }]}
              >
                <Box
                  component="button"
                  type="button"
                  onClick={() => {
                    setSelectedId(pin.id);
                    setWeatherPoint({ latitude: pin.latitude, longitude: pin.longitude });
                  }}
                  sx={{
                    all: "unset",
                    cursor: "pointer",
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  <Typography sx={{ fontWeight: 700 }}>{pin.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {pin.label}
                    {pin.detail ? ` · ${pin.detail}` : ""}
                  </Typography>
                </Box>
                {pin.href && (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    <RouterLink to={pin.href}>Open profile</RouterLink>
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
          </Stack>
        </Box>
      )}
    </Stack>
  );
}

function toPin(place: CityMap["places"][number]): MapPin {
  const subtype =
    KIND_LABEL[place.subtype] ??
    SHOP_CATEGORY[place.subtype] ??
    PROPERTY_TYPE[place.subtype as PropertyType] ??
    PLACE_KIND[place.kind] ??
    place.subtype;
  return {
    id: place.id,
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    color: PIN_COLOR[place.kind] ?? "#0f766e",
    label: subtype,
    detail: place.detail,
    href: place.href,
  };
}
