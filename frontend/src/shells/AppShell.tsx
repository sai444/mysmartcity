import MenuIcon from "@mui/icons-material/Menu";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import { AppBar, Box, Button, Drawer, IconButton, Toolbar, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";

import { useFeatures } from "../features/admin/FeatureContext";
import { COLORS } from "../theme/themes";
import { AccountActions } from "./AccountActions";
import { AppFooter } from "./AppFooter";
import { Brand } from "./Brand";
import { DrawerHeader, MAIN_CONTENT_ID, NavList, SkipLink, usePageTitle } from "./ShellParts";
import { ThemeToggle } from "./ThemeToggle";

const DRAWER_WIDTH = 256;
const HEADER_HEIGHT = 64;
const CONTENT_WIDTH = 1360;

function SidebarCallout({ hideWhenShort = false }: { hideWhenShort?: boolean }) {
  const { isEnabled } = useFeatures();
  if (!isEnabled("reports")) return null;
  return (
    <Box
      sx={{
        ...(hideWhenShort && { "@media (max-height: 760px)": { display: "none" } }),
        m: 1.5,
        p: 2,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: COLORS.inset,
        backgroundImage: `radial-gradient(240px 120px at 100% 0%, ${COLORS.glow}, transparent 70%)`,
      }}
    >
      <ReportProblemOutlinedIcon fontSize="small" sx={{ color: "warning.main" }} />
      <Typography sx={{ mt: 0.75, fontWeight: 700, fontSize: "0.95rem" }}>Spotted a problem?</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, mb: 1.5 }}>
        Potholes, streetlights, garbage — tell your ward office.
      </Typography>
      <Button component={RouterLink} to="/city/reports/new" size="small" variant="contained" fullWidth>
        Report an issue
      </Button>
    </Box>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  usePageTitle();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Box sx={{ display: "flex", minHeight: "100dvh", bgcolor: "background.default" }}>
      <SkipLink />
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          color: "text.primary",
          bgcolor: COLORS.appBar,
          backdropFilter: "saturate(180%) blur(12px)",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Toolbar sx={{ gap: 1.5, px: { xs: 1.5, sm: 2.5 }, minHeight: { xs: HEADER_HEIGHT } }}>
          <IconButton
            color="inherit"
            aria-label="Open menu"
            aria-controls="mobile-nav"
            aria-expanded={open}
            edge="start"
            onClick={() => setOpen(true)}
            sx={{ display: { md: "none" } }}
          >
            <MenuIcon />
          </IconButton>
          <Brand />
          <Box sx={{ flex: 1 }} />
          <ThemeToggle />
          <AccountActions />
        </Toolbar>
      </AppBar>

      <Drawer
        id="mobile-nav"
        variant="temporary"
        open={open}
        onClose={() => setOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { md: "none" },
          "& .MuiDrawer-paper": {
            width: `min(${DRAWER_WIDTH + 32}px, 86vw)`,
            bgcolor: "background.paper",
            borderRight: "1px solid",
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <DrawerHeader onClose={() => setOpen(false)} />
        <Box sx={{ flex: 1, overflowY: "auto" }}>
          <NavList />
          <SidebarCallout />
        </Box>
      </Drawer>

      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: "none", md: "block" },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            top: HEADER_HEIGHT,
            height: `calc(100% - ${HEADER_HEIGHT}px)`,
            bgcolor: "background.paper",
            borderRight: "1px solid",
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <Box sx={{ flex: 1, overflowY: "auto" }}>
          <NavList />
        </Box>
        <SidebarCallout hideWhenShort />
      </Drawer>

      <Box sx={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", pt: `${HEADER_HEIGHT}px` }}>
        <Box
          component="main"
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          sx={{ flex: 1, minWidth: 0, p: { xs: 2, sm: 2.5, md: 3 }, "&:focus": { outline: "none" } }}
        >
          <Box sx={{ width: `min(${CONTENT_WIDTH}px, 100%)`, mx: "auto", minWidth: 0 }}>
            <Outlet />
          </Box>
        </Box>
        <AppFooter maxWidth={CONTENT_WIDTH} />
      </Box>
    </Box>
  );
}
