import { createTheme } from "@mui/material/styles";

const v = (name: string) => `var(--nagari-${name})`;

export const COLORS = {
  page: v("page"),
  inset: v("inset"),
  hover: v("hover"),
  selected: v("selected"),
  appBar: v("app-bar"),
  map: v("map"),
  focus: "#f59e0b",
  gradient: "linear-gradient(120deg, #0f766e 0%, #0e7490 52%, #d97706 100%)",
  glow: v("glow"),
  shadowSm: v("shadow-sm"),
  shadowMd: v("shadow-md"),
  shadowLg: v("shadow-lg"),
} as const;

const LIGHT_VARS = {
  "--nagari-page": "#f4f1ea",
  "--nagari-inset": "#ebe6dc",
  "--nagari-hover": "rgba(15, 118, 110, 0.07)",
  "--nagari-selected": "rgba(15, 118, 110, 0.12)",
  "--nagari-app-bar": "rgba(255, 253, 248, 0.86)",
  "--nagari-map": "#e8e4d8",
  "--nagari-glow": "rgba(15, 118, 110, 0.12)",
  "--nagari-shadow-sm": "0 1px 2px rgba(22, 36, 34, 0.06), 0 2px 6px rgba(22, 36, 34, 0.05)",
  "--nagari-shadow-md": "0 10px 28px rgba(15, 118, 110, 0.14)",
  "--nagari-shadow-lg": "0 20px 48px rgba(22, 36, 34, 0.16)",
};

const DARK_VARS = {
  "--nagari-page": "#0b1413",
  "--nagari-inset": "#1a2c29",
  "--nagari-hover": "rgba(94, 234, 212, 0.08)",
  "--nagari-selected": "rgba(94, 234, 212, 0.16)",
  "--nagari-app-bar": "rgba(11, 20, 19, 0.82)",
  "--nagari-map": "#1a2c29",
  "--nagari-glow": "rgba(45, 212, 191, 0.16)",
  "--nagari-shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.4)",
  "--nagari-shadow-md": "0 10px 28px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(94, 234, 212, 0.16)",
  "--nagari-shadow-lg": "0 20px 48px rgba(0, 0, 0, 0.55)",
};

const focusRing = { outline: `3px solid ${COLORS.focus}`, outlineOffset: "2px" };
const headingFont = '"Outfit", "Segoe UI", sans-serif';

