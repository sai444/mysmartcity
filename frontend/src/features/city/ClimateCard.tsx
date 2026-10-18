import { Box, Typography } from "@mui/material";

import type { Climate } from "../../api/types";
import { gradientTextSx, surfaceSx } from "../../theme/surfaces";
import { COLORS } from "../../theme/themes";
import { ForecastStrip } from "./LiveWeather";
import { AQI_COLOR, AQI_LABEL, CONDITION_LABEL } from "./labels";

export function ClimateCard({ climate, wardName }: { climate: Climate | null; wardName: string }) {
  if (!climate) {
    return (
      <Box sx={[surfaceSx, { p: { xs: 2, sm: 3 } }]}>
        <Typography variant="h2">{wardName}</Typography>
        <Typography>Climate is not available for this ward yet.</Typography>
      </Box>
    );
  }

  const color = AQI_COLOR[climate.aqi_category] ?? "warning.main";
  const recorded = new Date(climate.recorded_at).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const live = climate.source === "live";

  return (
    <Box
      sx={[
        surfaceSx,
        {
          p: { xs: 2, sm: 3 },
          position: "relative",
          overflow: "hidden",
          backgroundImage: `radial-gradient(420px 260px at 100% 0%, ${COLORS.glow}, transparent 70%)`,
        },
      ]}
    >
      <Typography
        color="text.secondary"
        sx={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "0.75rem", fontWeight: 700 }}
      >
        {live ? "Live weather" : "Ward climate"} · {wardName}
      </Typography>
      <Typography
        component="p"
        sx={{
          fontFamily: '"Outfit", sans-serif',
          fontSize: { xs: "3.4rem", sm: "4.25rem" },
          fontWeight: 700,
          lineHeight: 0.95,
          my: 1,
          ...gradientTextSx,
        }}
      >
        {climate.temperature_c.toFixed(1)}°C
      </Typography>
      <Typography variant="h2">{CONDITION_LABEL[climate.condition] ?? climate.condition}</Typography>
      <Typography sx={{ mt: 1 }}>
        Humidity {climate.humidity_pct}%
        {climate.feels_like_c != null ? ` · Feels like ${climate.feels_like_c.toFixed(0)}°C` : ""}
        {climate.wind_kmh != null ? ` · Wind ${Math.round(climate.wind_kmh)} km/h` : ""}
      </Typography>
      {climate.rain_chance_pct != null && (
        <Typography>Rain chance today {climate.rain_chance_pct}%</Typography>
      )}
      <Typography>
        Air quality {climate.aqi} ·{" "}
        <Box component="span" sx={{ color, fontWeight: 700 }}>
          {AQI_LABEL[climate.aqi_category] ?? climate.aqi_category}
        </Box>
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {live ? "Open-Meteo" : "City desk"} · Updated {recorded}
      </Typography>
      <ForecastStrip days={climate.forecast ?? []} />
    </Box>
  );
}
