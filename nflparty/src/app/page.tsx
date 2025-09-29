'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';  // Add ShadCN or use basic divs if not installed
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Init Supabase (client-side)
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

// Add to .env.local: NEXT_PUBLIC_SUPABASE_URL=... and NEXT_PUBLIC_SUPABASE_ANON_KEY=...

interface Game {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
}

interface OddsData {
  created_at: string;
  price: number;
}

interface ChartData {
  name: string;  // Player@Game
  data: { time: string; price: number }[];
}

export default function Dashboard() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGames, setSelectedGames] = useState<Set<string>>(new Set());
  const [playersByGame, setPlayersByGame] = useState<Record<string, string[]>>({});
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());  // Format: player@gameId
  const [chartData, setChartData] = useState<ChartData[]>([]);

  useEffect(() => {
    fetchGames();
  }, []);

  async function fetchGames() {
    // Fetch current games and players from TheOddsAPI
    const response = await fetch(
      `/api/current-odds`  // Create this route similar to poll-odds, but without insert
    );
    const data = await response.json();
    const todayGames = data.filter((game: any) => {
      const commence = new Date(game.commence_time);
      const today = new Date();
      return commence.getDate() === today.getDate() && commence.getMonth() === today.getMonth() && commence.getFullYear() === today.getFullYear();
    });
    setGames(todayGames);

    const playersMap: Record<string, string[]> = {};
    for (const game of todayGames) {
      const marketData = game.bookmakers.find((b: any) => b.key === 'draftkings')?.markets[0];
      if (marketData) {
        playersMap[game.id] = [...new Set(marketData.outcomes.map((o: any) => o.name).filter((n: string) => n !== 'No'))];
      }
    }
    setPlayersByGame(playersMap);
  }

  async function toggleGame(gameId: string) {
    const newSelected = new Set(selectedGames);
    if (newSelected.has(gameId)) {
      newSelected.delete(gameId);
    } else {
      newSelected.add(gameId);
    }
    setSelectedGames(newSelected);
  }

  async function togglePlayer(gameId: string, player: string) {
    const key = `${player}@${gameId}`;
    const newSelected = new Set(selectedPlayers);
    if (newSelected.has(key)) {
      newSelected.delete(key);
      setChartData(chartData.filter((d) => d.name !== key));
    } else {
      newSelected.add(key);
      // Fetch history from Supabase
      const { data: history } = await supabase
        .from('odds_history')
        .select('created_at, price')
        .eq('game_id', gameId)
        .eq('player_name', player)
        .eq('bookmaker', 'draftkings')
        .order('created_at', { ascending: true });

      if (history) {
        const formatted = history.map((h: OddsData) => ({
          time: new Date(h.created_at).toLocaleTimeString(),
          price: h.price,
        }));
        setChartData([...chartData, { name: key, data: formatted }]);
      }
    }
    setSelectedPlayers(newSelected);
  }

  // Create /api/current-odds/route.ts similar to poll-odds, but return the fetched data without inserting.

  return (
    <div className="p-4">
      <h1 className="text-2xl mb-4">NFL Games Today Dashboard</h1>
      <Accordion type="single" collapsible>
        {games.map((game) => (
          <AccordionItem key={game.id} value={game.id}>
            <AccordionTrigger onClick={() => toggleGame(game.id)}>
              {game.away_team} @ {game.home_team} ({new Date(game.commence_time).toLocaleString()})
            </AccordionTrigger>
            <AccordionContent>
              <ul>
                {playersByGame[game.id]?.map((player) => (
                  <li key={player}>
                    <button
                      onClick={() => togglePlayer(game.id, player)}
                      className={`p-1 ${selectedPlayers.has(`${player}@${game.id}`) ? 'bg-blue-500 text-white' : ''}`}
                    >
                      {player}
                    </button>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <div className="mt-8">
        <h2 className="text-xl mb-2">Odds Price History Chart</h2>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis domain={['auto', 'auto']} />
            <Tooltip />
            <Legend />
            {chartData.map((series, idx) => (
              <Line key={series.name} type="monotone" dataKey="price" data={series.data} name={series.name} stroke={`hsl(${idx * 60}, 70%, 50%)`} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
