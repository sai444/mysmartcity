import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  Chip,
  Divider,
  ListItemIcon,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";

import { useAuth } from "../features/auth/AuthContext";
import { useLoginPath, useRegisterPath } from "../features/auth/paths";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function AccountActions() {
  const { user, ready, logout } = useAuth();
  const navigate = useNavigate();
  const signIn = useLoginPath();
  const register = useRegisterPath();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (!ready) {
    return <Skeleton variant="rounded" width={96} height={36} sx={{ flex: "0 0 auto" }} />;
  }

  if (!user) {
    return (
      <Stack direction="row" spacing={1} sx={{ flex: "0 0 auto", alignItems: "center" }}>
        <Button
          component={RouterLink}
          to={register}
          size="small"
          variant="text"
          color="inherit"
          sx={{ display: { xs: "none", sm: "inline-flex" }, minHeight: 36, px: 1.5 }}
        >
          Create account
        </Button>
        <Button component={RouterLink} to={signIn} size="small" variant="contained" sx={{ minHeight: 36, px: 2 }}>
          Sign in
        </Button>
      </Stack>
    );
  }

  const open = Boolean(anchor);
  const close = () => setAnchor(null);
  const go = (to: string) => {
    close();
    navigate(to);
  };

  return (
    <>
      <ButtonBase
        id="account-menu-button"
        aria-label={`Account menu for ${user.display_name}`}
        aria-controls={open ? "account-menu" : undefined}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{
          flex: "0 0 auto",
          gap: 1,
          pl: 0.5,
          pr: { xs: 0.5, md: 1 },
          py: 0.5,
          borderRadius: 999,
          border: "1px solid",
          borderColor: open ? "primary.main" : "divider",
          transition: "border-color 160ms ease",
          "&:hover": { borderColor: "primary.main" },
        }}
      >
        <Avatar
          sx={{
            width: 30,
            height: 30,
            fontSize: "0.8rem",
            fontWeight: 700,
            bgcolor: "primary.main",
            color: "primary.contrastText",
          }}
        >
          {initials(user.display_name)}
        </Avatar>
        <Typography
          component="span"
          noWrap
          sx={{ display: { xs: "none", md: "block" }, maxWidth: 140, fontWeight: 600, fontSize: "0.9rem" }}
        >
          {user.display_name}
        </Typography>
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            display: { xs: "none", md: "block" },
            color: "text.secondary",
            transition: "transform 160ms ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </ButtonBase>
      <Menu
        id="account-menu"
        anchorEl={anchor}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: { sx: { width: 260, mt: 1, borderRadius: 2 } },
          list: { "aria-labelledby": "account-menu-button", sx: { py: 0.5 } },
        }}
      >
        <Box sx={{ px: 2, pt: 1.5, pb: 1.25 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 700, minWidth: 0 }}>
              {user.display_name}
            </Typography>
            {user.role === "admin" && <Chip label="Admin" size="small" color="secondary" variant="outlined" />}
          </Stack>
          <Typography variant="body2" color="text.secondary" noWrap>
            {user.email}
          </Typography>
        </Box>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem onClick={() => go("/account")}>
          <ListItemIcon>
            <AccountCircleOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Your account
        </MenuItem>
        <MenuItem onClick={() => go("/activity")}>
          <ListItemIcon>
            <HistoryOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Activity
        </MenuItem>
        {user.role === "admin" && (
          <MenuItem onClick={() => go("/admin")}>
            <ListItemIcon>
              <AdminPanelSettingsOutlinedIcon fontSize="small" />
            </ListItemIcon>
            Admin console
          </MenuItem>
        )}
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          onClick={() => {
            close();
            void logout().then(() => navigate("/city"));
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}
