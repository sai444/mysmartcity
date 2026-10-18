import ToggleOffOutlinedIcon from "@mui/icons-material/ToggleOffOutlined";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

import { surfaceSx } from "../../theme/surfaces";
import { useAuth } from "../auth/AuthContext";
import { useFeatures } from "./FeatureContext";

export function FeatureGate({ feature, children }: { feature: string; children: ReactNode }) {
  const { isEnabled } = useFeatures();
  const { user } = useAuth();

  if (isEnabled(feature)) return <>{children}</>;

  if (user?.role === "admin") {
    return (
      <Stack spacing={2}>
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" component={RouterLink} to="/admin?tab=features">
              Manage
            </Button>
          }
        >
          Residents cannot see this section. It is turned off in the admin console.
        </Alert>
        {children}
      </Stack>
    );
  }

  return (
    <Box sx={[surfaceSx, { p: { xs: 3, sm: 4 }, textAlign: "center", maxWidth: 520, mx: "auto", mt: 4 }]}>
      <ToggleOffOutlinedIcon sx={{ fontSize: 40, color: "text.secondary" }} />
      <Typography variant="h2" sx={{ mt: 1 }}>
        This section is turned off
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
        The city admin has paused it for now. Please check back later.
      </Typography>
      <Button component={RouterLink} to="/city" variant="contained">
        Back to city home
      </Button>
    </Box>
  );
}
