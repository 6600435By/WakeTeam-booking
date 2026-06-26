/** Fetch с cookie сессии — нужен для клиентских запросов с телефона. */
export function adminFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, credentials: "include" });
}
