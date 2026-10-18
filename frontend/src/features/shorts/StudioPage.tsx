import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import VideoCallOutlinedIcon from "@mui/icons-material/VideoCallOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { Alert, Box, Button, Chip, FormControlLabel, Stack, Switch, TextField, Typography } from "@mui/material";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link as RouterLink } from "react-router-dom";

import { errorMessage, fieldErrors } from "../../api/client";
import { useAuth } from "../auth/AuthContext";
import { useLoginPath } from "../auth/paths";
import { PageIntro, Surface, when } from "../life/ui";
import { Loading } from "../market/parts";
import {
  managedShorts,
  MAX_PHOTO_MB,
  MAX_SECONDS,
  MAX_VIDEO_MB,
  myShorts,
  postShort,
  removeShort,
  setShortStatus,
  SHORT_ACCEPT,
  videoSrc,
  type Short,
} from "./api";
import { compactCount, ShortsTabs } from "./ShortsPage";

export default function StudioPage() {
  const { user, ready } = useAuth();
  const signIn = useLoginPath();
  const admin = user?.role === "admin";
  const [shorts, setShorts] = useState<Short[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setShorts(null);
      return;
    }
    let live = true;
    (admin ? managedShorts() : myShorts())
      .then((data) => {
        if (live) setShorts(data);
      })
      .catch((reason: unknown) => {
        if (live) setError(errorMessage(reason));
      });
    return () => {
      live = false;
    };
  }, [user, admin]);

  async function act(short: Short, action: "hide" | "show" | "remove") {
    setError(null);
    try {
      if (action === "remove") {
        if (!window.confirm(`Remove this ${short.kind === "ad" ? "ad" : "short"} for good?`)) return;
        await removeShort(short.id);
        setShorts((current) => current?.filter((item) => item.id !== short.id) ?? current);
        return;
      }
      const updated = await setShortStatus(short.id, action === "hide" ? "hidden" : "live");
      setShorts((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? current);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <Stack spacing={2.5}>
      <ShortsTabs />
      <PageIntro
        kicker="SHORTS STUDIO"
        title="Post a short"
        lede={`Share a photo or a clip up to ${MAX_SECONDS} seconds. Vertical frames look best in the feed.`}
      />
      {ready && !user && (
        <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
          <Typography color="text.secondary">Sign in to post shorts and see how they're doing.</Typography>
          <Button component={RouterLink} to={signIn} variant="contained">
            Sign in
          </Button>
        </Stack>
      )}
      {user && <UploadForm admin={admin} onPosted={(short) => setShorts((current) => [short, ...(current ?? [])])} />}
      {error && <Alert severity="error">{error}</Alert>}
      {user && (
        <Stack spacing={1.5}>
          <Typography variant="h2">{admin ? "All shorts and ads" : "Your shorts"}</Typography>
          {!shorts && !error && <Loading label="Loading your shorts" />}
          {shorts?.length === 0 && <Typography color="text.secondary">Nothing posted yet.</Typography>}
          {shorts?.map((short) => (
            <StudioRow key={short.id} short={short} admin={admin} onAction={(action) => void act(short, action)} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function UploadForm({ admin, onPosted }: { admin: boolean; onPosted: (short: Short) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [asAd, setAsAd] = useState(false);
  const [sponsor, setSponsor] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(next: File | undefined) {
    setErrors({});
    setMessage(null);
    if (!next) return;
    const photo = next.type.startsWith("image/");
    const limit = photo ? MAX_PHOTO_MB : MAX_VIDEO_MB;
    if (next.size > limit * 1024 * 1024) {
      setErrors({ video: `${photo ? "Photos" : "Videos"} must be under ${limit} MB.` });
      return;
    }
    setFile(next);
  }

  function checkLength(video: HTMLVideoElement) {
    if (Number.isFinite(video.duration) && video.duration > MAX_SECONDS + 0.5) {
      setErrors({ video: `Shorts can be up to ${MAX_SECONDS} seconds. This one is ${Math.round(video.duration)}.` });
      setFile(null);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!file) {
      setErrors({ video: "Pick a photo or a video to upload." });
      return;
    }
    setBusy(true);
    try {
      const ad = admin && asAd ? { sponsor, cta_label: ctaLabel, cta_url: ctaUrl } : undefined;
      const short = await postShort(file, caption, ad);
      onPosted(short);
      setFile(null);
      setCaption("");
      setSponsor("");
      setCtaLabel("");
      setCtaUrl("");
      setErrors({});
      setMessage({ tone: "success", text: ad ? "Ad is live in the shorts feed." : "Your short is live." });
      if (inputRef.current) inputRef.current.value = "";
    } catch (reason) {
      setErrors(fieldErrors(reason));
      setMessage({ tone: "error", text: errorMessage(reason) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Surface>
      <Stack component="form" spacing={2} onSubmit={submit} noValidate>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "flex-start" } }}>
          <Box
            sx={{
              width: { xs: "100%", sm: 180 },
              aspectRatio: "9 / 16",
              maxHeight: 320,
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "#000",
              display: "grid",
              placeItems: "center",
              flex: "0 0 auto",
            }}
          >
            {preview && file?.type.startsWith("image/") ? (
              <Box component="img" src={preview} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : preview ? (
              <Box
                component="video"
                src={preview}
                controls
                playsInline
                muted
                onLoadedMetadata={(event) => checkLength(event.currentTarget)}
                sx={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <AddPhotoAlternateOutlinedIcon sx={{ fontSize: 48, color: "grey.500" }} />
            )}
          </Box>
          <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
            <Box>
              <input
                ref={inputRef}
                type="file"
                accept={SHORT_ACCEPT}
                hidden
                id="short-video"
                onChange={(event) => pick(event.target.files?.[0])}
              />
              <Button
                variant="outlined"
                component="label"
                htmlFor="short-video"
                startIcon={file?.type.startsWith("image/") ? <AddPhotoAlternateOutlinedIcon /> : <VideoCallOutlinedIcon />}
              >
                {file ? "Choose another file" : "Choose photo or video"}
              </Button>
              <Typography variant="body2" color={errors.video ? "error" : "text.secondary"} sx={{ mt: 0.75 }}>
                {errors.video ??
                  (file
                    ? file.name
                    : `JPEG, PNG, WebP, or MP4 / WebM / MOV · photos ${MAX_PHOTO_MB} MB · clips ${MAX_SECONDS} s / ${MAX_VIDEO_MB} MB`)}
              </Typography>
            </Box>
            <TextField
              label="Caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              error={Boolean(errors.caption)}
              helperText={errors.caption ?? `${caption.length}/150`}
              slotProps={{ htmlInput: { maxLength: 150 } }}
              multiline
              minRows={2}
              fullWidth
            />
            {admin && (
              <FormControlLabel
                control={<Switch checked={asAd} onChange={(event) => setAsAd(event.target.checked)} />}
                label="Post as a sponsored ad"
              />
            )}
            {admin && asAd && (
              <Stack spacing={2}>
                <TextField
                  label="Sponsor"
                  value={sponsor}
                  onChange={(event) => setSponsor(event.target.value)}
                  error={Boolean(errors.sponsor)}
                  helperText={errors.sponsor ?? "The business shown on the ad."}
                  slotProps={{ htmlInput: { maxLength: 80 } }}
                  fullWidth
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    label="Button label"
                    value={ctaLabel}
                    onChange={(event) => setCtaLabel(event.target.value)}
                    error={Boolean(errors.cta_label)}
                    helperText={errors.cta_label ?? "e.g. Visit shop"}
                    slotProps={{ htmlInput: { maxLength: 24 } }}
                    sx={{ minWidth: { sm: 180 } }}
                  />
                  <TextField
                    label="Button link"
                    value={ctaUrl}
                    onChange={(event) => setCtaUrl(event.target.value)}
                    error={Boolean(errors.cta_url)}
                    helperText={errors.cta_url ?? "A page like /b/lakshmi-sweets or an https:// link"}
                    fullWidth
                  />
                </Stack>
              </Stack>
            )}
            {message && <Alert severity={message.tone}>{message.text}</Alert>}
            <Button type="submit" variant="contained" disabled={busy} sx={{ alignSelf: "flex-start" }}>
              {busy ? "Uploading…" : asAd && admin ? "Publish ad" : "Post short"}
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Surface>
  );
}

function StudioRow({ short, admin, onAction }: { short: Short; admin: boolean; onAction: (action: "hide" | "show" | "remove") => void }) {
  const ad = short.kind === "ad";
  const hidden = short.status === "hidden";
  return (
    <Surface>
      <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", opacity: hidden ? 0.7 : 1 }}>
        {short.media_kind === "image" ? (
          <Box
            component="img"
            src={videoSrc(short.video_url)}
            alt=""
            sx={{ width: 72, aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 1, bgcolor: "#000", flex: "0 0 auto" }}
          />
        ) : (
          <Box
            component="video"
            src={`${videoSrc(short.video_url)}#t=0.5`}
            preload="metadata"
            muted
            playsInline
            sx={{ width: 72, aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 1, bgcolor: "#000", flex: "0 0 auto" }}
          />
        )}
        <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
            {ad && <Chip size="small" color="warning" label={`Ad · ${short.sponsor}`} />}
            {hidden && <Chip size="small" label="Hidden" />}
            <Typography variant="body2" color="text.secondary">
              {ad ? "" : `@${short.author_name} · `}
              {when(short.created_at)}
            </Typography>
          </Stack>
          <Typography sx={{ overflowWrap: "anywhere" }}>{short.caption}</Typography>
          <Typography variant="body2" color="text.secondary">
            {compactCount(short.views)} views · {compactCount(short.like_count)} likes
            {ad && ` · ${compactCount(short.clicks)} clicks`}
            {ad && short.views > 0 && ` (${((short.clicks / short.views) * 100).toFixed(1)}% click rate)`}
          </Typography>
          <Stack direction="row" spacing={1}>
            {admin && (
              <Button
                size="small"
                startIcon={hidden ? <VisibilityOutlinedIcon /> : <VisibilityOffOutlinedIcon />}
                onClick={() => onAction(hidden ? "show" : "hide")}
              >
                {hidden ? "Show in feed" : "Hide"}
              </Button>
            )}
            <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => onAction("remove")}>
              Remove
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Surface>
  );
}
