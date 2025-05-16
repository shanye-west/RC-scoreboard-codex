import { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { storage } from "./storage";
import { z } from "zod";
import {
  insertScoreSchema,
  insertUserSchema,
  insertRoundSchema,
  insertMatchSchema,
  insertPlayerSchema,
  User,
  insertBestBallScoreSchema,
  insertBetSchema,
  insertBetTypeSchema,
  insertParlaySchema,
  insertLedgerEntrySchema,
} from "@shared/schema";
import { setupAuth, isAuthenticated, isAdmin, hashPassword } from "./auth";

/**
 * Debug helper to log and validate player IDs
 */
function validateAndLogId(id: any): number | null {
  console.log('Validating ID:', id, 'Type:', typeof id);

  // If it's already a number and not NaN, return it
  if (typeof id === 'number' && !isNaN(id)) {
    return id;
  }

  // Try to parse as integer
  try {
    const parsedId = parseInt(id);
    if (!isNaN(parsedId)) {
      return parsedId;
    }
  } catch (e) {
    console.log('Failed to parse ID:', e);
  }

  console.log('Invalid ID detected:', id);
  return null;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Health check endpoint for Autoscale Deployments
  app.get("/_health", (req, res) => {
    res.status(200).send("OK");
  });

  // Setup authentication
  setupAuth(app);
  
  // Initialize default bet types
  const initializeBetTypes = async () => {
    try {
      // Define the default bet types we want to ensure exist
      const defaultBetTypes = [
        {
          name: 'match_winner',
          description: 'Bet on which team wins a specific match',
          isActive: true,
        },
        {
          name: 'player_prop',
          description: 'Bet on whether a specific player will win, tie, or lose their match',
          isActive: true,
        },
        {
          name: 'round_winner',
          description: 'Bet on which team wins the most matches in a given round',
          isActive: true,
        },
        {
          name: 'over_under',
          description: 'Bet on whether a statistic will be over or under a specified value',
          isActive: true,
        },
        {
          name: 'parlay',
          description: 'Combine multiple bets for higher risk/reward',
          isActive: true,
        },
      ];
      
      // For each default bet type, check if it exists and create if not
      for (const betType of defaultBetTypes) {
        const existingType = await storage.getBetTypeByName(betType.name);
        if (!existingType) {
          await storage.createBetType(betType);
          console.log(`Created bet type: ${betType.name}`);
        }
      }
    } catch (error) {
      console.error("Error initializing bet types:", error);
    }
  };
  
  // Call the initialization function when the server starts
  initializeBetTypes();
  
  // Initialize the application data - can be called to repair data
  app.get("/api/initialize", async (req, res) => {
    try {
      await storage.initializeData();
      res.json({ success: true, message: "Application data initialized successfully" });
    } catch (error) {
      console.error("Initialization error:", error);
      res.status(500).json({ success: false, message: "Failed to initialize application data" });
    }
  });
  
  // Change password endpoint - requires authentication
  app.post('/api/change-password', isAuthenticated, async (req, res) => {
    try {
      const { newPassword } = req.body;
      
      // Validate new password (must be 4 digits)
      if (!newPassword || !/^\d{4}$/.test(newPassword)) {
        return res.status(400).json({ message: "PIN must be exactly 4 digits" });
      }
      
      // Get current user from session
      if (!req.user || !req.user.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      // Hash the new password
      const hashedPasscode = await hashPassword(newPassword);
      
      // Update the user with new password and mark first login complete
      const updatedUser = await storage.updateUser(req.user.id, { 
        passcode: hashedPasscode,
        needsPasswordChange: false
      });
      
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update PIN" });
      }
      
      return res.status(200).json({ message: "PIN updated successfully" });
    } catch (error) {
      console.error("Error changing PIN:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Setup WebSocket server for real-time updates with a specific path
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
  });

  wss.on("connection", (ws) => {
    console.log("WebSocket client connected");

    // Send an initial connection success message
    ws.send(
      JSON.stringify({
        type: "connection",
        data: { status: "connected", timestamp: new Date().toISOString() },
      }),
    );

    ws.on("message", (message) => {
      try {
        // Parse the message (will be used in future for client-to-server communication)
        const data = JSON.parse(message.toString());
        console.log("Received message:", data);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    });

    ws.on("close", () => {
      console.log("WebSocket client disconnected");
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  // Initialize the data
  await storage.initializeData();

  // Course API
  app.get("/api/courses", async (req, res) => {
    try {
      console.log("API: Fetching courses");
      const courses = await storage.getCourses();
      console.log("API: Courses fetched:", courses);
      res.json(courses);
    } catch (error) {
      console.error("Error fetching courses:", error);
      res.status(500).json({ message: "Failed to fetch courses" });
    }
  });
  
  // API to add course (for testing)
  app.post("/api/courses", async (req, res) => {
    try {
      console.log("API: Adding new course:", req.body);
      const course = await storage.createCourse(req.body);
      console.log("API: Course added:", course);
      res.status(201).json(course);
    } catch (error) {
      console.error("Error creating course:", error);
      res.status(500).json({ message: "Failed to create course" });
    }
  });

  // Broadcasting function for real-time updates
  const broadcast = (type: string, data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        // OPEN
        client.send(JSON.stringify({ type, data }));
      }
    });
  };

  // Tournament API
  app.get("/api/tournament", async (req, res) => {
    const tournament = await storage.getTournament();

    // If tournament exists, also calculate current scores to ensure they're up to date
    if (tournament) {
      const scores = await storage.calculateTournamentScores();
      // Return the actual calculated scores including pending scores
      res.json({ ...tournament, ...scores });
    } else {
      res.json(tournament);
    }
  });

  app.put("/api/tournament/:id", async (req, res) => {
    try {
      const tournamentId = parseInt(req.params.id);
      const tournament = await storage.getTournament();

      if (!tournament || tournament.id !== tournamentId) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      // For security, don't allow direct updates to scores - they should be calculated
      const { aviatorScore, producerScore, ...safeData } = req.body;

      const updatedTournament = await storage.updateTournament(
        tournamentId,
        safeData,
      );
      broadcast("tournament-updated", updatedTournament);
      return res.json(updatedTournament);
    } catch (error) {
      console.error("Tournament update error:", error);
      return res.status(500).json({ message: "Failed to update tournament" });
    }
  });

  // Rounds API
  app.get("/api/rounds", async (req, res) => {
    const rounds = await storage.getRounds();
    res.json(rounds);
  });

  app.get("/api/rounds/:id", async (req, res) => {
    const roundId = parseInt(req.params.id);
    const round = await storage.getRound(roundId);

    if (!round) {
      return res.status(404).json({ message: "Round not found" });
    }

    const scores = await storage.calculateRoundScores(roundId);
    // Return the actual calculated scores including pending scores
    res.json({ ...round, ...scores });
  });

  app.post("/api/rounds", async (req, res) => {
    try {
      const roundData = insertRoundSchema.parse(req.body);
      const round = await storage.createRound(roundData);
      broadcast("round-created", round);
      res.json(round);
    } catch (error) {
      console.error("Round creation error:", error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid round data", details: error.errors });
      }
      return res.status(500).json({ message: "Failed to create round" });
    }
  });

  app.put("/api/rounds/:id", async (req, res) => {
    try {
      const roundId = parseInt(req.params.id);
      const round = await storage.getRound(roundId);

      if (!round) {
        return res.status(404).json({ message: "Round not found" });
      }

      const updatedRound = await storage.updateRound(roundId, req.body);
      broadcast("round-updated", updatedRound);
      res.json(updatedRound);
    } catch (error) {
      console.error("Round update error:", error);
      return res.status(500).json({ message: "Failed to update round" });
    }
  });
  
  app.delete("/api/rounds/:id", isAdmin, async (req, res) => {
    try {
      const roundId = parseInt(req.params.id);
      const round = await storage.getRound(roundId);

      if (!round) {
        return res.status(404).json({ message: "Round not found" });
      }

      // Delete the round - this will cascade delete all related matches, scores and match participants
      await storage.deleteRound(roundId);
      
      // Update tournament scores after round deletion
      const updatedTournament = await storage.getTournament();
      if (updatedTournament) {
        broadcast("tournament-updated", updatedTournament);
      }
      
      return res.status(200).json({ message: "Round deleted successfully" });
    } catch (error) {
      console.error("Round deletion error:", error);
      return res.status(500).json({ message: "Failed to delete round" });
    }
  });

  // Matches API
  app.get("/api/matches", async (req, res) => {
    const roundId = req.query.roundId
      ? parseInt(req.query.roundId as string)
      : undefined;

    if (roundId) {
      const matches = await storage.getMatchesByRound(roundId);
      res.json(matches);
    } else {
      const matches = await storage.getMatches();
      res.json(matches);
    }
  });

  app.get("/api/matches/:id", async (req, res) => {
    const matchId = parseInt(req.params.id);
    // Use getMatchWithParticipants instead of getMatch to get all player info
    const match = await storage.getMatchWithParticipants(matchId);
    // GET /api/matches/:id/scores
    app.get("/api/matches/:id/scores", async (req, res, next) => {
      try {
        const matchId = Number(req.params.id);
        if (isNaN(matchId)) {
          return res.status(400).json({ message: "Invalid match id" });
        }
        const allScores = await storage.getScoresByMatch(matchId);
        res.json(allScores);
      } catch (err) {
        next(err);
      }
    });

    if (!match) {
      return res.status(404).json({ message: "Match not found" });
    }

    res.json(match);
  });

  app.post("/api/matches", async (req, res) => {
    try {
      const matchData = insertMatchSchema.parse(req.body);
      const match = await storage.createMatch(matchData);
      broadcast("match-created", match);
      res.status(201).json(match);
    } catch (error) {
      console.error("Match creation error:", error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid match data", details: error.errors });
      }
      return res.status(500).json({ message: "Failed to create match" });
    }
  });

  app.put("/api/matches/:id", async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      const match = await storage.getMatch(matchId);

      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }

      const updatedMatch = await storage.updateMatch(matchId, req.body);
      broadcast("match-updated", updatedMatch);
      res.json(updatedMatch);
    } catch (error) {
      console.error("Match update error:", error);
      return res.status(500).json({ message: "Failed to update match" });
    }
  });
  
  app.delete("/api/matches/:id", isAdmin, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      const match = await storage.getMatch(matchId);

      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }

      const roundId = match.roundId; // Save roundId before deleting the match

      // Delete the match
      await storage.deleteMatch(matchId);

      // Update round scores
      const updatedRound = await storage.getRound(roundId);
      if (updatedRound) {
        broadcast("round-updated", updatedRound);
      }

      // Update tournament scores
      const updatedTournament = await storage.getTournament();
      if (updatedTournament) {
        broadcast("tournament-updated", updatedTournament);
      }

      // Add roundId to broadcast to help clients better handle the update
      broadcast("match-deleted", { id: matchId, roundId });
      return res.status(200).json({ message: "Match deleted successfully" });
    } catch (error) {
      console.error("Match deletion error:", error);
      return res.status(500).json({ message: "Failed to delete match" });
    }
  });

  // Scores API
  app.get("/api/scores", async (req, res) => {
    const matchId = req.query.matchId
      ? parseInt(req.query.matchId as string)
      : undefined;

    if (matchId) {
      const scores = await storage.getScoresByMatch(matchId);
      res.json(scores);
    } else {
      const scores = await storage.getScores();
      res.json(scores);
    }
  });
  
  // Player Scores API
  app.get("/api/player-scores", async (req, res) => {
    const matchId = req.query.matchId
      ? parseInt(req.query.matchId as string)
      : undefined;
    const playerId = req.query.playerId
      ? parseInt(req.query.playerId as string)
      : undefined;

    if (matchId && playerId) {
      const scores = await storage.getPlayerScoresByPlayerAndMatch(playerId, matchId);
      res.json(scores);
    } else if (matchId) {
      const scores = await storage.getPlayerScoresByMatch(matchId);
      res.json(scores);
    } else if (playerId) {
      const scores = await storage.getPlayerScoresByPlayer(playerId);
      res.json(scores);
    } else {
      const scores = await storage.getPlayerScores();
      res.json(scores);
    }
  });

  app.post("/api/player-scores", async (req, res) => {
    try {
      // Validate player score data
      const schema = z.object({
        playerId: z.number(),
        matchId: z.number(),
        holeNumber: z.number(),
        score: z.number(),
        tournamentId: z.number().optional(),
      });
      const playerScoreData = schema.parse(req.body);

      // Check if player score already exists
      const existingPlayerScore = await storage.getPlayerScore(
        playerScoreData.playerId,
        playerScoreData.matchId,
        playerScoreData.holeNumber
      );

      let result;
      if (existingPlayerScore) {
        // Update existing score
        result = await storage.updatePlayerScore(existingPlayerScore.id, playerScoreData);
      } else {
        // Create new score
        result = await storage.createPlayerScore(playerScoreData);
      }

      // Broadcast player score update
      broadcast("player-score-updated", result);
      
      res.json(result);
    } catch (error) {
      console.error("Error processing player score:", error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid player score data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to save player score" });
    }
  });

  app.put("/api/player-scores/:id", async (req, res) => {
    try {
      const playerScoreId = parseInt(req.params.id);
      
      // Validate player score data
      const schema = z.object({
        playerId: z.number().optional(),
        matchId: z.number().optional(),
        holeNumber: z.number().optional(),
        score: z.number(),
        tournamentId: z.number().optional(),
      });
      const playerScoreData = schema.parse(req.body);

      // Update the player score
      const updatedPlayerScore = await storage.updatePlayerScore(playerScoreId, playerScoreData);
      
      if (!updatedPlayerScore) {
        return res.status(404).json({ message: "Player score not found" });
      }

      // Broadcast player score update
      broadcast("player-score-updated", updatedPlayerScore);
      
      // Return all player scores for this match to ensure frontend has all data
      const allPlayerScores = await storage.getPlayerScoresByMatch(updatedPlayerScore.matchId);
      res.json(allPlayerScores);
    } catch (error) {
      console.error("Error updating player score:", error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid player score data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update player score" });
    }
  });
  
  app.delete("/api/player-scores/:id", async (req, res) => {
    try {
      const playerScoreId = parseInt(req.params.id);
      
      // Get the player score before deleting it to get the matchId for broadcasting
      const playerScore = await storage.getPlayerScoreById(playerScoreId);
      
      if (!playerScore) {
        return res.status(404).json({ message: "Player score not found" });
      }
      
      const matchId = playerScore.matchId;
      
      // Delete the player score
      const result = await storage.deletePlayerScore(playerScoreId);
      
      if (!result) {
        return res.status(500).json({ message: "Failed to delete player score" });
      }
      
      // Broadcast that the player score was deleted
      broadcast("player-score-deleted", { id: playerScoreId, matchId });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting player score:", error);
      res.status(500).json({ message: "Failed to delete player score" });
    }
  });

  app.post("/api/scores", async (req, res) => {
    try {
      // Flexible validation
      const schema = z.object({
        matchId: z.number(),
        holeNumber: z.number(),
        aviatorScore: z.number().nullable(),
        producerScore: z.number().nullable(),
      });
      const scoreData = schema.parse(req.body);

      // Check if score already exists
      const existingScore = await storage.getScore(
        scoreData.matchId,
        scoreData.holeNumber,
      );

      // Use a single variable for result
      let resultScore;

      if (existingScore) {
        // Update existing score with automatic match state update
        resultScore = await storage.updateScoreAndMatch(existingScore.id, scoreData);
        broadcast("score-updated", resultScore);
      } else {
        // Create new score with automatic match state update
        resultScore = await storage.createScoreAndMatch(scoreData);
        broadcast("score-created", resultScore);
      }

      // Get the updated match after state changes
      const updatedMatch = await storage.getMatch(scoreData.matchId);
      if (updatedMatch) {
        broadcast("match-updated", updatedMatch);
      }

      // Get updated round scores
      if (updatedMatch) {
        const round = await storage.getRound(updatedMatch.roundId);
        if (round) {
          const roundScores = await storage.calculateRoundScores(updatedMatch.roundId);
          // Include actual pending scores in the broadcast
          broadcast("round-updated", { ...round, ...roundScores });
        }
      }

      // Get updated tournament score
      const tournament = await storage.getTournament();
      if (tournament) broadcast("tournament-updated", tournament);

      // Fetch and return all scores for the match
      const allScores = await storage.getScoresByMatch(resultScore.matchId);
      return res.json(allScores);
    } catch (error) {
      console.error("Error processing score update:", error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid score data", errors: error.errors });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/scores/:id", async (req, res) => {
    try {
      const scoreId = parseInt(req.params.id);

      // Use the same flexible validation approach
      const schema = z.object({
        matchId: z.number().optional(),
        holeNumber: z.number().optional(),
        aviatorScore: z.number().nullable().optional(),
        producerScore: z.number().nullable().optional(),
      });

      const scoreData = schema.parse(req.body);

      // Use the updateScoreAndMatch method that automatically updates match state
      const updatedScore = await storage.updateScoreAndMatch(scoreId, scoreData);

      if (!updatedScore) {
        return res.status(404).json({ message: "Score not found" });
      }

      // Get updated match to broadcast
      const match = await storage.getMatch(updatedScore.matchId);

      // Broadcast updates
      broadcast("score-updated", updatedScore);
      if (match) {
        broadcast("match-updated", match);

        // Also get and broadcast updated round scores
        const round = await storage.getRound(match.roundId);
        if (round) {
          const roundScores = await storage.calculateRoundScores(match.roundId);
          // Include actual pending scores in the broadcast
          broadcast("round-updated", { ...round, ...roundScores });
        }
      }

      // Get updated tournament score
      const tournament = await storage.getTournament();
      if (tournament) broadcast("tournament-updated", tournament);

      // Return the full list of scores for this match to ensure frontend has all data
      const allScores = await storage.getScoresByMatch(updatedScore.matchId);
      res.json(allScores);
    } catch (error) {
      console.error("Error processing score update:", error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid score data", errors: error.errors });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Holes API
  app.get("/api/holes", async (req, res) => {
    const courseId = req.query.courseId
      ? parseInt(req.query.courseId as string)
      : undefined;
    
    if (courseId) {
      // Filter holes by courseId if provided
      const holes = await storage.getHolesByCourse(courseId);
      res.json(holes);
    } else {
      // Return all holes if no courseId filter
      const holes = await storage.getHoles();
      res.json(holes);
    }
  });

  // Teams API
  app.get("/api/teams", async (req, res) => {
    const teams = await storage.getTeams();
    res.json(teams);
  });

  app.get("/api/teams/:id", async (req, res) => {
    const teamId = parseInt(req.params.id);
    const team = await storage.getTeam(teamId);

    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    res.json(team);
  });

  // Teams don't have an update feature in this version
  app.put("/api/teams/:id", async (req, res) => {
    return res.status(501).json({ message: "Team update not implemented" });
  });

  // Players API
  app.get("/api/players", async (req, res) => {
    const teamId = req.query.teamId
      ? parseInt(req.query.teamId as string)
      : undefined;

    // Since getPlayersByTeam doesn't exist in this version, we'll filter the players manually
    const allPlayers = await storage.getPlayers();
    
    if (teamId) {
      const filteredPlayers = allPlayers.filter(player => player.teamId === teamId);
      res.json(filteredPlayers);
    } else {
      res.json(allPlayers);
    }
  });

  app.post("/api/players", async (req, res) => {
    try {
      // Validate with our custom schema
      const playerData = insertPlayerSchema.parse(req.body);
      
      // Create the player
      const player = await storage.createPlayer(playerData);
      broadcast("player-created", player);
      res.status(201).json(player);
    } catch (error) {
      console.error("Player creation error:", error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid player data", details: error.errors });
      }
      return res.status(500).json({ message: "Failed to create player" });
    }
  });

  app.put("/api/players/:id", async (req, res) => {
    try {
      const playerId = parseInt(req.params.id);
      const player = await storage.getPlayer(playerId);

      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      const updatedPlayer = await storage.updatePlayer(playerId, req.body);
      broadcast("player-updated", updatedPlayer);
      return res.json(updatedPlayer);
    } catch (error) {
      console.error("Player update error:", error);
      return res.status(500).json({ message: "Failed to update player" });
    }
  });
  
  app.delete("/api/players/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const playerId = parseInt(req.params.id);
      
      // Check if player exists
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      
      // Delete player (which will cascade delete associated user)
      const result = await storage.deletePlayer(playerId);
      
      // Notify clients of deletion
      if (result) {
        broadcast("player-deleted", { id: playerId });
      }
      
      return res.status(200).json({ success: result });
    } catch (error) {
      console.error("Player deletion error:", error);
      return res.status(500).json({ message: "Failed to delete player" });
    }
  });
  
  // Match Players API
  app.get("/api/match-players", async (req, res) => {
    const matchId = req.query.matchId
      ? parseInt(req.query.matchId as string)
      : undefined;
    const roundId = req.query.roundId
      ? parseInt(req.query.roundId as string)
      : undefined;
    
    if (!matchId && !roundId) {
      return res.status(400).json({ message: "Either matchId or roundId query parameter is required" });
    }
    
    if (matchId) {
      const matchPlayers = await storage.getMatchParticipants(matchId);
      return res.json(matchPlayers);
    } else if (roundId) {
      // Get all matches in this round
      const matches = await storage.getMatchesByRound(roundId);
      
      // Get players for each match
      const playersInRound = [];
      for (const match of matches) {
        const matchPlayers = await storage.getMatchParticipants(match.id);
        playersInRound.push(...matchPlayers);
      }
      
      return res.json(playersInRound);
    }
  });
  
  app.post("/api/match-players", async (req, res) => {
    try {
      const playerData = {
        matchId: req.body.matchId,
        playerId: req.body.playerId,
        team: req.body.team,
      };
      
      const matchPlayer = await storage.createMatchParticipant(playerData);
      
      // Get the updated match
      const match = await storage.getMatchWithParticipants(matchPlayer.matchId);
      if (match) {
        broadcast("match-updated", match);
      }
      
      res.status(201).json(matchPlayer);
    } catch (error) {
      console.error("Match player creation error:", error);
      return res.status(500).json({ message: "Failed to create match player" });
    }
  });

  // Best Ball Score API
  app.post('/api/best-ball-scores', async (req, res) => {
    try {
      const score = insertBestBallScoreSchema.parse(req.body);
      const result = await storage.saveBestBallScore(score);
      
      // Broadcast the update
      broadcast("best-ball-score-updated", result[0]);
      
      res.json(result[0]);
    } catch (error) {
      console.error('Error saving best ball score:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid score data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to save score' });
    }
  });

  app.get('/api/best-ball-scores/:matchId', async (req, res) => {
    try {
      const matchId = parseInt(req.params.matchId);
      if (isNaN(matchId)) {
        return res.status(400).json({ error: 'Invalid match ID' });
      }
      const scores = await storage.getBestBallScores(matchId);
      res.json(scores);
    } catch (error) {
      console.error('Error fetching best ball scores:', error);
      res.status(500).json({ error: 'Failed to fetch scores' });
    }
  });

  app.delete('/api/best-ball-scores/:matchId/:playerId/:holeNumber', async (req, res) => {
    try {
      const matchId = parseInt(req.params.matchId);
      const playerId = parseInt(req.params.playerId);
      const holeNumber = parseInt(req.params.holeNumber);
      
      if (isNaN(matchId) || isNaN(playerId) || isNaN(holeNumber)) {
        return res.status(400).json({ error: 'Invalid parameters' });
      }
      
      await storage.deleteBestBallScore(matchId, playerId, holeNumber);
      
      // Broadcast the deletion
      broadcast("best-ball-score-deleted", { matchId, playerId, holeNumber });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting best ball score:', error);
      res.status(500).json({ error: 'Failed to delete score' });
    }
  });

  // ADMIN ROUTES - Protected by isAdmin middleware

  // Create a new admin user (special endpoint - only for initial admin setup)
  app.post("/api/admin/setup", async (req, res) => {
    try {
      // Check if any admin users already exist
      const users = await storage.getUsers();
      const admins = users.filter((user: User) => user.isAdmin);

      if (admins.length > 0) {
        return res.status(403).json({
          error: "Admin already exists, use the regular registration process",
        });
      }

      // Create the first admin user
      const userData = insertUserSchema.parse({
        ...req.body,
        isAdmin: true,
      });

      // Hash the password before storing it
      const hashedPasscode = await hashPassword(userData.passcode);
      const userDataWithHashedPasscode = {
        ...userData,
        passcode: hashedPasscode,
      };

      const user = await storage.createUser(userDataWithHashedPasscode);

      // Return sanitized user (without password)
      res.status(201).json({
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
      });
    } catch (error) {
      console.error("Admin setup error:", error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid user data", details: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // USER MANAGEMENT (Admin only)
  app.post("/api/admin/users", isAdmin, async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);

      // Hash the password before storing it
      const hashedPasscode = await hashPassword(userData.passcode);
      const userDataWithHashedPasscode = {
        ...userData,
        passcode: hashedPasscode,
      };

      const user = await storage.createUser(userDataWithHashedPasscode);

      res.status(201).json({
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
      });
    } catch (error) {
      console.error("User creation error:", error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid user data", details: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/users", isAdmin, async (req, res) => {
    try {
      const users = await storage.getUsers();
      // Sanitize user data (remove passwords)
      const sanitizedUsers = users.map((user: User) => ({
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
      }));
      res.json(sanitizedUsers);
    } catch (error) {
      console.error("Get users error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // TOURNAMENT MANAGEMENT (Admin only)
  app.post("/api/admin/tournament", isAdmin, async (req, res) => {
    try {
      const tournament = await storage.getTournament();

      if (tournament) {
        // Update existing tournament
        const updatedData = await storage.updateTournament(
          tournament.id,
          req.body,
        );
        broadcast("tournament-updated", updatedData);
        return res.json(updatedData);
      } else {
        // Create new tournament
        const tournamentData = req.body;
        const newTournament = await storage.createTournament(tournamentData);
        broadcast("tournament-created", newTournament);
        return res.status(201).json(newTournament);
      }
    } catch (error) {
      console.error("Tournament management error:", error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid tournament data", details: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ROUND MANAGEMENT (Admin only)
  app.post("/api/admin/rounds", isAdmin, async (req, res) => {
    try {
      const roundData = insertRoundSchema.parse(req.body);
      const round = await storage.createRound(roundData);
      broadcast("round-created", round);
      res.status(201).json(round);
    } catch (error) {
      console.error("Round creation error:", error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid round data", details: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/admin/rounds/:id", isAdmin, async (req, res) => {
    try {
      const roundId = parseInt(req.params.id);
      const round = await storage.getRound(roundId);

      if (!round) {
        return res.status(404).json({ error: "Round not found" });
      }

      const updatedRound = await storage.updateRound(roundId, req.body);
      broadcast("round-updated", updatedRound);
      res.json(updatedRound);
    } catch (error) {
      console.error("Round update error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // MATCH MANAGEMENT (Admin only)
  app.post("/api/admin/matches", isAdmin, async (req, res) => {
    try {
      const matchData = insertMatchSchema.parse(req.body);
      const match = await storage.createMatch(matchData);
      broadcast("match-created", match);
      res.status(201).json(match);
    } catch (error) {
      console.error("Match creation error:", error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid match data", details: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/admin/matches/:id", isAdmin, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      const match = await storage.getMatch(matchId);

      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      const updatedMatch = await storage.updateMatch(matchId, req.body);
      broadcast("match-updated", updatedMatch);
      res.json(updatedMatch);
    } catch (error) {
      console.error("Match update error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // PLAYER MANAGEMENT (Admin only)
  app.post("/api/admin/players", isAdmin, async (req, res) => {
    try {
      // Validate with our custom schema
      const playerData = insertPlayerSchema.parse(req.body);
      
      // Create the player
      const player = await storage.createPlayer(playerData);
      broadcast("player-created", player);
      res.status(201).json(player);
    } catch (error) {
      console.error("Player creation error:", error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid player data", details: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Delete all players - Must come BEFORE the specific ID endpoint to avoid route conflicts
  app.delete("/api/admin/players/all", isAdmin, async (req, res) => {
    try {
      // Use the storage interface to delete all players
      const result = await storage.deleteAllPlayers();
      
      if (result) {
        // Log success and broadcast
        console.log("Successfully deleted all players and associated users");
        broadcast("data-reset", { type: "players-deleted" });

        // Return success
        return res.status(200).json({ 
          message: "All players have been deleted" 
        });
      } else {
        return res.status(500).json({ 
          error: "Failed to delete all players" 
        });
      }
    } catch (error) {
      console.error("Delete all players error:", error);
      return res.status(500).json({ 
        error: "Failed to delete all players" 
      });
    }
  });
  
  // Delete specific player by ID - Must come AFTER the "all" endpoint
  app.delete("/api/admin/players/:id", isAdmin, async (req, res) => {
    try {
      const playerId = parseInt(req.params.id);
      
      // Check if player exists
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Delete player with cascading delete of user
      const result = await storage.deletePlayer(playerId);
      
      if (result) {
        broadcast("player-deleted", { id: playerId });
        return res.status(200).json({ success: true });
      } else {
        return res.status(500).json({ error: "Failed to delete player" });
      }
    } catch (error) {
      console.error("Player deletion error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // RESET AND DELETE OPERATIONS (Admin only)

  // Delete all rounds
  app.delete("/api/admin/rounds/all", isAdmin, async (req, res) => {
    try {
      // Use new deleteAllRounds method that properly removes rounds from the database
      await storage.deleteAllRounds();
      
      broadcast("data-reset", { type: "rounds-deleted" });
      res.status(200).json({ message: "All rounds have been deleted" });
    } catch (error) {
      console.error("Delete all rounds error:", error);
      return res.status(500).json({ error: "Failed to delete all rounds" });
    }
  });
  
  // Delete a single round
  app.delete("/api/admin/rounds/:id", isAdmin, async (req, res) => {
    try {
      const roundId = parseInt(req.params.id);
      const round = await storage.getRound(roundId);
      
      if (!round) {
        return res.status(404).json({ error: "Round not found" });
      }
      
      // Use the new deleteRound method to fully remove the round from the database
      await storage.deleteRound(roundId);
      
      // Recalculate tournament scores
      const tournamentScores = await storage.calculateTournamentScores();
      const tournament = await storage.getTournament();
      if (tournament) {
        await storage.updateTournament(tournament.id, tournamentScores);
      }
      
      broadcast("round-deleted", { id: roundId });
      res.status(200).json({ message: "Round has been deleted" });
    } catch (error) {
      console.error("Delete round error:", error);
      return res.status(500).json({ error: "Failed to delete round" });
    }
  });

  // Delete all matches
  app.delete("/api/admin/matches/all", isAdmin, async (req, res) => {
    try {
      // Delete all scores first (cascade delete)
      const scores = await storage.getScores();
      for (const score of scores) {
        await storage.updateScore(score.id, {
          matchId: score.matchId,
          aviatorScore: null,
          producerScore: null,
          winningTeam: null,
        });
      }

      // Delete all matches
      const matches = await storage.getMatches();
      for (const match of matches) {
        await storage.deleteMatch(match.id);
      }

      // Recalculate round scores
      const rounds = await storage.getRounds();
      for (const round of rounds) {
        const scores = await storage.calculateRoundScores(round.id);
        await storage.updateRound(round.id, { ...scores, isComplete: false });
      }

      // Recalculate tournament scores
      const tournamentScores = await storage.calculateTournamentScores();
      const tournament = await storage.getTournament();
      if (tournament) {
        await storage.updateTournament(tournament.id, tournamentScores);
      }

      broadcast("data-reset", { type: "matches-deleted" });
      res.status(200).json({ message: "All matches have been deleted" });
    } catch (error) {
      console.error("Delete all matches error:", error);
      return res.status(500).json({ error: "Failed to delete all matches" });
    }
  });

  // Delete all scores
  app.delete("/api/admin/scores/all", isAdmin, async (req, res) => {
    try {
      const scores = await storage.getScores();
      for (const score of scores) {
        await storage.updateScore(score.id, {
          matchId: score.matchId,
          aviatorScore: null,
          producerScore: null,
          winningTeam: null,
        });
      }

      // Reset match stats
      const matches = await storage.getMatches();
      for (const match of matches) {
        await storage.updateMatch(match.id, {
          currentHole: 1,
          leadingTeam: null,
          leadAmount: 0,
          result: null,
        });
      }

      // Recalculate round scores
      const rounds = await storage.getRounds();
      for (const round of rounds) {
        const { aviatorScore, producerScore } =
          await storage.calculateRoundScores(round.id);
        await storage.updateRound(round.id, {
          aviatorScore,
          producerScore,
        });
      }

      // Recalculate tournament scores
      const tournamentScores = await storage.calculateTournamentScores();
      const tournament = await storage.getTournament();
      if (tournament) {
        await storage.updateTournament(tournament.id, tournamentScores);
      }

      broadcast("data-reset", { type: "scores-deleted" });
      res.status(200).json({ message: "All scores have been deleted" });
    } catch (error) {
      console.error("Delete all scores error:", error);
      return res.status(500).json({ error: "Failed to delete all scores" });
    }
  });

  // Reset all rounds
  app.put("/api/admin/rounds/reset-all", isAdmin, async (req, res) => {
    try {
      const rounds = await storage.getRounds();
      for (const round of rounds) {
        await storage.updateRound(round.id, { isComplete: false });
      }

      broadcast("data-reset", { type: "rounds-reset" });
      res.status(200).json({ message: "All rounds have been reset" });
    } catch (error) {
      console.error("Reset all rounds error:", error);
      return res.status(500).json({ error: "Failed to reset all rounds" });
    }
  });

  // Reset all matches
  app.put("/api/admin/matches/reset-all", isAdmin, async (req, res) => {
    try {
      const matches = await storage.getMatches();
      for (const match of matches) {
        await storage.updateMatch(match.id, {
          status: "in_progress",
          currentHole: 1,
          leadingTeam: null,
          leadAmount: 0,
          result: null,
        });
      }

      // Also reset scores
      const scores = await storage.getScores();
      for (const score of scores) {
        await storage.updateScore(score.id, {
          matchId: score.matchId,
          aviatorScore: null,
          producerScore: null,
          winningTeam: null,
          matchStatus: null,
        });
      }

      // Recalculate round scores
      const rounds = await storage.getRounds();
      for (const round of rounds) {
        const scores = await storage.calculateRoundScores(round.id);
        await storage.updateRound(round.id, { ...scores, isComplete: false });
      }

      // Recalculate tournament scores
      const tournamentScores = await storage.calculateTournamentScores();
      const tournament = await storage.getTournament();
      if (tournament) {
        await storage.updateTournament(tournament.id, tournamentScores);
      }

      broadcast("data-reset", { type: "matches-reset" });
      res.status(200).json({ message: "All matches have been reset" });
    } catch (error) {
      console.error("Reset all matches error:", error);
      return res.status(500).json({ error: "Failed to reset all matches" });
    }
  });

  // Reset all player stats
  app.put("/api/admin/players/reset-all", isAdmin, async (req, res) => {
    try {
      const players = await storage.getPlayers();
      for (const player of players) {
        await storage.updatePlayer(player.id, { wins: 0, losses: 0, ties: 0 });
      }

      broadcast("data-reset", { type: "players-reset" });
      res
        .status(200)
        .json({ message: "All player statistics have been reset" });
    } catch (error) {
      console.error("Reset all player stats error:", error);
      return res
        .status(500)
        .json({ error: "Failed to reset all player statistics" });
    }
  });

  // Handicap System Routes

  // Update player's course handicap for a specific round
  app.put("/api/players/:id/course-handicap", isAdmin, async (req, res) => {
    try {
      const playerId = parseInt(req.params.id);
      const roundId = parseInt(req.body.roundId);
      const courseHandicap = parseInt(req.body.courseHandicap);
      
      if (isNaN(playerId) || isNaN(roundId) || isNaN(courseHandicap)) {
        return res.status(400).json({ 
          error: "Invalid parameters. Require playerId, roundId, and courseHandicap."
        });
      }
      
      // Store the course handicap
      const updatedHandicap = await storage.storePlayerCourseHandicap(
        playerId, 
        roundId, 
        courseHandicap
      );
      
      res.json(updatedHandicap);
    } catch (error) {
      console.error("Error updating player course handicap:", error);
      res.status(500).json({ error: "Failed to update player course handicap" });
    }
  });

  // Update course ratings
  app.put("/api/courses/:id/ratings", isAdmin, async (req, res) => {
    try {
      const courseId = parseInt(req.params.id);
      const { courseRating, slopeRating, par } = req.body;
      
      if (isNaN(courseId) || isNaN(courseRating) || isNaN(slopeRating) || isNaN(par)) {
        return res.status(400).json({ error: "Invalid course ratings data" });
      }
      
      const updatedCourse = await storage.updateCourseRatings(courseId, {
        courseRating,
        slopeRating,
        par
      });
      res.json(updatedCourse);
    } catch (error) {
      console.error("Error updating course ratings:", error);
      res.status(500).json({ error: "Failed to update course ratings" });
    }
  });

  // Update hole handicap rank
  app.put("/api/holes/:id/handicap-rank", isAdmin, async (req, res) => {
    try {
      const holeId = parseInt(req.params.id);
      const handicapRank = parseInt(req.body.handicapRank);
      
      if (isNaN(holeId) || isNaN(handicapRank) || handicapRank < 1 || handicapRank > 18) {
        return res.status(400).json({ error: "Invalid hole handicap rank data" });
      }
      
      const updatedHole = await storage.updateHoleHandicapRank(holeId, handicapRank);
      res.json(updatedHole);
    } catch (error) {
      console.error("Error updating hole handicap rank:", error);
      res.status(500).json({ error: "Failed to update hole handicap rank" });
    }
  });

  // Get player's course handicap for a specific round
  app.get("/api/rounds/:roundId/players/:playerId/handicap", async (req, res) => {
    try {
      const roundId = parseInt(req.params.roundId);
      const playerId = parseInt(req.params.playerId);
      
      if (isNaN(roundId) || isNaN(playerId)) {
        return res.status(400).json({ error: "Invalid roundId or playerId" });
      }
      
      const handicap = await storage.getPlayerCourseHandicap(playerId, roundId);
      res.json(handicap);
    } catch (error) {
      console.error("Error getting player course handicap:", error);
      res.status(500).json({ error: "Failed to get player course handicap" });
    }
  });
  
  // Get all player handicaps for a specific round
  app.get("/api/round-handicaps/:roundId", async (req, res) => {
    try {
      const roundId = parseInt(req.params.roundId);
      
      if (isNaN(roundId)) {
        return res.status(400).json({ error: "Invalid roundId" });
      }
      
      // Get the round to find the course
      const round = await storage.getRound(roundId);
      if (!round) {
        return res.status(404).json({ error: "Round not found" });
      }
      
      // Get all player handicaps for this round
      const handicaps = await storage.getAllPlayerCourseHandicaps(roundId);
      res.json(handicaps);
    } catch (error) {
      console.error("Error getting round handicaps:", error);
      res.status(500).json({ error: "Failed to get round handicaps" });
    }
  });

  // Get player's handicap strokes for a specific hole in a round
  app.get("/api/rounds/:roundId/players/:playerId/holes/:holeNumber/strokes", async (req, res) => {
    try {
      const roundId = parseInt(req.params.roundId);
      const playerId = parseInt(req.params.playerId);
      const holeNumber = parseInt(req.params.holeNumber);
      
      if (isNaN(roundId) || isNaN(playerId) || isNaN(holeNumber)) {
        return res.status(400).json({ error: "Invalid parameters" });
      }
      
      const strokes = await storage.getHoleHandicapStrokes(playerId, roundId, holeNumber);
      res.json({ strokes });
    } catch (error) {
      console.error("Error getting hole handicap strokes:", error);
      res.status(500).json({ error: "Failed to get hole handicap strokes" });
    }
  });

  // TOURNAMENT HISTORY AND PLAYER STATS

  // Get all tournament history entries
  app.get("/api/tournament-history", async (req, res) => {
    try {
      const history = await storage.getTournamentHistory();
      res.json(history);
    } catch (error) {
      console.error("Error getting tournament history:", error);
      res.status(500).json({ error: "Failed to get tournament history" });
    }
  });

  // Get specific tournament history entry
  app.get("/api/tournament-history/:id", async (req, res) => {
    try {
      const tournamentId = parseInt(req.params.id);
      
      if (isNaN(tournamentId)) {
        return res.status(400).json({ error: "Invalid tournament ID" });
      }
      
      const tournamentHistory = await storage.getTournamentHistoryEntry(tournamentId);
      
      if (!tournamentHistory) {
        return res.status(404).json({ error: "Tournament history not found" });
      }
      
      res.json(tournamentHistory);
    } catch (error) {
      console.error("Error getting tournament history entry:", error);
      res.status(500).json({ error: "Failed to get tournament history entry" });
    }
  });

  // Get player stats for a specific tournament
  app.get("/api/tournament-player-stats/:tournamentId", async (req, res) => {
    try {
      const tournamentId = parseInt(req.params.tournamentId);
      
      if (isNaN(tournamentId)) {
        return res.status(400).json({ error: "Invalid tournament ID" });
      }
      
      const playerStats = await storage.getTournamentPlayerStats(tournamentId);
      res.json(playerStats);
    } catch (error) {
      console.error("Error getting tournament player stats:", error);
      res.status(500).json({ error: "Failed to get tournament player stats" });
    }
  });

  // Get specific player's stats for a specific tournament
  app.get("/api/players/:playerId/tournament-stats/:tournamentId", async (req, res) => {
    try {
      const playerId = parseInt(req.params.playerId);
      const tournamentId = parseInt(req.params.tournamentId);
      
      if (isNaN(playerId) || isNaN(tournamentId)) {
        return res.status(400).json({ error: "Invalid player ID or tournament ID" });
      }
      
      const stats = await storage.getPlayerTournamentStats(playerId, tournamentId);
      
      if (!stats) {
        return res.status(404).json({ error: "Player tournament stats not found" });
      }
      
      res.json(stats);
    } catch (error) {
      console.error("Error getting player tournament stats:", error);
      res.status(500).json({ error: "Failed to get player tournament stats" });
    }
  });

  // Get player's career stats
  app.get("/api/players/:playerId/career-stats", async (req, res) => {
    try {
      const playerId = parseInt(req.params.playerId);
      
      if (isNaN(playerId)) {
        return res.status(400).json({ error: "Invalid player ID" });
      }
      
      const careerStats = await storage.getPlayerCareerStats(playerId);
      
      if (!careerStats) {
        return res.status(404).json({ error: "Player career stats not found" });
      }
      
      res.json(careerStats);
    } catch (error) {
      console.error("Error getting player career stats:", error);
      res.status(500).json({ error: "Failed to get player career stats" });
    }
  });

  // Get player's matchups against other players
  app.get("/api/players/:playerId/matchups", async (req, res) => {
    try {
      const playerId = parseInt(req.params.playerId);
      
      if (isNaN(playerId)) {
        return res.status(400).json({ error: "Invalid player ID" });
      }
      
      const matchups = await storage.getPlayerMatchups(playerId);
      res.json(matchups);
    } catch (error) {
      console.error("Error getting player matchups:", error);
      res.status(500).json({ error: "Failed to get player matchups" });
    }
  });

  // Get player's stats by match type
  app.get("/api/players/:playerId/match-type-stats", async (req, res) => {
    try {
      const playerId = parseInt(req.params.playerId);
      
      if (isNaN(playerId)) {
        return res.status(400).json({ error: "Invalid player ID" });
      }
      
      const matchTypeStats = await storage.getPlayerAllMatchTypeStats(playerId);
      res.json(matchTypeStats);
    } catch (error) {
      console.error("Error getting player match type stats:", error);
      res.status(500).json({ error: "Failed to get player match type stats" });
    }
  });

  // Admin: Update tournament history (recalculate and store current tournament statistics)
  app.post("/api/admin/tournament-history/update", isAdmin, async (req, res) => {
    try {
      const tournament = await storage.getTournament();
      
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      const updatedHistory = await storage.updateTournamentHistory(tournament.id);
      
      // Also update all player stats
      await storage.calculateAndUpdateAllPlayerStats(tournament.id);
      
      res.json(updatedHistory);
    } catch (error) {
      console.error("Error updating tournament history:", error);
      res.status(500).json({ error: "Failed to update tournament history" });
    }
  });

  // Sportsbook API endpoints
  
  // Bet Types API
  app.get('/api/bet-types', async (req, res) => {
    try {
      const betTypes = await storage.getBetTypes();
      res.json(betTypes);
    } catch (error) {
      console.error("Error getting bet types:", error);
      res.status(500).json({ message: "Failed to get bet types" });
    }
  });

  app.post('/api/bet-types', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const data = insertBetTypeSchema.parse(req.body);
      const result = await storage.createBetType(data);
      res.json(result);
    } catch (error) {
      console.error("Error creating bet type:", error);
      res.status(500).json({ message: "Failed to create bet type" });
    }
  });

  // Bets API
  app.get('/api/bets', isAuthenticated, async (req, res) => {
    try {
      let bets;
      
      // Admin can see all bets, users can only see their own
      if (req.user.isAdmin) {
        bets = await storage.getBets();
      } else {
        bets = await storage.getUserBets(req.user.id);
      }
      
      res.json(bets);
    } catch (error) {
      console.error("Error getting bets:", error);
      res.status(500).json({ message: "Failed to get bets" });
    }
  });

  app.get('/api/bets/user', isAuthenticated, async (req, res) => {
    try {
      const bets = await storage.getUserBets(req.user.id);
      res.json(bets);
    } catch (error) {
      console.error("Error getting user bets:", error);
      res.status(500).json({ message: "Failed to get user bets" });
    }
  });

  app.get('/api/bets/match/:matchId', isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.matchId);
      const bets = await storage.getBetsByMatch(matchId);
      res.json(bets);
    } catch (error) {
      console.error("Error getting match bets:", error);
      res.status(500).json({ message: "Failed to get match bets" });
    }
  });

  app.get('/api/bets/round/:roundId', isAuthenticated, async (req, res) => {
    try {
      const roundId = parseInt(req.params.roundId);
      const bets = await storage.getBetsByRound(roundId);
      res.json(bets);
    } catch (error) {
      console.error("Error getting round bets:", error);
      res.status(500).json({ message: "Failed to get round bets" });
    }
  });

  app.post('/api/bets', isAuthenticated, async (req, res) => {
    try {
      // Ensure user is placing bet for themselves (unless admin)
      const data = {
        ...insertBetSchema.parse(req.body),
        userId: req.user.id, // Always use the authenticated user's ID
      };
      
      // Calculate potential payout based on odds
      if (data.amount && data.odds) {
        const amount = parseFloat(data.amount.toString());
        const odds = parseFloat(data.odds.toString());
        data.potentialPayout = (amount * odds).toString();
      }
      
      const result = await storage.createBet(data);
      res.json(result);
    } catch (error) {
      console.error("Error creating bet:", error);
      res.status(500).json({ message: "Failed to create bet" });
    }
  });

  app.post('/api/bets/:id/settle', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const betId = parseInt(req.params.id);
      const { status, actualResult } = req.body;
      
      // Only admins can settle bets
      const result = await storage.settleBet(betId, status, actualResult, req.user.id);
      res.json(result);
    } catch (error) {
      console.error("Error settling bet:", error);
      res.status(500).json({ message: "Failed to settle bet" });
    }
  });

  // Parlay API
  app.post('/api/parlays', isAuthenticated, async (req, res) => {
    try {
      const { betIds, ...parlayData } = req.body;
      const data = {
        ...insertParlaySchema.parse(parlayData),
        userId: req.user.id, // Always use the authenticated user's ID
      };
      
      const result = await storage.createParlay(data, betIds);
      res.json(result);
    } catch (error) {
      console.error("Error creating parlay:", error);
      res.status(500).json({ message: "Failed to create parlay" });
    }
  });

  app.get('/api/parlays', isAuthenticated, async (req, res) => {
    try {
      let parlays;
      
      // Admin can see all parlays, users can only see their own
      if (req.user.isAdmin) {
        parlays = await storage.getParlays();
      } else {
        parlays = await storage.getUserParlays(req.user.id);
      }
      
      res.json(parlays);
    } catch (error) {
      console.error("Error getting parlays:", error);
      res.status(500).json({ message: "Failed to get parlays" });
    }
  });

  // Ledger API
  app.get('/api/ledger', isAuthenticated, async (req, res) => {
    try {
      let entries;
      
      // Admin can see all ledger entries, users can only see their own
      if (req.user.isAdmin) {
        entries = await storage.getLedgerEntries();
      } else {
        entries = await storage.getUserLedgerEntries(req.user.id);
      }
      
      res.json(entries);
    } catch (error) {
      console.error("Error getting ledger entries:", error);
      res.status(500).json({ message: "Failed to get ledger entries" });
    }
  });

  app.get('/api/ledger/balance', isAuthenticated, async (req, res) => {
    try {
      const balance = await storage.getUserBalance(req.user.id);
      res.json(balance);
    } catch (error) {
      console.error("Error getting user balance:", error);
      res.status(500).json({ message: "Failed to get user balance" });
    }
  });

  return httpServer;
}