export const appTheme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#0f766e", dark: "#0b5c56", light: "#14b8a6", contrastText: "#ffffff" },
        secondary: { main: "#b45309", contrastText: "#ffffff" },
        success: { main: "#15803d" },
        warning: { main: "#c2410c" },
        error: { main: "#be123c" },
        info: { main: "#0369a1" },
        background: { default: "#f4f1ea", paper: "#fffdf8" },
        text: { primary: "#162422", secondary: "#4a5c59" },
        divider: "#ddd6c8",
      },
    },
    dark: {
      palette: {
        primary: { main: "#5eead4", dark: "#2dd4bf", light: "#99f6e4", contrastText: "#0b1413" },
        secondary: { main: "#fbbf24", contrastText: "#3f2a0a" },
        success: { main: "#4ade80" },
        warning: { main: "#fdba74" },
        error: { main: "#fb7185" },
        info: { main: "#7dd3fc" },
        background: { default: "#0b1413", paper: "#13201e" },
        text: { primary: "#e7f0ee", secondary: "#9db5b1" },
        divider: "#2a3f3c",
      },
    },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Source Sans 3", "Segoe UI", system-ui, sans-serif',
    fontSize: 16,
    h1: {
      fontFamily: headingFont,
      fontSize: "clamp(1.65rem, 2vw + 1.1rem, 2.25rem)",
      fontWeight: 700,
      letterSpacing: "-0.02em",
      lineHeight: 1.2,
    },
    h2: {
      fontFamily: headingFont,
      fontSize: "clamp(1.15rem, 0.6vw + 1rem, 1.3rem)",
      fontWeight: 700,
      lineHeight: 1.3,
    },
    h3: { fontFamily: headingFont, fontSize: "1.1rem", fontWeight: 700, lineHeight: 1.35 },
    body1: { fontSize: "1.0625rem", lineHeight: 1.6 },
    body2: { fontSize: "0.975rem", lineHeight: 1.55 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (theme) => ({
        ":root": LIGHT_VARS,
        ".dark": DARK_VARS,
        html: { WebkitTextSizeAdjust: "100%" },
        body: {
          overflowX: "clip",
          minHeight: "100dvh",
          backgroundColor: COLORS.page,
          backgroundImage: `radial-gradient(900px 480px at 100% -10%, ${COLORS.glow}, transparent 70%), radial-gradient(700px 420px at -10% 110%, ${COLORS.glow}, transparent 70%)`,
          backgroundAttachment: "fixed",
          textRendering: "optimizeLegibility",
          WebkitFontSmoothing: "antialiased",
          WebkitTapHighlightColor: "transparent",
        },
        "#root": { minHeight: "100dvh" },
        "h1, h2, h3, h4, h5, h6, p": { overflowWrap: "break-word" },
        "img, video": { maxWidth: "100%" },
        a: { color: theme.vars.palette.primary.main, textUnderlineOffset: "0.2em" },
        "a:focus-visible, button:focus-visible": focusRing,
        "::selection": { backgroundColor: "rgba(15, 118, 110, 0.28)" },
        "*": { scrollbarWidth: "thin", scrollbarColor: `${theme.vars.palette.divider} transparent` },
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            transitionDuration: "0.01ms !important",
            scrollBehavior: "auto !important",
          },
        },
      }),
    },
    MuiButtonBase: {
      styleOverrides: { root: { "&.Mui-focusVisible": focusRing } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 10,
          fontWeight: 600,
          minHeight: 42,
          paddingInline: 18,
          transition: "filter 160ms ease, box-shadow 160ms ease, transform 160ms ease, background-color 160ms ease",
          "&.MuiButton-outlined:not(.Mui-disabled)": {
            borderColor: theme.vars.palette.divider,
            "&:hover": { borderColor: theme.vars.palette.primary.main, backgroundColor: COLORS.hover },
          },
        }),
        containedPrimary: {
          color: "#ffffff",
          backgroundImage: COLORS.gradient,
          "&:hover": {
            backgroundImage: COLORS.gradient,
            filter: "brightness(1.08)",
            boxShadow: "0 8px 22px rgba(15, 118, 110, 0.35)",
          },
          "&:active": { transform: "translateY(1px)" },
          "&.Mui-disabled": { backgroundImage: "none" },
        },
        sizeSmall: { minHeight: 34, paddingInline: 12 },
        sizeLarge: { minHeight: 50, fontSize: "1.05rem" },
      },
    },
    MuiIconButton: {
      styleOverrides: { root: { minWidth: 42, minHeight: 42 } },
    },
    MuiToggleButton: {
      styleOverrides: { root: { textTransform: "none", fontWeight: 600 } },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600 } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.vars.palette.background.paper,
          "&:hover:not(.Mui-focused):not(.Mui-error) .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.vars.palette.primary.main,
          },
        }),
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: "none" } },
    },
    MuiPopover: {
      styleOverrides: {
        paper: ({ theme }) => ({
          marginTop: 4,
          border: `1px solid ${theme.vars.palette.divider}`,
          boxShadow: COLORS.shadowMd,
        }),
      },
    },
    MuiMenuItem: {
      styleOverrides: { root: { minHeight: 44, "&.Mui-focusVisible": { outlineOffset: "-3px" } } },
    },
    MuiListItemButton: {
      styleOverrides: { root: { minHeight: 44 } },
    },
    MuiDrawer: {
      styleOverrides: { paper: { backgroundImage: "none" } },
    },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme }) => ({ border: `1px solid ${theme.vars.palette.divider}`, boxShadow: COLORS.shadowLg }),
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: ({ theme }) => ({
          alignItems: "center",
          border: `1px solid ${theme.vars.palette.divider}`,
          overflowWrap: "anywhere",
        }),
      },
    },
    MuiTab: {
      styleOverrides: { root: { textTransform: "none", fontWeight: 600, minHeight: 48 } },
    },
    MuiTabs: {
      styleOverrides: { indicator: { height: 3, borderRadius: 3, backgroundImage: COLORS.gradient } },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: { "&.Mui-checked + .MuiSwitch-track": { backgroundImage: COLORS.gradient, opacity: 1 } },
      },
    },
    MuiLink: {
      defaultProps: { underline: "hover" },
      styleOverrides: { root: ({ theme }) => ({ color: theme.vars.palette.primary.main, fontWeight: 600 }) },
    },
  },
});
