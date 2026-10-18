import { COLORS } from "./themes";

export const surfaceSx = {
  p: { xs: 1.75, sm: 2 },
  minWidth: 0,
  borderRadius: 2,
  border: "1px solid",
  borderColor: "divider",
  color: "text.primary",
  bgcolor: "background.paper",
  boxShadow: COLORS.shadowSm,
} as const;

export const insetSurfaceSx = {
  ...surfaceSx,
  p: 1.5,
  bgcolor: COLORS.inset,
  boxShadow: "none",
} as const;

export const linkSurfaceSx = {
  ...surfaceSx,
  display: "block",
  textDecoration: "none",
  transition: "border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
  "&:hover": {
    borderColor: "primary.main",
    boxShadow: COLORS.shadowMd,
    transform: "translateY(-1px)",
  },
  "&:focus-visible": { outline: `3px solid ${COLORS.focus}`, outlineOffset: 2 },
} as const;

export const gradientTextSx = {
  width: "fit-content",
  backgroundImage: COLORS.gradient,
  backgroundClip: "text",
  WebkitBackgroundClip: "text",
  color: "transparent",
  ".dark &": { backgroundImage: "linear-gradient(120deg, #5eead4 0%, #99f6e4 50%, #fcd34d 100%)" },
} as const;

export const kickerSx = {
  ...gradientTextSx,
  fontWeight: 700,
  fontSize: "0.75rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
} as const;
