import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import CloseIcon from "@mui/icons-material/Close";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import { Box, Button, Chip, CircularProgress, IconButton, Stack, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";

import { errorMessage } from "../../api/client";
import { MAX_PHOTO_MB, MAX_VIDEO_MB, PHOTO_ACCEPT, VIDEO_ACCEPT, uploadMedia, type MediaDraft } from "./api";

const TILE = 110;

export function MediaThumb({ kind, src, alt, height = TILE }: { kind: MediaDraft["kind"]; src: string; alt: string; height?: number }) {
  if (kind === "image") {
    return <Box component="img" src={src} alt={alt} loading="lazy" sx={{ width: "100%", height, objectFit: "cover", display: "block" }} />;
  }
  return (
    <Box sx={{ position: "relative", height, bgcolor: "common.black" }}>
      <Box component="video" src={`${src}#t=0.1`} preload="metadata" muted playsInline aria-label={alt} sx={{ width: "100%", height, objectFit: "cover", display: "block" }} />
      <PlayCircleOutlineIcon sx={{ position: "absolute", inset: 0, m: "auto", fontSize: 36, color: "common.white", pointerEvents: "none" }} />
    </Box>
  );
}

export function MediaManager({
  value,
  onChange,
  onError,
  onBusyChange,
  max,
  title = "Photos and videos",
  hint,
  allowVideo = true,
  required = false,
  disabled,
}: {
  value: MediaDraft[];
  onChange: (drafts: MediaDraft[]) => void;
  onError: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
  max: number;
  title?: string;
  hint?: string;
  allowVideo?: boolean;
  required?: boolean;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(value);
  latest.current = value;
  const [pending, setPending] = useState<{ key: string; name: string }[]>([]);
  const room = max - value.length - pending.length;
  const busy = pending.length > 0;
  const reportBusy = useRef(onBusyChange);
  reportBusy.current = onBusyChange;

  useEffect(() => {
    reportBusy.current?.(busy);
  }, [busy]);

  useEffect(() => () => reportBusy.current?.(false), []);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    const chosen = Array.from(files).slice(0, Math.max(room, 0));
    if (files.length > chosen.length) onError(`Only ${max} fit here. The first ${chosen.length} were added.`);
    if (input.current) input.current.value = "";
    const queued = chosen.map((file) => ({ key: crypto.randomUUID(), name: file.name, file }));
    setPending((current) => [...current, ...queued.map(({ key, name }) => ({ key, name }))]);
    for (const { key, file } of queued) {
      try {
        const item = await uploadMedia(file);
        const draft: MediaDraft = { key: item.id, kind: item.kind, src: URL.createObjectURL(file), mediaId: item.id };
        const next = [...latest.current, draft];
        latest.current = next;
        onChange(next);
      } catch (reason) {
        onError(errorMessage(reason));
      } finally {
        setPending((current) => current.filter((entry) => entry.key !== key));
      }
    }
  }

  function moveFirst(position: number) {
    const next = [...value];
    const [moved] = next.splice(position, 1);
    onChange([moved, ...next]);
  }

  const kinds = allowVideo ? "photos or videos" : "photos";
  const missing = required && !value.some((draft) => draft.kind === "image");
  return (
    <Stack spacing={1}>
      <Typography sx={{ fontWeight: 700 }}>
        {title}
        {required ? " *" : ""}
      </Typography>
      <Typography variant="body2" color={missing ? "error" : "text.secondary"}>
        {hint ??
          (required
            ? `At least one photo is required. Up to ${max}. The first photo is the cover.`
            : `Up to ${max}. The first photo is the cover.`)}{" "}
        Photos under {MAX_PHOTO_MB} MB
        {allowVideo ? `, videos under ${MAX_VIDEO_MB} MB (MP4, WebM, or MOV).` : "."}
      </Typography>
      <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: `repeat(auto-fill, minmax(${TILE}px, 1fr))` }}>
        {value.map((draft, position) => (
          <Box key={draft.key} sx={{ position: "relative", borderRadius: 1, overflow: "hidden", border: 1, borderColor: "divider" }}>
            <MediaThumb kind={draft.kind} src={draft.src} alt={`${draft.kind === "video" ? "Video" : "Photo"} ${position + 1}`} />
            <IconButton
              size="small"
              aria-label={`Remove ${draft.kind === "video" ? "video" : "photo"} ${position + 1}`}
              disabled={disabled}
              onClick={() => onChange(value.filter((item) => item.key !== draft.key))}
              sx={{ position: "absolute", top: 4, right: 4, bgcolor: "background.paper", "&:hover": { bgcolor: "background.paper" } }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
            {position === 0 ? (
              <Chip size="small" label="First" color="primary" sx={{ position: "absolute", left: 4, bottom: 4 }} />
            ) : (
              <Button
                size="small"
                variant="contained"
                color="inherit"
                disabled={disabled}
                onClick={() => moveFirst(position)}
                sx={{ position: "absolute", left: 4, bottom: 4, py: 0, minWidth: 0, fontSize: 12 }}
              >
                Move first
              </Button>
            )}
          </Box>
        ))}
        {pending.map((entry) => (
          <Stack
            key={entry.key}
            spacing={0.5}
            sx={{ height: TILE, alignItems: "center", justifyContent: "center", border: 1, borderColor: "divider", borderRadius: 1, px: 1 }}
          >
            <CircularProgress size={24} aria-label={`Uploading ${entry.name}`} />
            <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: "100%" }}>
              {entry.name}
            </Typography>
          </Stack>
        ))}
        {room > 0 && (
          <Button variant="outlined" disabled={disabled} onClick={() => input.current?.click()} sx={{ height: TILE, flexDirection: "column", gap: 0.5 }}>
            <AddPhotoAlternateOutlinedIcon />
            Add {kinds}
          </Button>
        )}
      </Box>
      <input
        ref={input}
        type="file"
        accept={allowVideo ? `${PHOTO_ACCEPT},${VIDEO_ACCEPT}` : PHOTO_ACCEPT}
        multiple
        hidden
        aria-label={`Add ${kinds}`}
        onChange={(event) => void pick(event.target.files)}
      />
    </Stack>
  );
}
