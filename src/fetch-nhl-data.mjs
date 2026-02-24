/**
 * fetch-nhl-data.mjs
 *
 * Fetches shot location data + skater stat leaders for all NHL teams.
 * Saves results to public/nhl-data.json so the React app can load it at runtime.
 *
 * Run manually:  node scripts/fetch-nhl-data.mjs
 * Run via CI:    triggered by GitHub Actions on a schedule
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const TEAMS = [
  { id: 1,  name: "Devils",         city: "New Jersey",   abbr: "NJD", color: "#CE1126" },
  { id: 2,  name: "Islanders",      city: "New York",     abbr: "NYI", color: "#1A6BC4" },
  { id: 3,  name: "Rangers",        city: "New York",     abbr: "NYR", color: "#1A5CC4" },
  { id: 4,  name: "Flyers",         city: "Philadelphia", abbr: "PHI", color: "#F74902" },
  { id: 5,  name: "Penguins",       city: "Pittsburgh",   abbr: "PIT", color: "#FCB514" },
  { id: 6,  name: "Bruins",         city: "Boston",       abbr: "BOS", color: "#FFB81C" },
  { id: 7,  name: "Sabres",         city: "Buffalo",      abbr: "BUF", color: "#2A5FBF" },
  { id: 8,  name: "Canadiens",      city: "Montréal",     abbr: "MTL", color: "#E03040" },
  { id: 9,  name: "Senators",       city: "Ottawa",       abbr: "OTT", color: "#C52032" },
  { id: 10, name: "Maple Leafs",    city: "Toronto",      abbr: "TOR", color: "#1A7BC4" },
  { id: 12, name: "Hurricanes",     city: "Carolina",     abbr: "CAR", color: "#CC0000" },
  { id: 13, name: "Panthers",       city: "Florida",      abbr: "FLA", color: "#1A7BC4" },
  { id: 14, name: "Lightning",      city: "Tampa Bay",    abbr: "TBL", color: "#1A5CC4" },
  { id: 15, name: "Capitals",       city: "Washington",   abbr: "WSH", color: "#1A7BC4" },
  { id: 16, name: "Blackhawks",     city: "Chicago",      abbr: "CHI", color: "#CF0A2C" },
  { id: 17, name: "Red Wings",      city: "Detroit",      abbr: "DET", color: "#CE1126" },
  { id: 18, name: "Predators",      city: "Nashville",    abbr: "NSH", color: "#FFB81C" },
  { id: 19, name: "Blues",          city: "St. Louis",    abbr: "STL", color: "#1A5CC4" },
  { id: 20, name: "Flames",         city: "Calgary",      abbr: "CGY", color: "#C8102E" },
  { id: 21, name: "Avalanche",      city: "Colorado",     abbr: "COL", color: "#A8385A" },
  { id: 22, name: "Oilers",         city: "Edmonton",     abbr: "EDM", color: "#FF4C00" },
  { id: 23, name: "Canucks",        city: "Vancouver",    abbr: "VAN", color: "#1A7BC4" },
  { id: 24, name: "Ducks",          city: "Anaheim",      abbr: "ANA", color: "#FC4C02" },
  { id: 25, name: "Stars",          city: "Dallas",       abbr: "DAL", color: "#1A7A52" },
  { id: 26, name: "Kings",          city: "Los Angeles",  abbr: "LAK", color: "#A2AAAD" },
  { id: 28, name: "Sharks",         city: "San Jose",     abbr: "SJS", color: "#00A0AD" },
  { id: 29, name: "Blue Jackets",   city: "Columbus",     abbr: "CBJ", color: "#1A5CC4" },
  { id: 30, name: "Wild",           city: "Minnesota",    abbr: "MIN", color: "#1A7A52" },
  { id: 52, name: "Jets",           city: "Winnipeg",     abbr: "WPG", color: "#1A5CC4" },
  { id: 54, name: "Golden Knights", city: "Vegas",        abbr: "VGK", color: "#B4975A" },
  { id: 55, name: "Kraken",         city: "Seattle",      abbr: "SEA", color: "#99D9D9" },
  { id: 56, name: "Hockey Club",    city: "Utah",         abbr: "UTA", color: "#69B3E7" },
]

const SEASONS    = ["20252026", "20242025"]
const GAME_TYPES = [2, 3] // 2 = regular season, 3 = playoffs

const SHOT_LOC_URL  = "https://api-web.nhle.com/v1/edge/team-shot-location-detail"
const CLUB_STATS_URL = "https://api-web.nhle.com/v1/club-stats"

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; nhl-shot-map/1.0)' },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        if (res.status === 404) return null
        throw new Error(`HTTP ${res.status}`)
      }
      return await res.json()
    } catch (err) {
      if (i === retries - 1) {
        console.warn(`  ✗ Failed after ${retries} attempts: ${url} — ${err.message}`)
        return null
      }
      console.warn(`  ↻ Retry ${i + 1}/${retries - 1}: ${url}`)
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
}

/**
 * From a club-stats response, extract the top player for shots, goals, and sh%.
 * Returns { shots: {name, val}, goals: {name, val}, pctg: {name, val} }
 */
