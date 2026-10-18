import CheckIcon from "@mui/icons-material/Check";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import { Box, Button, ListItemText, Menu, MenuItem, Snackbar, Typography } from "@mui/material";
import { useState } from "react";

import type { MapStyle } from "../../api/types";
import { MAP_STYLE_OPTIONS, useMapStyle } from "./mapStyles";

export function MapStyleSwatch({ background, size = 36 }: { background: string; size?: number }) {
  return (
    <Box
      aria-hidden
      sx={{ width: size, height: size, borderRadius: 1.5, flex: "0 0 auto", background, border: "1px solid", borderColor: "divider" }}
    />
  );
}

export function MapStylePicker() {
  const { style, setStyle, saved } = useMapStyle();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const current = MAP_STYLE_OPTIONS.find((option) => option.id === style) ?? MAP_STYLE_OPTIONS[0];

  const choose = async (next: MapStyle) => {
    setAnchor(null);
    try {
      await setStyle(next);
      setToast(saved ? "Map style saved to your account." : "Map style saved on this device.");
    } catch {
      setToast("Could not save to your account. It still applies on this device.");
    }
  };

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<LayersOutlinedIcon />}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1000,
          bgcolor: "background.paper",
          boxShadow: 2,
          "&:hover": { bgcolor: "background.paper" },
        }}
      >
        {current.label}
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 280 } } }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, pt: 0.5, pb: 1 }}>
          Map style
        </Typography>
        {MAP_STYLE_OPTIONS.map((option) => (
          <MenuItem key={option.id} selected={option.id === style} onClick={() => void choose(option.id)} sx={{ gap: 1.5 }}>
            <MapStyleSwatch background={option.swatch} />
            <ListItemText primary={option.label} secondary={option.hint} />
            {option.id === style && <CheckIcon fontSize="small" color="primary" />}
          </MenuItem>
        ))}
      </Menu>
      <Snackbar open={Boolean(toast)} autoHideDuration={2500} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
