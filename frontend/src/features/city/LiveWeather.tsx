import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import ThunderstormOutlinedIcon from "@mui/icons-material/ThunderstormOutlined";
import UmbrellaOutlinedIcon from "@mui/icons-material/UmbrellaOutlined";
import WbSunnyOutlinedIcon from "@mui/icons-material/WbSunnyOutlined";
import WhatshotOutlinedIcon from "@mui/icons-material/WhatshotOutlined";
import { Alert, Box, CircularProgress, Stack, Typography } from "@mui/material";
import { useEffect, useState, type ReactNode } from "react";

import { apiGet } from "../../api/client";
import type { Climate, ForecastDay } from "../../api/types";
import { insetSurfaceSx, surfaceSx } from "../../theme/surfaces";
import { AQI_COLOR, AQI_LABEL, CONDITION_LABEL } from "./labels";

function weekday(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
}

function SkyIcon({ condition }: { condition: string }) {
  const sx = { fontSize: 22, color: "primary.main" };
  if (condition === "storm") return <ThunderstormOutlinedIcon sx={sx} />;
  if (condition === "rain") return <UmbrellaOutlinedIcon sx={sx} />;
  if (condition === "heat") return <WhatshotOutlinedIcon sx={sx} />;
  if (condition === "cloudy") return <CloudOutlinedIcon sx={sx} />;
  return <WbSunnyOutlinedIcon sx={sx} />;
}

export function ForecastStrip({ days }: { days: ForecastDay[] }) {
  if (!days.length) return null;
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(days.length, 7)}, minmax(0, 1fr))`,
        gap: 0.75,
        mt: 2,
      }}
    >
      {days.map((day) => (
        <Box key={day.date} sx={[insetSurfaceSx, { p: 1, textAlign: "center", minWidth: 0 }]}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {weekday(day.date)}
          </Typography>
          <SkyIcon condition={day.condition} />
          <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>
            {Math.round(day.temperature_max_c)}°
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {Math.round(day.temperature_min_c)}°
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export function useWeather(latitude: number | null | undefined, longitude: number | null | undefined) {
  const [climate, setClimate] = useState<Climate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (latitude == null || longitude == null || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      setClimate(null);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      apiGet<Climate>(
        `/api/v1/city/weather?latitude=${encodeURIComponent(latitude.toFixed(5))}&longitude=${encodeURIComponent(longitude.toFixed(5))}`,
      )
        .then((payload) => {
          if (!active) return;
          setClimate(payload);
          setError(null);
        })
        .catch((reason: Error) => {
          if (!active) return;
          setClimate(null);
          setError(reason.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [latitude, longitude]);

  return { climate, loading, error };
}

export function LiveWeather({
  latitude,
  longitude,
  compact = false,
}: {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  compact?: boolean;
}) {
  const { climate, loading, error } = useWeather(latitude, longitude);
  if (latitude == null || longitude == null) return null;

  let body: ReactNode;
  if (loading && !climate) {
    body = (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={22} aria-label="Loading weather" />
      </Box>
    );
  } else if (error && !climate) {
    body = <Alert severity="info">Live weather is unavailable for this point right now.</Alert>;
  } else if (!climate) {
    body = <Typography color="text.secondary">Pick a point to load live weather.</Typography>;
  } else {
    const color = AQI_COLOR[climate.aqi_category] ?? "warning.main";
    body = (
      <>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <SkyIcon condition={climate.condition} />
          <Typography sx={{ fontWeight: 800, fontSize: compact ? "1.6rem" : "2rem", lineHeight: 1 }}>
            {climate.temperature_c.toFixed(1)}°C
          </Typography>
          <Typography color="text.secondary">{CONDITION_LABEL[climate.condition] ?? climate.condition}</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          Humidity {climate.humidity_pct}%
          {climate.feels_like_c != null ? ` · Feels ${climate.feels_like_c.toFixed(0)}°` : ""}
          {climate.wind_kmh != null ? ` · Wind ${Math.round(climate.wind_kmh)} km/h` : ""}
          {climate.rain_chance_pct != null ? ` · Rain ${climate.rain_chance_pct}%` : ""}
        </Typography>
        <Typography variant="body2">
          Air quality {climate.aqi} ·{" "}
          <Box component="span" sx={{ color, fontWeight: 700 }}>
            {AQI_LABEL[climate.aqi_category] ?? climate.aqi_category}
          </Box>
        </Typography>
        <ForecastStrip days={climate.forecast ?? []} />
      </>
    );
  }

  return (
    <Box sx={surfaceSx}>
      <Typography
        color="text.secondary"
        sx={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "0.72rem", fontWeight: 700, mb: 1 }}
      >
        Live weather
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {latitude.toFixed(4)}, {longitude.toFixed(4)}
      </Typography>
      {body}
    </Box>
  );
}
