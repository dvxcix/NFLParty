import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT = 'americanfootball_nfl';
const MARKET = 'player_anytime_td';
const BOOKMAKER = 'draftkings';  // Limit to one to save quota; add more if needed

export async function GET() {
  try {
    // Fetch current odds
    const response = await fetch(
      `${ODDS_API_BASE}/sports/${SPORT}/odds?apiKey=${process.env.THE_ODDS_API_KEY}&regions=us&markets=${MARKET}&oddsFormat=american&bookmakers=${BOOKMAKER}`
    );
    if (!response.ok) throw new Error('API fetch failed');
    const data = await response.json();

    // Prepare inserts
    const inserts = [];
    for (const game of data) {
      const { id: game_id, home_team, away_team, commence_time } = game;
      const marketData = game.bookmakers.find((b: any) => b.key === BOOKMAKER)?.markets[0];
      if (marketData) {
        for (const outcome of marketData.outcomes) {
          if (outcome.name !== 'No') {  // Assume 'Yes' for anytime TD; adjust if needed
            inserts.push({
              game_id,
              home_team,
              away_team,
              commence_time: new Date(commence_time).toISOString(),
              player_name: outcome.name,  // Player name
              bookmaker: BOOKMAKER,
              price: outcome.price,
            });
          }
        }
      }
    }

    // Insert to Supabase (bulk)
    const { error } = await supabase.from('odds_history').insert(inserts);
    if (error) throw error;

    return NextResponse.json({ success: true, inserted: inserts.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to poll odds' }, { status: 500 });
  }
}
