import { apiGet, apiRequest } from "../../api/client";
import { assetUrl } from "../market/api";
import { PHOTO_ACCEPT } from "../media/api";

export type ShortStatus = "live" | "hidden";

export type Short = {
  id: string;
  kind: "user" | "ad";
  status: ShortStatus;
  caption: string;
  media_kind: "video" | "image";
  video_url: string;
  author_id: string;
  author_name: string;
  sponsor: string;
  cta_label: string;
  cta_url: string;
  views: number;
  clicks: number;
  like_count: number;
  liked: boolean;
  is_mine: boolean;
  created_at: string;
};

export type AdInput = { sponsor: string; cta_label: string; cta_url: string };

export const MAX_VIDEO_MB = 25;
export const MAX_PHOTO_MB = 8;
export const MAX_SECONDS = 60;
export const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";
export const SHORT_ACCEPT = `${PHOTO_ACCEPT},${VIDEO_ACCEPT}`;

export function videoSrc(url: string) {
  return assetUrl(url) ?? url;
}

export function shortsFeed() {
  return apiGet<{ data: Short[] }>("/api/v1/shorts/feed").then((body) => body.data);
}

export function myShorts() {
  return apiGet<{ data: Short[] }>("/api/v1/shorts/mine").then((body) => body.data);
}

export function managedShorts() {
  return apiGet<{ data: Short[] }>("/api/v1/shorts/manage").then((body) => body.data);
}

export function postShort(file: File, caption: string, ad?: AdInput) {
  const form = new FormData();
  form.set("caption", caption);
  form.set(file.type.startsWith("image/") ? "image" : "video", file);
  if (ad) {
    form.set("sponsor", ad.sponsor);
    form.set("cta_label", ad.cta_label);
    form.set("cta_url", ad.cta_url);
  }
  return apiRequest<Short>(ad ? "/api/v1/shorts/ads" : "/api/v1/shorts", { method: "POST", body: form });
}

export function setLiked(id: string, liked: boolean) {
  return apiRequest<Short>(`/api/v1/shorts/${encodeURIComponent(id)}/like`, { method: liked ? "PUT" : "DELETE" });
}

export function setShortStatus(id: string, status: ShortStatus) {
  return apiRequest<Short>(`/api/v1/shorts/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } });
}

export function removeShort(id: string) {
  return apiRequest<void>(`/api/v1/shorts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function recordView(id: string) {
  return apiRequest<void>(`/api/v1/shorts/${encodeURIComponent(id)}/view`, { method: "POST", auth: false }).catch(() => undefined);
}

export function recordClick(id: string) {
  return apiRequest<void>(`/api/v1/shorts/${encodeURIComponent(id)}/click`, { method: "POST", auth: false }).catch(() => undefined);
}
