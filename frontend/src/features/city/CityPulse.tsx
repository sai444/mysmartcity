import { Box, Typography } from "@mui/material";

import type { CitySystem } from "../../api/types";
import { surfaceSx } from "../../theme/surfaces";

const STATE_LABEL: Record<string, string> = {
  steady: "Steady",
  watch: "Watch",
  busy: "Busy",
  halted: "Halted",
};

const STATE_COLOR: Record<string, string> = {
  steady: "success.main",
  watch: "warning.main",
  busy: "info.main",
  halted: "error.main",
};

export function CityPulse({ systems }: { systems: CitySystem[] }) {
  return (
    <Box
      component="section"
      aria-label="City pulse"
      sx={{
        display: "grid",
        gap: 1.25,
        gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, minmax(0, 1fr))" },
      }}
    >
      {systems.map((system) => {
        const color = STATE_COLOR[system.state] ?? "text.secondary";
        return (
          <Box key={system.key} sx={[surfaceSx, { p: 1.5, borderTop: "3px solid", borderTopColor: color }]}>
            <Typography variant="body2" sx={{ letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.75rem" }}>
              {system.label}
            </Typography>
            <Typography sx={{ fontWeight: 700, mt: 0.5, color }}>{STATE_LABEL[system.state] ?? system.state}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
              {system.detail}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
