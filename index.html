/**
 * fetch-nhl-data.mjs
 *
 * Fetches shot location data for all NHL teams from the NHL Edge API.
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
  { id: 2,  name: "Islanders",      city: "New York",     abbr: "NYI", color: "#00539B" },
  { id: 3,  name: "Rangers",        city: "New York",     abbr: "NYR", color: "#0038A8" },
  { id: 4,  name: "Flyers",         city: "Philadelphia", abbr: "PHI", color: "#F74902" },
  { id: 5,  name: "Penguins",       city: "Pittsburgh",   abbr: "PIT", color: "#FCB514" },
  { id: 6,  name: "Bruins",         city: "Boston",       abbr: "BOS", color: "#FFB81C" },
  { id: 7,  name: "Sabres",         city: "Buffalo",      abbr: "BUF", color: "#003087" },
  { id: 8,  name: "Canadiens",      city: "Montréal",     abbr: "MTL", color: "#AF1E2D" },
  { id: 9,  name: "Senators",       city: "Ottawa",       abbr: "OTT", color: "#C52032" },
  { id: 10, name: "Maple Leafs",    city: "Toronto",      abbr: "TOR", color: "#00205B" },
  { id: 12, name: "Hurricanes",     city: "Carolina",     abbr: "CAR", color: "#CC0000" },
  { id: 13, name: "Panthers",       city: "Florida",      abbr: "FLA", color: "#041E42" },
  { id: 14, name: "Lightning",      city: "Tampa Bay",    abbr: "TBL", color: "#002868" },
  { id: 15, name: "Capitals",       city: "Washington",   abbr: "WSH", color: "#041E42" },
  { id: 16, name: "Blackhawks",     city: "Chicago",      abbr: "CHI", color: "#CF0A2C" },
  { id: 17, name: "Red Wings",      city: "Detroit",      abbr: "DET", color: "#CE1126" },
  { id: 18, name: "Predators",      city: "Nashville",    abbr: "NSH", color: "#FFB81C" },
  { id: 19, name: "Blues",          city: "St. Louis",    abbr: "STL", color: "#002F87" },
  { id: 20, name: "Flames",         city: "Calgary",      abbr: "CGY", color: "#C8102E" },
  { id: 21, name: "Avalanche",      city: "Colorado",     abbr: "COL", color: "#6F263D" },
  { id: 22, name: "Oilers",         city: "Edmonton",     abbr: "EDM", color: "#FF4C00" },
  { id: 23, name: "Canucks",        city: "Vancouver",    abbr: "VAN", color: "#00205B" },
  { id: 24, name: "Ducks",          city: "Anaheim",      abbr: "ANA", color: "#FC4C02" },
  { id: 25, name: "Stars",          city: "Dallas",       abbr: "DAL", color: "#006847" },
  { id: 26, name: "Kings",          city: "Los Angeles",  abbr: "LAK", color: "#A2AAAD" },
  { id: 28, name: "Sharks",         city: "San Jose",     abbr: "SJS", color: "#006D75" },
  { id: 29, name: "Blue Jackets",   city: "Columbus",     abbr: "CBJ", color: "#002654" },
  { id: 30, name: "Wild",           city: "Minnesota",    abbr: "MIN", color: "#154734" },
  { id: 52, name: "Jets",           city: "Winnipeg",     abbr: "WPG", color: "#041E42" },
  { id: 54, name: "Golden Knights", city: "Vegas",        abbr: "VGK", color: "#B4975A" },
  { id: 55, name: "Kraken",         city: "Seattle",      abbr: "SEA", color: "#99D9D9" },
  { id: 56, name: "Hockey Club",    city: "Utah",         abbr: "UTA", color: "#69B3E7" },
]

const SEASONS   = ["20252026", "20242025"]
const GAME_TYPES = [2, 3] // 2 = regular season, 3 = playoffs

const BASE_URL = "https://api-web.nhle.com/v1/edge/team-shot-location-detail"

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; nhl-shot-map/1.0)' },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        if (res.status === 404) return null // no data for this combo (e.g. playoffs not started)
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

async function main() {
  console.log('🏒 NHL Shot Location Data Fetcher')
  console.log(`   Fetching ${TEAMS.length} teams × ${SEASONS.length} seasons × ${GAME_TYPES.length} game types`)
  console.log(`   Total requests: up to ${TEAMS.length * SEASONS.length * GAME_TYPES.length}\n`)

  const output = {
    fetchedAt: new Date().toISOString(),
    teams: TEAMS,
    data: {},
    missingKeys: [],
  }

  let success = 0
  let missing = 0

  for (const season of SEASONS) {
    for (const gameType of GAME_TYPES) {
      console.log(`\n📅 Season ${season} · Game type ${gameType === 2 ? 'Regular Season' : 'Playoffs'}`)

      for (const team of TEAMS) {
        const key = `${team.id}_${season}_${gameType}`
        const url = `${BASE_URL}/${team.id}/${season}/${gameType}`

        process.stdout.write(`  ${team.abbr.padEnd(4)} `)

        const data = await fetchWithRetry(url)

        if (data && data.shotLocationDetails?.length) {
          output.data[key] = data
          process.stdout.write(`✓\n`)
          success++
        } else {
          output.missingKeys.push(key)
          process.stdout.write(`— (no data)\n`)
          missing++
        }

        // Small delay to be respectful to the NHL API
        await new Promise(r => setTimeout(r, 150))
      }
    }
  }

  // Write to public/ so Vite includes it in the build output
  const outDir  = join(__dirname, '..', 'public')
  const outFile = join(outDir, 'nhl-data.json')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(outFile, JSON.stringify(output, null, 2))

  console.log(`\n✅ Done!`)
  console.log(`   ${success} datasets saved`)
  console.log(`   ${missing} combos had no data (e.g. playoffs not yet played)`)
  console.log(`   → public/nhl-data.json`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
