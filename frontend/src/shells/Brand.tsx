import { Box, Typography } from "@mui/material";
import { useId } from "react";
import { Link as RouterLink } from "react-router-dom";

import { gradientTextSx } from "../theme/surfaces";

export function BrandMark({ size = 32 }: { size?: number }) {
  const fillId = useId();
  return (
    <Box component="svg" viewBox="0 0 32 32" width={size} height={size} aria-hidden sx={{ flex: "0 0 auto", display: "block" }}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0f766e" />
          <stop offset="0.55" stopColor="#0e7490" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${fillId})`} />
      <g fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 23v-8l4-2.5V23" />
        <path d="M14 23V9.5l5-2.5v16" />
        <path d="M21 23v-9l3.5 1.75V23" />
        <path d="M6 23h20" />
      </g>
    </Box>
  );
}

export function Brand({ tagline = false }: { tagline?: boolean }) {
  return (
    <Box
      component={RouterLink}
      to="/city"
      aria-label="MyNagari home"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1.25,
        minWidth: 0,
        color: "text.primary",
        textDecoration: "none",
        borderRadius: 1.5,
        py: 0.5,
        pr: 0.5,
      }}
    >
      <BrandMark />
      <Box sx={{ minWidth: 0, lineHeight: 1 }}>
        <Typography
          component="span"
          noWrap
          sx={{
            ...gradientTextSx,
            display: "block",
            fontFamily: '"Outfit", sans-serif',
            fontWeight: 700,
            lineHeight: 1.1,
            fontSize: { xs: "1.1rem", sm: "1.2rem" },
            letterSpacing: "-0.01em",
          }}
        >
          MyNagari
        </Typography>
        {tagline && (
          <Typography component="span" noWrap variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
            Your city, in one place
          </Typography>
        )}
      </Box>
    </Box>
  );
}
