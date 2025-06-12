import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Round from "@/pages/Round";
import Match from "@/pages/Match";
import Teams from "@/pages/Teams";
import AuthPage from "@/pages/AuthPage";
import AdminPlayersPage from "@/pages/AdminPlayersPage";
import LoginPage from "@/pages/Login";
import SetPinPage from "@/pages/SetPin";
import TestCourses from "@/pages/TestCourses";
import TournamentHistory from "@/pages/TournamentHistory";
import Sportsbook from "@/pages/Sportsbook";
import Layout from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useRef } from "react";

function Router() {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [window.location.pathname]);

  useEffect(() => {
    if (!user?.token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const isDev = import.meta.env.DEV;

    // Log the values to understand the wsUrl construction
    console.log('[App.tsx] WebSocket connection attempt details:');
    console.log('[App.tsx] import.meta.env.DEV:', isDev);
    console.log('[App.tsx] window.location.host:', window.location.host);

    const host = isDev ? 'localhost:3000' : window.location.host;
    const wsUrl = `${protocol}//${host}/ws?token=${user.token}`;
    
    console.log('[App.tsx] Constructed application wsUrl:', wsUrl);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);

        switch (message.type) {
          case 'connection-success':
            console.log('Connection authenticated:', message.user);
            break;
          case 'pong':
            // Handle pong response
            break;
          default:
            console.warn('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      
      // Attempt to reconnect on specific error codes
      if (event.code === 1006 || event.code === 1008) {
        console.log('Attempting to reconnect...');
        setTimeout(() => {
          if (wsRef.current === ws) {
            wsRef.current = null;
            // The useEffect will trigger a new connection
          }
        }, 1000);
      }
    };

    // Cleanup function
    return () => {
      if (wsRef.current === ws) {
        ws.close();
        wsRef.current = null;
      }
    };
  }, [user?.token]); // Reconnect when token changes

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/rounds/:id">
        {(params) => <Round id={parseInt(params.id)} />}
      </Route>
      <Route path="/matches/:id">
        {(params) => <Match id={parseInt(params.id)} />}
      </Route>
      <Route path="/teams" component={Teams} />
      <Route path="/history" component={TournamentHistory} />
      <Route path="/sportsbook" component={Sportsbook} />
      <Route path="/login" component={LoginPage} />
      <Route path="/set-pin" component={SetPinPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/test-courses" component={TestCourses} />
      <ProtectedRoute path="/admin/players" component={AdminPlayersPage} adminOnly={true} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Layout>
            <Router />
          </Layout>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
