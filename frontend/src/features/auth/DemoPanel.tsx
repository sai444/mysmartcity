import { Box, Button, Stack, Typography } from "@mui/material";

import { insetSurfaceSx, kickerSx } from "../../theme/surfaces";
import { CITY_SNAPSHOT, DEMO_ACCOUNTS, type DemoAccount } from "./demo";

export function DemoPanel({
  onPick,
  busy,
  kind,
}: {
  onPick: (account: DemoAccount) => void;
  busy: boolean;
  kind: "site" | "admin";
}) {
  const admin = kind === "admin";
  const accounts = DEMO_ACCOUNTS.filter((account) => account.role === (admin ? "admin" : "resident"));

  return (
    <Stack spacing={2.5}>
      <Stack spacing={1}>
        <Typography sx={[kickerSx, admin && { color: "warning.main" }]}>
          {admin ? "City desk" : "Sample city"}
        </Typography>
        <Typography component="h2" variant="h1" sx={{ fontSize: { xs: "1.75rem", sm: "2.1rem", md: "2.5rem" }, maxWidth: 520, overflowWrap: "anywhere" }}>
          {admin ? "Open the desk with the sample admin." : "Walk the ward before you create an account."}
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 520 }}>
          {admin
            ? "The sample admin publishes notices, posts bills, and updates civic reports."
            : "A sample resident is already in Lake View. Sign in to pay, report, and shop nearby."}
        </Typography>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
          gap: 1,
        }}
      >
        {CITY_SNAPSHOT.map((item) => (
          <Box key={item.label} sx={insetSurfaceSx}>
            <Typography variant="body2" color="text.secondary">
              {item.label}
            </Typography>
            <Typography sx={{ fontWeight: 700 }}>{item.value}</Typography>
          </Box>
        ))}
      </Box>

      <Stack spacing={1}>
        <Typography variant="h2">Sign in as</Typography>
        {accounts.map((account) => (
          <Button
            key={account.email}
            variant="outlined"
            disabled={busy}
            onClick={() => onPick(account)}
            sx={{
              justifyContent: "flex-start",
              textAlign: "left",
              py: 1.5,
              px: 2,
              borderColor: "divider",
              whiteSpace: "normal",
              bgcolor: "background.paper",
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700 }}>
                {account.role === "admin" ? "City admin" : "Resident"} · {account.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {account.email} · {account.password}
              </Typography>
              <Typography variant="body2">{account.blurb}</Typography>
              <Typography variant="body2" color="text.secondary">
                Ward {account.ward}
              </Typography>
            </Box>
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}
