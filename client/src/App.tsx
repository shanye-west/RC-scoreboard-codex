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
import { AuthProvider } from "@/hooks/use-auth";
import { useState, useEffect } from "react";

function Router() {
  const [socket, setSocket] = useState<WebSocket | null>(null);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [window.location.pathname]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    // Function to create and setup the WebSocket connection
    const setupWebSocket = () => {
      try {
        // Create WebSocket connection with explicit path
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        // Close existing connection if any
        if (ws) {
          ws.close();
        }

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log("WebSocket connection established");
          // Clear reconnect timer if connection is successful
          if (reconnectTimer) {
            window.clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          setSocket(ws);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            // Handle different message types
            switch (message.type) {
              case "score-updated":
              case "score-created":
                // Invalidate score queries
                queryClient.invalidateQueries({
                  queryKey: [`/api/scores?matchId=${message.data.matchId}`],
                });
                break;

              case "match-updated":
                // Invalidate match queries
                queryClient.invalidateQueries({
                  queryKey: [`/api/matches/${message.data.id}`],
                });
                queryClient.invalidateQueries({
                  queryKey: [`/api/matches?roundId=${message.data.roundId}`],
                });
                break;

              case "tournament-updated":
                // Invalidate tournament query
                queryClient.invalidateQueries({
                  queryKey: ["/api/tournament"],
                });
                break;
            }
          } catch (error) {
            console.error("Failed to parse WebSocket message:", error);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
        };

        ws.onclose = (event) => {
          console.log(`WebSocket connection closed with code ${event.code}`);
          setSocket(null);

          // Attempt to reconnect after 3 seconds
          if (!reconnectTimer) {
            reconnectTimer = window.setTimeout(() => {
              console.log("Attempting to reconnect WebSocket...");
              setupWebSocket();
            }, 3000);
          }
        };
      } catch (error) {
        console.error("Failed to setup WebSocket:", error);
        // Attempt to reconnect after 5 seconds in case of setup error
        if (!reconnectTimer) {
          reconnectTimer = window.setTimeout(() => {
            console.log("Attempting to reconnect WebSocket after error...");
            setupWebSocket();
          }, 5000);
        }
      }
    };

    // Initial setup
    setupWebSocket();

    // Clean up WebSocket connection and timers on unmount
    return () => {
      if (ws) {
        ws.close();
      }
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
    };
  }, []);

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
