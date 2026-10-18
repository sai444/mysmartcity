import { apiRequest } from "../../api/client";
import type { MediaItem, MediaKind } from "../../api/types";
import { assetUrl } from "../market/api";

export type { MediaItem, MediaKind };

/** One tile in an upload form. `mediaId` is set for uploads; drafts without it are older inline photos the parent maps back. */
export type MediaDraft = { key: string; kind: MediaKind; src: string; mediaId?: string };

export const MAX_PHOTO_MB = 8;
export const MAX_VIDEO_MB = 25;
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";
const PHOTO_SIDE = 1600;
const KEEP_ORIGINAL_BYTES = 1.5 * 1024 * 1024;

export function mediaSrc(url: string) {
  return url.startsWith("/") ? (assetUrl(url) ?? url) : url;
}

export function draftsFrom(items: MediaItem[] | undefined): MediaDraft[] {
  return (items ?? []).map((item) => ({ key: item.id, kind: item.kind, src: mediaSrc(item.url), mediaId: item.id }));
}

export function mediaIds(drafts: MediaDraft[]) {
  return drafts.flatMap((draft) => (draft.mediaId ? [draft.mediaId] : []));
}

export function coverUrl(items: MediaItem[] | undefined) {
  const image = items?.find((item) => item.kind === "image");
  return image ? mediaSrc(image.url) : null;
}

export function hasCoverImage(drafts: MediaDraft[]) {
  return drafts.some((draft) => draft.kind === "image");
}

export function itemCover(item: { image?: string | null; media?: MediaItem[] }) {
  return item.image || coverUrl(item.media);
}

async function shrinkPhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} could not be read. Use a JPEG, PNG, or WebP photo.`);
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= PHOTO_SIDE && file.size <= KEEP_ORIGINAL_BYTES && PHOTO_ACCEPT.includes(file.type)) {
    bitmap.close();
    return file;
  }
  const scale = Math.min(1, PHOTO_SIDE / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare photos.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error(`${file.name} could not be prepared.`);
  return blob;
}

export async function uploadMedia(file: File): Promise<MediaItem> {
  const isVideo = file.type.startsWith("video/");
  if (!isVideo && !file.type.startsWith("image/")) throw new Error(`${file.name} is not a photo or video.`);
  let body: Blob = file;
  let name = file.name;
  if (isVideo) {
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`${file.name} is over ${MAX_VIDEO_MB} MB. Trim it or record a shorter clip.`);
  } else {
    body = await shrinkPhoto(file);
    if (body !== file) name = `${name.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
    if (body.size > MAX_PHOTO_MB * 1024 * 1024) throw new Error(`${file.name} is over ${MAX_PHOTO_MB} MB.`);
  }
  const form = new FormData();
  form.set("file", body, name);
  return apiRequest<MediaItem>("/api/v1/media", { method: "POST", body: form });
}
