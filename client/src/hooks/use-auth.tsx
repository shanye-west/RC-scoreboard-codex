import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type User = {
  id: number;
  username: string;
  isAdmin: boolean;
  needsPasswordChange?: boolean;
  token?: string;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  loginMutation: UseMutationResult<User, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
};

type LoginData = {
  username: string;
  password: string;
};

export const AuthContext = createContext<AuthContextType | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: authData,
    error,
    isLoading,
  } = useQuery<{authenticated: boolean, user?: User} | null, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const user = authData?.authenticated ? authData.user || null : null;
  const isAuthenticated = Boolean(user);
  const isAdmin = Boolean(user?.isAdmin);

  // Store token in localStorage when user logs in
  const storeToken = (token: string) => {
    localStorage.setItem('auth_token', token);
  };

  // Clear token from localStorage when user logs out
  const clearToken = () => {
    localStorage.removeItem('auth_token');
  };

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      // Transform password to passcode for backend compatibility
      const loginData = {
        username: credentials.username,
        passcode: credentials.password
      };
      const res = await apiRequest("POST", "/api/login", loginData);
      if (!res) throw new Error("Login failed");
      const data = await res.json();
      if (data.user?.token) {
        storeToken(data.user.token);
      }
      return data.user; // Return the user object from the response
    },
    onSuccess: (user: User) => {
      queryClient.setQueryData(["/api/user"], { authenticated: true, user });
      toast({
        title: "Logged in successfully",
        description: `Welcome back, ${user.username}`,
        duration: 1000,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
        duration: 1000,
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
      clearToken();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], { authenticated: false, user: null });
      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
        duration: 1000,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
        duration: 1000,
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        isAdmin,
        isAuthenticated,
        loginMutation,
        logoutMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}