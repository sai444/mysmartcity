import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

import { kickerSx, surfaceSx } from "../../theme/surfaces";

export function PageIntro({ kicker, title, lede }: { kicker?: string; title: string; lede: string }) {
  return (
    <Stack spacing={0.5}>
      {kicker && <Typography sx={kickerSx}>{kicker}</Typography>}
      <Typography variant="h1">{title}</Typography>
      <Typography color="text.secondary">{lede}</Typography>
    </Stack>
  );
}

export function Surface({ children }: { children: ReactNode }) {
  return <Box sx={surfaceSx}>{children}</Box>;
}

export function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
