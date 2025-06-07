import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

type RequestOptions = {
  on401?: "throw" | "returnNull";
};

export async function apiRequest(
  method: string,
  url: string,
  data?: any,
  options: RequestOptions = {}
) {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    credentials: "include",
    body: data ? JSON.stringify(data) : undefined,
  });

  if (response.status === 401) {
    if (options.on401 === "returnNull") {
      return null;
    }
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response;
}

export function getQueryFn(options: RequestOptions = {}) {
  return async ({ queryKey }: { queryKey: string[] }) => {
    const response = await apiRequest("GET", queryKey[0], undefined, options);
    if (!response) return null;
    return response.json();
  };
}
