export class ApiError extends Error {
  status: number;
  code: string;
  details: { field: string; message: string }[];

  constructor(message: string, status: number, code: string, details: { field: string; message: string }[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type ErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: { field?: string; message?: string }[];
  };
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  retry?: boolean;
};

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Try again.";
}

export function fieldErrors(error: unknown) {
  if (!(error instanceof ApiError)) return {};
  const mapped: Record<string, string> = {};
  for (const detail of error.details) {
    if (detail.field) mapped[detail.field] = detail.message;
  }
  return mapped;
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as ErrorBody | null;
  const details = (body?.error?.details ?? [])
    .filter((detail) => detail.field && detail.message)
    .map((detail) => ({ field: detail.field as string, message: detail.message as string }));
  return new ApiError(
    body?.error?.message ?? "The city service is unavailable.",
    response.status,
    body?.error?.code ?? "request_failed",
    details,
  );
}

async function requestRefresh(): Promise<string | null> {
  const base = import.meta.env.VITE_API_URL ?? "";
  const response = await fetch(`${base}/api/v1/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    accessToken = null;
    return null;
  }
  const body = (await response.json()) as { access_token?: string };
  accessToken = body.access_token ?? null;
  return accessToken;
}

export function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = requestRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = import.meta.env.VITE_API_URL ?? "";
  const headers: Record<string, string> = {};
  const isForm = options.body instanceof FormData;
  if (options.body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (options.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers,
    body: isForm ? (options.body as FormData) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const canRefresh =
    response.status === 401 && options.auth !== false && options.retry !== false && !path.startsWith("/api/v1/auth/");
  if (canRefresh) {
    const token = await refreshSession();
    if (token) return apiRequest<T>(path, { ...options, retry: false });
  }

  if (response.status === 204) return undefined as T;
  if (!response.ok) throw await readError(response);
  return response.json() as Promise<T>;
}

export function apiGet<T>(path: string) {
  return apiRequest<T>(path);
}
