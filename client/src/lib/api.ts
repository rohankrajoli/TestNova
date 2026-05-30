// In production, we use relative paths so Vercel handles the routing.
// In development, we default to localhost:5000.
export const API_URL = import.meta.env.PROD ? "" : "http://localhost:5000";

export type Role = "admin" | "student";

export type Session = {
  role: Role;
  name: string;
};

export const getSession = (): Session | null => {
  const role = sessionStorage.getItem("role") as Role | null;
  const name = sessionStorage.getItem("name");
  if (!role || !name) return null;
  return { role, name };
};

export const setSession = (session: Session) => {
  sessionStorage.setItem("role", session.role);
  sessionStorage.setItem("name", session.name);
};

export const logout = () => {
  sessionStorage.removeItem("role");
  sessionStorage.removeItem("name");
};

export const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
};
