import CloseIcon from "@mui/icons-material/Close";
import CollectionsOutlinedIcon from "@mui/icons-material/CollectionsOutlined";
import { Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Stack } from "@mui/material";
import { useState } from "react";

import { mediaSrc, type MediaKind } from "./api";
import { MediaThumb } from "./MediaManager";

export type GalleryEntry = { key: string; kind: MediaKind; url: string };

export function MediaGallery({ items, title, height = 420 }: { items: GalleryEntry[]; title: string; height?: number }) {
  const [index, setIndex] = useState(0);
  if (!items.length) return null;
  const position = Math.min(index, items.length - 1);
  const current = items[position];
  const label = `${title}, ${current.kind === "video" ? "video" : "photo"} ${position + 1} of ${items.length}`;
  return (
    <Stack spacing={1}>
      {current.kind === "video" ? (
        <Box
          key={current.key}
          component="video"
          src={mediaSrc(current.url)}
          controls
          playsInline
          preload="metadata"
          aria-label={label}
          sx={{ width: "100%", maxHeight: height, bgcolor: "common.black", borderRadius: 1, display: "block" }}
        />
      ) : (
        <Box
          component="img"
          src={mediaSrc(current.url)}
          alt={label}
          sx={{ width: "100%", maxHeight: height, objectFit: "contain", bgcolor: "action.hover", borderRadius: 1, display: "block" }}
        />
      )}
      {items.length > 1 && (
        <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5 }}>
          {items.map((item, at) => (
            <Box
              key={item.key}
              component="button"
              type="button"
              onClick={() => setIndex(at)}
              aria-label={`Show ${item.kind === "video" ? "video" : "photo"} ${at + 1}`}
              aria-pressed={at === position}
              sx={{
                p: 0,
                flex: "0 0 64px",
                width: 64,
                border: 2,
                borderColor: at === position ? "primary.main" : "transparent",
                borderRadius: 1,
                overflow: "hidden",
                cursor: "pointer",
                bgcolor: "transparent",
              }}
            >
              <MediaThumb kind={item.kind} src={mediaSrc(item.url)} alt="" height={64} />
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

export function MediaDialogButton({ items, title, size = "small" }: { items: GalleryEntry[]; title: string; size?: "small" | "medium" }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const videos = items.filter((item) => item.kind === "video").length;
  const photos = items.length - videos;
  const parts = [photos && `${photos} ${photos === 1 ? "photo" : "photos"}`, videos && `${videos} ${videos === 1 ? "video" : "videos"}`].filter(Boolean);
  return (
    <>
      <Button size={size} startIcon={<CollectionsOutlinedIcon />} onClick={() => setOpen(true)} sx={{ alignSelf: "flex-start" }}>
        {parts.join(" · ")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ pr: 6 }}>
          {title}
          <IconButton aria-label="Close" onClick={() => setOpen(false)} sx={{ position: "absolute", right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>{open && <MediaGallery items={items} title={title} />}</DialogContent>
      </Dialog>
    </>
  );
}

export function galleryOf(items: { id: string; kind: MediaKind; url: string }[] | undefined): GalleryEntry[] {
  return (items ?? []).map((item) => ({ key: item.id, kind: item.kind, url: item.url }));
}
