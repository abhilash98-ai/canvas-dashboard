export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Calls our server and returns its JSON, or throws an ApiError carrying the
// server's explanation. A 401 means "not logged in".
export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init).catch(() => {
    throw new ApiError("Can't reach the app's server. Is it running (npm run dev)?", 0);
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(body?.error ?? `The server returned ${response.status}.`, response.status);
  }
  return body as T;
}

export interface CurrentUser {
  name: string;
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return requestJson<CurrentUser>("/api/me");
}
