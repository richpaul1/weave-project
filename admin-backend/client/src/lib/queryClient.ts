import { QueryClient } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<any> {
  console.log(`🌐 API Request: ${method} ${url}`);
  console.log('📤 Request data:', data);

  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  console.log(`📡 Response status: ${res.status} ${res.statusText}`);
  console.log('📥 Response headers:', Object.fromEntries(res.headers.entries()));

  await throwIfResNotOk(res);

  const responseData = await res.json();
  console.log('📋 Response data:', responseData);
  console.log('📊 Response data structure:', {
    type: typeof responseData,
    isArray: Array.isArray(responseData),
    keys: typeof responseData === 'object' ? Object.keys(responseData) : 'N/A'
  });

  return responseData;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn =
  <T>({ on401: unauthorizedBehavior }: { on401: UnauthorizedBehavior }) =>
  async ({ queryKey }: { queryKey: readonly unknown[] }): Promise<T> => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as T;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
