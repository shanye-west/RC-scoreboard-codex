import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";

// Form schema for placing a bet
const betFormSchema = z.object({
  betTypeId: z.string(),
  description: z.string().min(3, "Description must be at least 3 characters"),
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  odds: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Odds must be a positive number",
  }),
  selectedOption: z.string().min(1, "You must select an option"),
  matchId: z.string().optional(),
  roundId: z.string().optional(),
  playerId: z.string().optional(),
  line: z.string().optional(),
});

// Format currency values
const formatCurrency = (value: string | number) => {
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(numValue);
};

export default function Sportsbook() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("my-bets");

  // Query for bet types
  const {
    data: betTypes,
    isLoading: isLoadingBetTypes,
    error: betTypesError,
  } = useQuery({
    queryKey: ["/api/bet-types"],
    enabled: true,
  });

  // Query for user's bets
  const {
    data: userBets,
    isLoading: isLoadingUserBets,
    error: userBetsError,
    refetch: refetchUserBets,
  } = useQuery({
    queryKey: ["/api/bets/user"],
    enabled: isAuthenticated,
  });

  // Query for matches (to populate bet options)
  const {
    data: matches,
    isLoading: isLoadingMatches,
    error: matchesError,
  } = useQuery({
    queryKey: ["/api/matches"],
    enabled: true,
  });

  // Query for rounds (to populate bet options)
  const {
    data: rounds,
    isLoading: isLoadingRounds,
    error: roundsError,
  } = useQuery({
    queryKey: ["/api/rounds"],
    enabled: true,
  });

  // Query for players (to populate bet options)
  const {
    data: players,
    isLoading: isLoadingPlayers,
    error: playersError,
  } = useQuery({
    queryKey: ["/api/players"],
    enabled: true,
  });

  // Query for user balance
  const {
    data: balance,
    isLoading: isLoadingBalance,
    error: balanceError,
    refetch: refetchBalance,
  } = useQuery({
    queryKey: ["/api/ledger/balance"],
    enabled: isAuthenticated,
  });

  // Form setup
  const form = useForm<z.infer<typeof betFormSchema>>({
    resolver: zodResolver(betFormSchema),
    defaultValues: {
      betTypeId: "",
      description: "",
      amount: "10",
      odds: "2.0",
      selectedOption: "",
      matchId: "",
      roundId: "",
      playerId: "",
      line: "",
    },
  });

  // Selected bet type
  const [selectedBetType, setSelectedBetType] = useState<any>(null);
  
  // Handle bet type change
  const handleBetTypeChange = (value: string) => {
    const betType = betTypes?.find((bt: any) => bt.id.toString() === value);
    setSelectedBetType(betType);
    
    // Reset form values that depend on bet type
    form.setValue("description", betType ? `${betType.description}` : "");
    form.setValue("selectedOption", "");
    form.setValue("matchId", "");
    form.setValue("roundId", "");
    form.setValue("playerId", "");
    form.setValue("line", "");
  };

  // Handle form submission for placing a bet
  const onSubmit = async (values: z.infer<typeof betFormSchema>) => {
    try {
      // Convert string IDs to numbers for API
      const payload = {
        betTypeId: parseInt(values.betTypeId),
        description: values.description,
        amount: values.amount,
        odds: values.odds,
        selectedOption: values.selectedOption,
        matchId: values.matchId ? parseInt(values.matchId) : undefined,
        roundId: values.roundId ? parseInt(values.roundId) : undefined,
        playerId: values.playerId ? parseInt(values.playerId) : undefined,
        line: values.line ? parseFloat(values.line) : undefined,
      };

      // Send API request to create bet
      const response = await apiRequest("POST", "/api/bets", payload);
      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Bet Placed Successfully",
          description: `Your bet has been recorded.`,
        });
        
        // Reset form & refetch data
        form.reset();
        refetchUserBets();
        refetchBalance();
        setActiveTab("my-bets");
      } else {
        toast({
          title: "Error Placing Bet",
          description: result.message || "Something went wrong",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error placing bet:", error);
      toast({
        title: "Error",
        description: "Failed to place bet. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Get bet status badge color
  const getBetStatusColor = (status: string) => {
    switch (status) {
      case "won":
        return "bg-green-500";
      case "lost":
        return "bg-red-500";
      case "push":
        return "bg-gray-500";
      case "cancelled":
        return "bg-orange-500";
      default:
        return "bg-blue-500";
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="container py-10">
        <Card>
          <CardHeader>
            <CardTitle>Sportsbook</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Please log in to access the sportsbook.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading =
    isLoadingBetTypes ||
    isLoadingUserBets ||
    isLoadingMatches ||
    isLoadingRounds ||
    isLoadingPlayers ||
    isLoadingBalance;

  if (isLoading) {
    return (
      <div className="container py-10">
        <Card>
          <CardHeader>
            <CardTitle>Sportsbook</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Sportsbook</h1>
      
      <Tabs defaultValue="available-bets" className="mt-6">
        <TabsList>
          <TabsTrigger value="available-bets">Available Bets</TabsTrigger>
          {isAuthenticated && (
            <>
              <TabsTrigger value="my-bets">My Bets</TabsTrigger>
              <TabsTrigger value="place-bet">Place Bet</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="available-bets">
          <Card>
            <CardHeader>
              <CardTitle>Available Bets</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingBetTypes ? (
                <p>Loading available bets...</p>
              ) : betTypesError ? (
                <p>Error loading bets. Please try again later.</p>
              ) : betTypes?.length === 0 ? (
                <p>No bets available at the moment.</p>
              ) : (
                <div className="space-y-4">
                  {betTypes?.map((betType: any) => (
                    <Card key={betType.id}>
                      <CardHeader>
                        <CardTitle>{betType.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p>{betType.description}</p>
                        <div className="mt-2">
                          <p className="font-semibold">Options:</p>
                          <ul className="list-disc list-inside">
                            {betType.options.map((option: string) => (
                              <li key={option}>{option}</li>
                            ))}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isAuthenticated && (
          <>
            <TabsContent value="my-bets" className="space-y-4">
              <h2 className="text-xl font-semibold">My Active Bets</h2>
              {userBets && userBets.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {userBets
                    .filter((bet: any) => bet.status === "pending")
                    .map((bet: any) => (
                      <Card key={bet.id} className="p-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <h3 className="font-medium">{bet.description}</h3>
                            <p className="text-sm text-muted-foreground">
                              Option: {bet.selectedOption}
                            </p>
                            <div className="flex items-center mt-1 gap-2">
                              <Badge className={getBetStatusColor(bet.status)}>
                                {bet.status}
                              </Badge>
                              <span className="text-sm">
                                Odds: {parseFloat(bet.odds).toFixed(2)}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm">
                              Wager: {formatCurrency(bet.amount)}
                            </p>
                            <p className="font-bold">
                              Potential: {formatCurrency(bet.potentialPayout)}
                            </p>
                          </div>
                        </div>
                      </Card>
                    ))}
                </div>
              ) : (
                <p>You don't have any active bets.</p>
              )}

              <h2 className="text-xl font-semibold mt-8">Bet History</h2>
              {userBets && userBets.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {userBets
                    .filter((bet: any) => bet.status !== "pending")
                    .map((bet: any) => (
                      <Card key={bet.id} className="p-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <h3 className="font-medium">{bet.description}</h3>
                            <p className="text-sm text-muted-foreground">
                              Option: {bet.selectedOption}
                            </p>
                            <div className="flex items-center mt-1 gap-2">
                              <Badge className={getBetStatusColor(bet.status)}>
                                {bet.status}
                              </Badge>
                              <span className="text-sm">
                                Odds: {parseFloat(bet.odds).toFixed(2)}
                              </span>
                            </div>
                            {bet.actualResult && (
                              <p className="text-sm mt-1">
                                Result: {bet.actualResult}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-sm">
                              Wager: {formatCurrency(bet.amount)}
                            </p>
                            {bet.status === "won" ? (
                              <p className="font-bold text-green-600">
                                Won: {formatCurrency(bet.potentialPayout)}
                              </p>
                            ) : (
                              <p className="font-medium">
                                Potential: {formatCurrency(bet.potentialPayout)}
                              </p>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                </div>
              ) : (
                <p>You don't have any past bets.</p>
              )}
            </TabsContent>

            <TabsContent value="place-bet">
              <Card>
                <CardHeader>
                  <CardTitle>Place a Bet</CardTitle>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form
                      onSubmit={form.handleSubmit(onSubmit)}
                      className="space-y-6"
                    >
                      <FormField
                        control={form.control}
                        name="betTypeId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bet Type</FormLabel>
                            <Select
                              onValueChange={(value) => {
                                field.onChange(value);
                                handleBetTypeChange(value);
                              }}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select bet type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {betTypes &&
                                  betTypes.map((betType: any) => (
                                    <SelectItem
                                      key={betType.id}
                                      value={betType.id.toString()}
                                    >
                                      {betType.description}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Choose the type of bet you want to place
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Conditional fields based on bet type */}
                      {selectedBetType && (
                        <>
                          {/* Match selection for match-based bets */}
                          {["match_winner"].includes(selectedBetType.name) && (
                            <FormField
                              control={form.control}
                              name="matchId"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Select Match</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select match" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {matches &&
                                        matches.map((match: any) => (
                                          <SelectItem
                                            key={match.id}
                                            value={match.id.toString()}
                                          >
                                            {match.name}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                          {/* Round selection for round-based bets */}
                          {["round_winner", "over_under"].includes(
                            selectedBetType.name
                          ) && (
                            <FormField
                              control={form.control}
                              name="roundId"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Select Round</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select round" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {rounds &&
                                        rounds.map((round: any) => (
                                          <SelectItem
                                            key={round.id}
                                            value={round.id.toString()}
                                          >
                                            {round.name}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                          {/* Player selection for player-prop bets */}
                          {["player_prop"].includes(selectedBetType.name) && (
                            <FormField
                              control={form.control}
                              name="playerId"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Select Player</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select player" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {players &&
                                        players.map((player: any) => (
                                          <SelectItem
                                            key={player.id}
                                            value={player.id.toString()}
                                          >
                                            {player.name}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                          {/* Line for over/under bets */}
                          {["over_under"].includes(selectedBetType.name) && (
                            <FormField
                              control={form.control}
                              name="line"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Line</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.5"
                                      placeholder="e.g., 2.5"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    The over/under line for this bet
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                          {/* Bet option selection based on bet type */}
                          <FormField
                            control={form.control}
                            name="selectedOption"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Your Prediction</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select your prediction" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {selectedBetType.name === "match_winner" && (
                                      <>
                                        <SelectItem value="aviators">
                                          Aviators Win
                                        </SelectItem>
                                        <SelectItem value="producers">
                                          Producers Win
                                        </SelectItem>
                                        <SelectItem value="tie">
                                          Match Tie
                                        </SelectItem>
                                      </>
                                    )}
                                    {selectedBetType.name === "player_prop" && (
                                      <>
                                        <SelectItem value="win">
                                          Player Wins
                                        </SelectItem>
                                        <SelectItem value="loss">
                                          Player Loses
                                        </SelectItem>
                                        <SelectItem value="tie">
                                          Player Ties
                                        </SelectItem>
                                      </>
                                    )}
                                    {selectedBetType.name === "round_winner" && (
                                      <>
                                        <SelectItem value="aviators">
                                          Aviators Win Round
                                        </SelectItem>
                                        <SelectItem value="producers">
                                          Producers Win Round
                                        </SelectItem>
                                        <SelectItem value="tie">
                                          Round Tie
                                        </SelectItem>
                                      </>
                                    )}
                                    {selectedBetType.name === "over_under" && (
                                      <>
                                        <SelectItem value="over">Over</SelectItem>
                                        <SelectItem value="under">
                                          Under
                                        </SelectItem>
                                      </>
                                    )}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Description</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Describe your bet"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="amount"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Amount</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      placeholder="Bet amount"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="odds"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Odds</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.1"
                                      placeholder="Bet odds"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* Potential payout calculation */}
                          <div className="p-4 border rounded-md bg-muted">
                            <p className="text-sm font-medium">
                              Potential Payout:
                            </p>
                            <p className="text-xl font-bold">
                              {formatCurrency(
                                parseFloat(form.watch("amount") || "0") *
                                  parseFloat(form.watch("odds") || "0")
                              )}
                            </p>
                          </div>
                        </>
                      )}

                      <div className="flex justify-end">
                        <Button type="submit">Place Bet</Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}