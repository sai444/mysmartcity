import BrightnessAutoOutlinedIcon from "@mui/icons-material/BrightnessAutoOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import { useEffect, useState } from "react";

const MODES = [
  { id: "light", label: "Light", hint: "Warm and calm", Icon: LightModeOutlinedIcon },
  { id: "dark", label: "Dark", hint: "Easy on the eyes at night", Icon: DarkModeOutlinedIcon },
  { id: "system", label: "Match my device", hint: "Follows your phone or PC", Icon: BrightnessAutoOutlinedIcon },
] as const;

export function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = MODES.find((item) => item.id === mode) ?? MODES[2];
  const shown = mode === "system" ? systemMode : mode;

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", shown === "dark" ? "#0b1413" : "#0f766e");
  }, [shown]);

  return (
    <>
      <Tooltip title={`Theme: ${current.label}`}>
        <IconButton
          color="inherit"
          aria-label="Change theme"
          aria-haspopup="menu"
          aria-expanded={Boolean(anchor)}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <current.Icon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {MODES.map((item) => (
          <MenuItem
            key={item.id}
            selected={item.id === current.id}
            onClick={() => {
              setMode(item.id);
              setAnchor(null);
            }}
          >
            <ListItemIcon>
              <item.Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={item.label} secondary={item.hint} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
