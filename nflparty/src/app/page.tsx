'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@radix-ui/react-accordion'; // Or use ShadCN

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

interface Game {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: Bookmaker[];
}

interface Bookmaker {
  key: string;
  markets: BookmakerMarket[];
}

interface BookmakerMarket {
  key: string;
  outcomes: Array<{
    description?: string;
    name: string;
    point?: number;
    price: number;
  }>;
}

interface HistoryData {
  created_at: string;
  price: number;
  point: number | null;
}

interface ChartSeries {
  name: string; // player@market@point?
  data: { time: string; price: number; point: number | null }[];
}

export default function Dashboard() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGames, setSelectedGames] = useState<Set<string>>(new Set());
  const [playersByGame, setPlayersByGame] = useState<Record<string, Set<string>>>({});
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set()); // player@gameId
  const [availableMarkets, setAvailableMarkets] = useState<Set<string>>(new Set());
  const [selectedMarket, setSelectedMarket] = useState<string>('');
  const [chartData, setChartData] = useState<ChartSeries[]>([]);

  useEffect(() => {
    fetchGames();
  }, []);

  async function fetchGames() {
    const response = await fetch('/api/current-odds');
    const data: Game[] = await response.json();
    const todayGames = data.filter((game: Game) => {
      const commence = new Date(game.commence_time);
      const today = new Date();
      return commence.getDate() === today.getDate() && commence.getMonth() === today.getMonth() && commence.getFullYear() === today.getFullYear();
    });
    setGames(todayGames);

    const playersMap: Record<string, Set<string>> = {};
    const marketsSet = new Set<string>();
    for (const game of todayGames) {
      const bookmakerData = game.bookmakers?.find((b: Bookmaker) => b.key === 'draftkings');
      if (bookmakerData) {
        const gamePlayers = new Set<string>();
        for (const market of bookmakerData.markets) {
          marketsSet.add(market.key);
          for (const outcome of market.outcomes) {
            const player = outcome.description || outcome.name;
            if (player && player !== 'Over' && player !== 'Under' && player !== 'Yes' && player !== 'No') {
              gamePlayers.add(player);
            }
          }
        }
        playersMap[game.id] = gamePlayers;
      }
    }
    setPlayersByGame(playersMap);
    setAvailableMarkets(marketsSet);
  }

  function toggleGame(gameId: string) {
    const newSelected = new Set(selectedGames);
    if (newSelected.has(gameId)) newSelected.delete(gameId);
    else newSelected.add(gameId);
    setSelectedGames(newSelected);
  }

  function togglePlayer(gameId: string, player: string) {
    const key = `${player}@${gameId}`;
    const newSelected = new Set(selectedPlayers);
    if (newSelected.has(key)) newSelected.delete(key);
    else newSelected.add(key);
    setSelectedPlayers(newSelected);
    // Chart updates when market changes or players change
  }

  const updateChart = useCallback(async () => {
    const newChartData: ChartSeries[] = [];
    for (const key of selectedPlayers) {
      const [player, gameId] = key.split('@');
      const { data: history } = await supabase
        .from('odds_history')
        .select('created_at, price, point')
        .eq('game_id', gameId)
        .eq('player_name', player)
        .eq('market', selectedMarket)
        .eq('bookmaker', 'draftkings')
        .in('outcome_name', ['Over', 'Yes']) // Focus on positive outcomes
        .order('created_at', { ascending: true });

      if (history && history.length > 0) {
        // If multiple points, group by point
        const groupedByPoint: Record<string, { time: string; price: number; point: number | null }[]> = {};
        for (const h of history as HistoryData[]) {
          const pointKey = h.point !== null ? h.point.toString() : 'none';
          if (!groupedByPoint[pointKey]) groupedByPoint[pointKey] = [];
          groupedByPoint[pointKey].push({
            time: new Date(h.created_at).toLocaleTimeString(),
            price: h.price,
            point: h.point,
          });
        }

        for (const [pointKey, data] of Object.entries(groupedByPoint)) {
          newChartData.push({
            name: `${player} (${selectedMarket}${pointKey !== 'none' ? `@${pointKey}` : ''})`,
            data,
          });
        }
      }
    }
    setChartData(newChartData);
  }, [selectedMarket, selectedPlayers]);

  useEffect(() => {
    if (selectedMarket) updateChart();
  }, [selectedMarket, selectedPlayers, updateChart]);

  return (
    <div className="p-4">
      <h1 className="text-2xl mb-4">NFL Player Props Dashboard</h1>
      <Accordion type="multiple">
        {games.map((game) => (
          <AccordionItem key={game.id} value={game.id}>
            <AccordionTrigger onClick={() => toggleGame(game.id)}>
              {game.away_team} @ {game.home_team} ({new Date(game.commence_time).toLocaleString()})
            </AccordionTrigger>
            {selectedGames.has(game.id) && (
              <AccordionContent>
                <ul className="grid grid-cols-4 gap-2">
                  {Array.from(playersByGame[game.id] || []).map((player) => (
                    <li key={player}>
                      <button
                        onClick={() => togglePlayer(game.id, player)}
                        className={`p-2 border rounded ${selectedPlayers.has(`${player}@${game.id}`) ? 'bg-blue-500 text-white' : ''}`}
                      >
                        {player}
                      </button>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            )}
          </AccordionItem>
        ))}
      </Accordion>
      {selectedPlayers.size > 0 && (
        <div className="mt-4">
          <label className="mr-2">Select Prop:</label>
          <select
            value={selectedMarket}
            onChange={(e) => setSelectedMarket(e.target.value)}
            className="p-2 border rounded"
          >
            <option value="">-- Choose Prop --</option>
            {Array.from(availableMarkets).sort().map((market) => (
              <option key={market} value={market}>
                {market.replace('player_', '').replace('_', ' ').toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="mt-8">
        <h2 className="text-xl mb-2">Price History Chart</h2>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis domain={['auto', 'auto']} />
            <Tooltip formatter={(value, name, props) => [`Price: ${value}`, `Point: ${props.payload.point ?? 'N/A'}`]} />
            // @ts-ignore
            <Legend />
            {chartData.map((series, idx) => (
              <Line
                key={series.name}
                type="monotone"
                dataKey="price"
                data={series.data}
                name={series.name}
                stroke={`hsl(${idx * 30 % 360}, 70%, 50%)`}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
