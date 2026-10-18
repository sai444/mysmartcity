import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import { Alert, Box, Button, Chip, IconButton, Snackbar, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";

import { errorMessage } from "../../api/client";
import { useAuth } from "../auth/AuthContext";
import { Loading } from "../market/parts";
import { recordClick, recordView, setLiked, shortsFeed, videoSrc, type Short } from "./api";

const FEED_HEIGHT = "max(420px, calc(100dvh - 190px))";

export function ShortsTabs() {
  const { pathname } = useLocation();
  const current = pathname.startsWith("/shorts/studio") ? "/shorts/studio" : "/shorts";
  return (
    <Tabs value={current} variant="scrollable" allowScrollButtonsMobile sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Tab label="For you" value="/shorts" component={RouterLink} to="/shorts" />
      <Tab label="Studio" value="/shorts/studio" component={RouterLink} to="/shorts/studio" />
    </Tabs>
  );
}

export function compactCount(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(value);
}

export default function ShortsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Short[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const viewed = useRef(new Set<string>());

  useEffect(() => {
    let live = true;
    shortsFeed()
      .then((data) => {
        if (live) setItems(data);
      })
      .catch((reason: unknown) => {
        if (live) setError(errorMessage(reason));
      });
    return () => {
      live = false;
    };
  }, [user?.id]);

  useEffect(() => {
    const root = feedRef.current;
    if (!root || !items?.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-index]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    const short = items?.[active];
    if (!short || viewed.current.has(short.id)) return;
    viewed.current.add(short.id);
    void recordView(short.id);
  }, [active, items]);

  async function toggleLike(short: Short) {
    if (!user) {
      setNote("Sign in to like shorts.");
      return;
    }
    try {
      const updated = await setLiked(short.id, !short.liked);
      setItems((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? current);
    } catch (reason) {
      setNote(errorMessage(reason));
    }
  }

  return (
    <Stack spacing={2}>
      <ShortsTabs />
      {error && <Alert severity="error">{error}</Alert>}
      {!items && !error && <Loading label="Loading shorts" />}
      {items && items.length === 0 && (
        <Stack spacing={1.5} sx={{ alignItems: "flex-start", py: 2 }}>
          <Typography color="text.secondary">No shorts yet. Film something happening in your ward and be the first.</Typography>
          <Button component={RouterLink} to="/shorts/studio" variant="contained">
            Post a short
          </Button>
        </Stack>
      )}
      {items && items.length > 0 && (
        <Box
          ref={feedRef}
          role="feed"
          aria-label="Shorts"
          sx={{
            height: FEED_HEIGHT,
            width: `min(100%, calc(${FEED_HEIGHT} * 9 / 16))`,
            alignSelf: "center",
            overflowY: "auto",
            scrollSnapType: "y mandatory",
            borderRadius: 3,
            bgcolor: "#000",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {items.map((short, index) => (
            <ShortCard
              key={`${short.id}-${index}`}
              index={index}
              short={short}
              active={index === active}
              muted={muted}
              onMute={() => setMuted((value) => !value)}
              onLike={() => void toggleLike(short)}
            />
          ))}
        </Box>
      )}
      <Snackbar open={note !== null} autoHideDuration={3000} onClose={() => setNote(null)} message={note} />
    </Stack>
  );
}

type CardProps = {
  index: number;
  short: Short;
  active: boolean;
  muted: boolean;
  onMute: () => void;
  onLike: () => void;
};

function ShortCard({ index, short, active, muted, onMute, onLike }: CardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const ad = short.kind === "ad";
  const photo = short.media_kind === "image";

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      video.currentTime = 0;
      video.play().catch(() => setPaused(true));
    } else {
      video.pause();
    }
  }, [active, photo]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }

  return (
    <Box
      data-index={index}
      component="article"
      aria-label={ad ? `Sponsored by ${short.sponsor}` : `Short by ${short.author_name}`}
      sx={{ position: "relative", height: "100%", scrollSnapAlign: "start", scrollSnapStop: "always", overflow: "hidden" }}
    >
      {photo ? (
        <Box
          component="img"
          src={videoSrc(short.video_url)}
          alt={short.caption}
          sx={{ width: "100%", height: "100%", objectFit: "contain", display: "block", bgcolor: "#000" }}
        />
      ) : (
        <Box
          component="video"
          ref={videoRef}
          src={videoSrc(short.video_url)}
          loop
          playsInline
          muted={muted}
          preload={active ? "auto" : "metadata"}
          onClick={togglePlay}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          sx={{ width: "100%", height: "100%", objectFit: "contain", display: "block", cursor: "pointer", bgcolor: "#000" }}
        />
      )}
      {paused && active && !photo && (
        <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <PlayArrowIcon sx={{ fontSize: 72, color: "rgba(255,255,255,0.85)" }} />
        </Box>
      )}

      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          p: 2,
          pt: 6,
          alignItems: "flex-end",
          color: "#fff",
          backgroundImage: "linear-gradient(transparent, rgba(0,0,0,0.75))",
        }}
      >
        <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
          {ad ? (
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
              <Chip size="small" icon={<CampaignOutlinedIcon />} label="Sponsored" color="warning" />
              <Typography sx={{ fontWeight: 700, textShadow, overflowWrap: "anywhere" }}>{short.sponsor}</Typography>
            </Stack>
          ) : (
            <Typography noWrap sx={{ fontWeight: 700, textShadow }}>
              @{short.author_name}
            </Typography>
          )}
          <Typography variant="body2" sx={{ textShadow, overflowWrap: "anywhere" }}>
            {short.caption}
          </Typography>
          {ad && short.cta_url && <AdButton short={short} />}
        </Stack>
        <Stack spacing={0.5} sx={{ alignItems: "center", flex: "0 0 auto" }}>
          <IconButton onClick={onLike} aria-label={short.liked ? "Unlike" : "Like"} aria-pressed={short.liked} sx={overlayButtonSx}>
            {short.liked ? <FavoriteIcon sx={{ color: "#ff4d6d" }} /> : <FavoriteBorderIcon />}
          </IconButton>
          <Typography variant="caption" sx={{ fontWeight: 700, textShadow }}>
            {compactCount(short.like_count)}
          </Typography>
          {!photo && (
            <IconButton onClick={onMute} aria-label={muted ? "Unmute" : "Mute"} sx={overlayButtonSx}>
              {muted ? <VolumeOffIcon /> : <VolumeUpIcon />}
            </IconButton>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

function AdButton({ short }: { short: Short }) {
  const internal = short.cta_url.startsWith("/");
  const common = { variant: "contained" as const, color: "warning" as const, fullWidth: true, onClick: () => void recordClick(short.id) };
  return internal ? (
    <Button {...common} component={RouterLink} to={short.cta_url}>
      {short.cta_label}
    </Button>
  ) : (
    <Button {...common} href={short.cta_url} target="_blank" rel="noopener noreferrer sponsored" endIcon={<OpenInNewIcon />}>
      {short.cta_label}
    </Button>
  );
}

const textShadow = "0 1px 3px rgba(0,0,0,0.8)";

const overlayButtonSx = {
  color: "#fff",
  bgcolor: "rgba(0,0,0,0.35)",
  "&:hover": { bgcolor: "rgba(0,0,0,0.55)" },
} as const;
