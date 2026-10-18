import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Chip,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  type Theme,
} from "@mui/material";
import { useEffect } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";

import { useFeatures } from "../features/admin/FeatureContext";
import { useAuth } from "../features/auth/AuthContext";
import { COLORS } from "../theme/themes";
import { Brand } from "./Brand";
import { activeNavItem, isNavActive, NAV_GROUPS } from "./nav";

export const MAIN_CONTENT_ID = "main-content";

export function SkipLink() {
  return (
    <Box
      component="a"
      href={`#${MAIN_CONTENT_ID}`}
      sx={{
        position: "fixed",
        top: 8,
        left: 8,
        zIndex: (theme: Theme) => theme.zIndex.tooltip + 1,
        px: 2,
        py: 1,
        borderRadius: 1,
        bgcolor: "primary.main",
        color: "primary.contrastText",
        fontWeight: 700,
        textDecoration: "none",
        transform: "translateY(-160%)",
        "&:focus": { transform: "none" },
      }}
    >
      Skip to content
    </Box>
  );
}

export function usePageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const item = activeNavItem(pathname);
    document.title = item ? `${item.label} · MyNagari` : "MyNagari";
  }, [pathname]);
}

export function DrawerHeader({ onClose }: { onClose: () => void }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        px: 2,
        minHeight: 64,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Brand />
      <IconButton aria-label="Close menu" onClick={onClose} edge="end">
        <CloseIcon />
      </IconButton>
    </Box>
  );
}

export function NavList({ showIcons = true }: { showIcons?: boolean }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { isEnabled } = useFeatures();
  const admin = user?.role === "admin";
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => (!item.adminOnly || admin) && (admin || !item.feature || isEnabled(item.feature)),
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <Box component="nav" aria-label="Main">
      {groups.map((group) => (
        <List
          key={group.label}
          dense
          disablePadding
          sx={{ px: 1, pb: 1 }}
          subheader={
            <ListSubheader
              disableSticky
              sx={{
                bgcolor: "transparent",
                lineHeight: 1,
                pt: 2,
                pb: 1,
                px: 1.5,
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "text.secondary",
              }}
            >
              {group.label}
            </ListSubheader>
          }
        >
          {group.items.map((item) => {
            const Icon = item.icon;
            const selected = isNavActive(pathname, item.to);
            return (
              <ListItemButton
                key={item.to}
                component={RouterLink}
                to={item.to}
                selected={selected}
                aria-current={selected ? "page" : undefined}
                sx={{
                  position: "relative",
                  borderRadius: 1.5,
                  mb: 0.25,
                  color: selected ? "primary.main" : "text.primary",
                  "&:hover": { bgcolor: COLORS.hover },
                  "&.Mui-selected, &.Mui-selected:hover": { bgcolor: COLORS.selected },
                  "&.Mui-selected::before": {
                    content: '""',
                    position: "absolute",
                    left: 0,
                    top: 8,
                    bottom: 8,
                    width: 3,
                    borderRadius: 3,
                    bgcolor: "primary.main",
                  },
                }}
              >
                {showIcons && (
                  <ListItemIcon sx={{ minWidth: 38, color: "inherit" }}>
                    <Icon fontSize="small" />
                  </ListItemIcon>
                )}
                <ListItemText
                  primary={item.label}
                  slotProps={{ primary: { sx: { fontWeight: selected ? 700 : 500 } } }}
                />
                {item.feature && !isEnabled(item.feature) && (
                  <Chip label="Off" size="small" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
                )}
              </ListItemButton>
            );
          })}
        </List>
      ))}
    </Box>
  );
}
