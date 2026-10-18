import { Button, Chip, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { useLoginPath } from "../auth/paths";
import { rupees } from "./labels";
import { BILLS } from "../life/catalog";
import { payBill, useLife } from "../life/store";
import { PageIntro, Surface } from "../life/ui";

export default function UtilitiesPage() {
  const { user, ready } = useAuth();
  const signIn = useLoginPath();
  const life = useLife(user?.id ?? null);

  return (
    <Stack spacing={2.5}>
      <PageIntro
        kicker="UTILITIES"
        title="Pay a bill"
        lede="Water and electricity for the consumer numbers linked to your household. A paid bill stays on Activity."
      />
      {ready && !user && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button component={RouterLink} to={signIn} variant="contained">
            Sign in to pay
          </Button>
        </Stack>
      )}
      <Stack spacing={1.5}>
        {BILLS.map((bill) => {
          const paid = life.paidBillIds.includes(bill.id);
          return (
            <Surface key={bill.id}>
              <Stack spacing={1}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                  <Stack spacing={0.25}>
                    <Typography sx={{ fontWeight: 700 }}>
                      {bill.utility} · {bill.period}
                    </Typography>
                    <Typography color="text.secondary">Consumer {bill.consumer}</Typography>
                  </Stack>
                  <Typography sx={{ fontSize: "1.6rem", fontWeight: 700 }}>{rupees(bill.amountPaise)}</Typography>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                  <Chip label={paid ? "Paid" : `Due ${bill.due}`} color={paid ? "success" : "warning"} variant="outlined" />
                  <Button
                    variant="contained"
                    disabled={!ready || !user || paid}
                    onClick={() => user && payBill(user.id, bill.id, `${bill.utility} bill · ${bill.period}`, bill.amountPaise)}
                  >
                    {paid ? "Paid" : ready && !user ? "Sign in to pay" : "Pay bill"}
                  </Button>
                </Stack>
              </Stack>
            </Surface>
          );
        })}
      </Stack>
    </Stack>
  );
}
