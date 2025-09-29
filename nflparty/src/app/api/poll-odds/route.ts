import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT = 'americanfootball_nfl';
const BOOKMAKER = 'draftkings';
const MARKETS = 'player_assists,player_defensive_interceptions,player_field_goals,player_kicking_points,player_pass_attempts,player_pass_completions,player_pass_interceptions,player_pass_longest_completion,player_pass_rush_yds,player_pass_rush_reception_tds,player_pass_rush_reception_yds,player_pass_tds,player_pass_yds,player_pass_yds_q1,player_pats,player_receptions,player_reception_longest,player_reception_tds,player_reception_yds,player_rush_attempts,player_rush_longest,player_rush_reception_tds,player_rush_reception_yds,player_rush_tds,player_rush_yds,player_sacks,player_solo_tackles,player_tackles_assists,player_tds_over,player_1st_td,player_anytime_td,player_last_td,player_assists_alternate,player_field_goals_alternate,player_kicking_points_alternate,player_pass_attempts_alternate,player_pass_completions_alternate,player_pass_interceptions_alternate,player_pass_longest_completion_alternate,player_pass_rush_yds_alternate,player_pass_rush_reception_tds_alternate,player_pass_rush_reception_yds_alternate,player_pass_tds_alternate,player_pass_yds_alternate,player_pats_alternate,player_receptions_alternate,player_reception_longest_alternate,player_reception_tds_alternate,player_reception_yds_alternate,player_rush_attempts_alternate,player_rush_longest_alternate,player_rush_reception_tds_alternate,player_rush_reception_yds_alternate,player_rush_tds_alternate,player_rush_yds_alternate,player_sacks_alternate,player_solo_tackles_alternate,player_tackles_assists_alternate';

interface BookmakerMarket {
  key: string;
  outcomes: Array<{
    description?: string;
    name: string;
    point?: number;
    price: number;
  }>;
}

interface Bookmaker {
  key: string;
  markets: BookmakerMarket[];
}

interface GameData {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: Bookmaker[];
}

export async function GET() {
  try {
    const response = await fetch(
      `${ODDS_API_BASE}/sports/${SPORT}/odds?apiKey=${process.env.THE_ODDS_API_KEY}&regions=us&markets=${MARKETS}&oddsFormat=american&bookmakers=${BOOKMAKER}`
    );
    if (!response.ok) throw new Error('API fetch failed');
    const data: GameData[] = await response.json();

    const inserts = [];
    for (const game of data) {
      const { id: game_id, home_team, away_team, commence_time } = game;
      const bookmakerData = game.bookmakers.find((b: Bookmaker) => b.key === BOOKMAKER);
      if (bookmakerData) {
        for (const market of bookmakerData.markets) {
          for (const outcome of market.outcomes) {
            inserts.push({
              game_id,
              home_team,
              away_team,
              commence_time: new Date(commence_time).toISOString(),
              player_name: outcome.description || outcome.name, // Fallback if no description
              bookmaker: BOOKMAKER,
              market: market.key,
              outcome_name: outcome.name,
              point: outcome.point || null,
              price: outcome.price,
            });
          }
        }
      }
    }

    const { error } = await supabase.from('odds_history').insert(inserts);
    if (error) throw error;

    return NextResponse.json({ success: true, inserted: inserts.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to poll odds' }, { status: 500 });
  }
}