function extractLeaders(clubStats) {
  const skaters = clubStats?.skaters
  if (!skaters?.length) return null

  // Filter to skaters with meaningful shot counts (min 20 shots for sh% leader)
  const qualified = skaters.filter(s => (s.shots ?? 0) >= 20)

  const byShots  = [...skaters].sort((a, b) => (b.shots ?? 0) - (a.shots ?? 0))[0]
  const byGoals  = [...skaters].sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0))[0]
  const byPctg   = qualified.length
    ? [...qualified].sort((a, b) => (b.shootingPctg ?? 0) - (a.shootingPctg ?? 0))[0]
    : [...skaters].sort((a, b) => (b.shootingPctg ?? 0) - (a.shootingPctg ?? 0))[0]

  const fmt = p => p ? {
    name: p.lastName?.default ?? p.lastName ?? '—',
    firstName: p.firstName?.default ?? p.firstName ?? '',
    playerId: p.playerId,
    val: null, // filled by caller
  } : null

  return {
    shots: byShots ? { ...fmt(byShots), val: byShots.shots } : null,
    goals: byGoals ? { ...fmt(byGoals), val: byGoals.goals } : null,
    pctg:  byPctg  ? { ...fmt(byPctg),  val: +(byPctg.shootingPctg * 100).toFixed(1) } : null,
  }
}

async function main() {
  console.log('🏒 NHL Shot Location + Skater Leaders Fetcher')
  console.log(`   ${TEAMS.length} teams × ${SEASONS.length} seasons × ${GAME_TYPES.length} game types\n`)

  const output = {
    fetchedAt: new Date().toISOString(),
    teams: TEAMS,
    data: {},
    leaders: {},   // keyed by "{teamId}_{season}_{gameType}"
    missingKeys: [],
  }

  let success = 0, missing = 0

  for (const season of SEASONS) {
    for (const gameType of GAME_TYPES) {
      console.log(`\n📅 Season ${season} · ${gameType === 2 ? 'Regular Season' : 'Playoffs'}`)

      for (const team of TEAMS) {
        const key = `${team.id}_${season}_${gameType}`
        process.stdout.write(`  ${team.abbr.padEnd(4)} `)

        // ── Shot location data ──────────────────────────────────────────
        const shotUrl  = `${SHOT_LOC_URL}/${team.id}/${season}/${gameType}`
        const shotData = await fetchWithRetry(shotUrl)

        if (shotData?.shotLocationDetails?.length) {
          output.data[key] = shotData
          success++
        } else {
          output.missingKeys.push(key)
          missing++
          process.stdout.write(`— (no shot data)\n`)
          await new Promise(r => setTimeout(r, 150))
          continue
        }

        // ── Skater leaders ──────────────────────────────────────────────
        const statsUrl  = `${CLUB_STATS_URL}/${team.abbr}/${season}/${gameType}`
        const statsData = await fetchWithRetry(statsUrl)
        const leaders   = extractLeaders(statsData)
        if (leaders) output.leaders[key] = leaders

        process.stdout.write(`✓${leaders ? ' +leaders' : ''}\n`)

        await new Promise(r => setTimeout(r, 200))
      }
    }
  }

  const outDir  = join(__dirname, '..', 'public')
  const outFile = join(outDir, 'nhl-data.json')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(outFile, JSON.stringify(output, null, 2))

  console.log(`\n✅ Done!`)
  console.log(`   ${success} shot datasets saved`)
  console.log(`   ${missing} combos had no data`)
  console.log(`   → public/nhl-data.json`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
