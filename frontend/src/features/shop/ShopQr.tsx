import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function ShopQr({ path, name }: { path: string; name: string }) {
  const url = `${window.location.origin}${path}`;
  const [src, setSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, {
      margin: 1,
      width: 280,
      color: { dark: "#0c1824", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (active) setSrc(dataUrl);
      })
      .catch(() => {
        if (active) setError("The shop code could not be drawn.");
      });
    return () => {
      active = false;
    };
  }, [url]);

  return (
    <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
      <Typography sx={{ fontWeight: 700 }}>Shop code</Typography>
      <Typography color="text.secondary">
        This code opens {name}&apos;s profile: hours, address, and the item catalog. Print it for the counter. The page
        stays current when the catalog changes.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ p: 1.5, bgcolor: "#ffffff", borderRadius: 2, lineHeight: 0, maxWidth: "100%" }}>
        {src ? (
          <img src={src} alt={`QR code for ${name}`} width={220} height={220} style={{ maxWidth: "100%", height: "auto" }} />
        ) : (
          <Box sx={{ width: { xs: "100%", sm: 220 }, maxWidth: 220, aspectRatio: "1" }} />
        )}
      </Box>
      <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
        {url}
      </Typography>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ width: "100%", "& .MuiButton-root": { width: { xs: "100%", sm: "auto" } } }}
      >
        {src && (
          <Button component="a" href={src} download={`${name.replace(/\s+/g, "-").toLowerCase()}-qr.png`} variant="contained">
            Download QR
          </Button>
        )}
        <Button
          variant="outlined"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </Stack>
    </Stack>
  );
}
