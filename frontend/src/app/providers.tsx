import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import type { ReactNode } from "react";

import { FeatureProvider } from "../features/admin/FeatureContext";
import { AuthProvider } from "../features/auth/AuthContext";
import { WardProvider } from "../features/city/WardContext";
import { appTheme } from "../theme/themes";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={appTheme} defaultMode="system" noSsr>
      <CssBaseline />
      <AuthProvider>
        <FeatureProvider>
          <WardProvider>{children}</WardProvider>
        </FeatureProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
