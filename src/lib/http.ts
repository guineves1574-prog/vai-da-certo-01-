import { AppError } from "../core/errors";

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    const text = await response.text();
    throw new AppError(`HTTP ${response.status} for ${url}: ${text}`, response.status);
  }

  return (await response.json()) as T;
}
