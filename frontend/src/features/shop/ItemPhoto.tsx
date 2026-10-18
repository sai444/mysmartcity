import { Box, Button, Stack } from "@mui/material";
import { useRef, useState } from "react";

const MAX_SIDE = 480;

export async function readItemPhoto(file: File, maxSide = MAX_SIDE): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo file.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot read photos.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function ItemThumb({ src, alt, size = 56 }: { src?: string | null; alt: string; size?: number }) {
  if (!src) return null;
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      sx={{ width: size, height: size, objectFit: "cover", borderRadius: 1, flex: "0 0 auto", border: 1, borderColor: "divider" }}
    />
  );
}

export function ItemPhotoPicker({
  value,
  onChange,
  onError,
  label,
  disabled,
}: {
  value: string | null;
  onChange: (image: string | null) => void;
  onError: (message: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setReading(true);
    try {
      onChange(await readItemPhoto(file));
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "That photo could not be read.");
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flex: "0 0 auto" }}>
      <ItemThumb src={value} alt={label} size={48} />
      <Button size="small" variant="outlined" disabled={disabled || reading} onClick={() => input.current?.click()}>
        {reading ? "Reading…" : value ? "Change photo" : "Add photo"}
      </Button>
      {value && (
        <Button size="small" disabled={disabled || reading} onClick={() => onChange(null)}>
          Clear
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        aria-label={`Photo for ${label}`}
        onChange={(event) => void pick(event.target.files?.[0])}
      />
    </Stack>
  );
}
