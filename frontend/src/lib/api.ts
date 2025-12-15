export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export const apiUrl = (path: string): string => {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
};