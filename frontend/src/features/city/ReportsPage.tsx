import { Alert, Box, Button, Chip, CircularProgress, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState, type FormEvent } from "react";
import { Link as RouterLink } from "react-router-dom";

import { apiGet, apiRequest, errorMessage, fieldErrors } from "../../api/client";
import type { CivicReport } from "../../api/types";
import { useAuth } from "../auth/AuthContext";
import { useLoginPath } from "../auth/paths";
import { REPORT_CATEGORIES } from "../life/catalog";
import { PageIntro, Surface, when } from "../life/ui";
import { hasCoverImage, mediaIds, type MediaDraft } from "../media/api";
import { galleryOf, MediaDialogButton } from "../media/MediaGallery";
import { MediaManager } from "../media/MediaManager";
import { REPORT_STATUS } from "./labels";
import { useWard } from "./WardContext";

const MAX_REPORT_MEDIA = 4;

export default function ReportsPage() {
  const { user, ready } = useAuth();
  const signIn = useLoginPath();
  const { wards, wardId } = useWard();
  const [category, setCategory] = useState<string>(REPORT_CATEGORIES[0].label);
  const [ward, setWard] = useState("");
  const [place, setPlace] = useState("");
  const [details, setDetails] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<MediaDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reports, setReports] = useState<CivicReport[] | null>(null);

  useEffect(() => {
    if (!ward) setWard(user?.ward_id || wardId);
  }, [ward, user, wardId]);

  useEffect(() => {
    if (!user) {
      setReports(null);
      return;
    }
    let active = true;
    apiGet<{ data: CivicReport[] }>("/api/v1/city/reports/mine")
      .then((payload) => {
        if (active) setReports(payload.data);
      })
      .catch(() => {
        if (active) setReports([]);
      });
    return () => {
      active = false;
    };
  }, [user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (place.trim().length < 2) next.place = "Name the street or a landmark.";
    if (details.trim().length < 8) next.details = "Describe what happened in a sentence.";
    if (!hasCoverImage(media)) next.media = "Add a photo of the issue.";
    setErrors(next);
    setFormError(null);
    setDone(false);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const report = await apiRequest<CivicReport>("/api/v1/city/reports", {
        method: "POST",
        body: { category, place: place.trim(), details: details.trim(), ward_id: ward || undefined, media: mediaIds(media) },
      });
      setReports((rows) => [report, ...(rows ?? [])]);
      setPlace("");
      setDetails("");
      setMedia([]);
      setDone(true);
    } catch (reason) {
      setErrors(fieldErrors(reason));
      setFormError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={2.5}>
      <PageIntro
        kicker="Civic desk"
        title="Report an issue"
        lede="Potholes, lights, leaks, garbage, drains, and missed pickups. The city desk sees your report right away and updates its status."
      />

      {ready && !user ? (
        <Surface>
          <Typography sx={{ fontWeight: 700 }}>Sign in to report an issue</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
            We need your account so the city desk can send you updates.
          </Typography>
          <Button component={RouterLink} to={signIn} variant="contained">
            Sign in
          </Button>
        </Surface>
      ) : (
        <Surface>
          <Stack component="form" spacing={2} onSubmit={submit} noValidate>
            <Typography variant="h2">What is the problem?</Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }} role="group" aria-label="Category">
              {REPORT_CATEGORIES.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant={category === item.label ? "contained" : "outlined"}
                  aria-pressed={category === item.label}
                  onClick={() => setCategory(item.label)}
                >
                  {item.label}
                </Button>
              ))}
            </Stack>
            <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "220px 1fr" } }}>
              <TextField select label="Ward" value={ward} onChange={(event) => setWard(event.target.value)} disabled={!wards.length}>
                {wards.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Place"
                value={place}
                onChange={(event) => setPlace(event.target.value)}
                error={Boolean(errors.place)}
                helperText={errors.place || "Street name or a nearby landmark."}
                required
              />
            </Box>
            <TextField
              label="What happened"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              error={Boolean(errors.details)}
              helperText={errors.details}
              required
              fullWidth
              multiline
              minRows={3}
            />
            <MediaManager
              value={media}
              onChange={setMedia}
              onError={setFormError}
              onBusyChange={setUploading}
              max={MAX_REPORT_MEDIA}
              title="Photos or a video"
              hint={errors.media ?? `Required. Up to ${MAX_REPORT_MEDIA}. A clear photo helps the crew find and fix it faster.`}
              required
              disabled={busy}
            />
            {formError && <Alert severity="error">{formError}</Alert>}
            {done && <Alert severity="success">Report sent. You can follow its status below and on Activity.</Alert>}
            <Button type="submit" variant="contained" disabled={busy || uploading || !ready} sx={{ alignSelf: "flex-start" }}>
              {uploading ? "Uploading…" : busy ? "Sending…" : "Submit report"}
            </Button>
          </Stack>
        </Surface>
      )}

      {user && (
        <Stack spacing={1}>
          <Typography variant="h2">Your reports</Typography>
          {!reports && <CircularProgress aria-label="Loading your reports" />}
          {reports?.length === 0 && <Typography color="text.secondary">You have not reported anything yet.</Typography>}
          {reports?.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

export function ReportCard({ report }: { report: CivicReport }) {
  const status = REPORT_STATUS[report.status] ?? { label: report.status, color: "default" as const };
  return (
    <Surface>
      <Stack spacing={0.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <Typography sx={{ fontWeight: 700 }}>
            {report.category} · {report.place}
          </Typography>
          <Chip label={status.label} color={status.color} size="small" variant="outlined" />
        </Stack>
        <Typography>{report.details}</Typography>
        <MediaDialogButton items={galleryOf(report.media)} title={`${report.category} · ${report.place}`} />
        {report.admin_note && (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            City desk: {report.admin_note}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          {report.ward_name ? `${report.ward_name} · ` : ""}
          {when(report.created_at)}
        </Typography>
      </Stack>
    </Surface>
  );
}
