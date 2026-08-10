import { useEffect, useState } from "react";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

interface AuthUser {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface UseAuthResult {
  user: AuthUser | null;
  loading: boolean;
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/auth/me`, { credentials: "include" })
      .then((res) => res.json())
      .then((data: { user: AuthUser | null }) => {
        setUser(data.user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return { user, loading };
}
