/**
 * fetch-nhl-data.mjs
 * Fetches shot location data + skater stat leaders for all NHL teams.
 * Run: node scripts/fetch-nhl-data.mjs
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
  { id: 7,  name: "Sabres",         city: "Buffalo",      abbr: "BUF", color: "#1A6BC4" },
  { id: 8,  name: "Canadiens",      city: "Montréal",     abbr: "MTL", color: "#E03040" },
  { id: 9,  name: "Senators",       city: "Ottawa",       abbr: "OTT", color: "#C52032" },
  { id: 10, name: "Maple Leafs",    city: "Toronto",      abbr: "TOR", color: "#1A6BC4" },
  { id: 12, name: "Hurricanes",     city: "Carolina",     abbr: "CAR", color: "#CC0000" },
  { id: 13, name: "Panthers",       city: "Florida",      abbr: "FLA", color: "#1A5CC4" },
  { id: 14, name: "Lightning",      city: "Tampa Bay",    abbr: "TBL", color: "#1A6BC4" },
  { id: 15, name: "Capitals",       city: "Washington",   abbr: "WSH", color: "#1A5CC4" },
  { id: 16, name: "Blackhawks",     city: "Chicago",      abbr: "CHI", color: "#CF0A2C" },
  { id: 17, name: "Red Wings",      city: "Detroit",      abbr: "DET", color: "#CE1126" },
  { id: 18, name: "Predators",      city: "Nashville",    abbr: "NSH", color: "#FFB81C" },
  { id: 19, name: "Blues",          city: "St. Louis",    abbr: "STL", color: "#2A5FBF" },
  { id: 20, name: "Flames",         city: "Calgary",      abbr: "CGY", color: "#C8102E" },
  { id: 21, name: "Avalanche",      city: "Colorado",     abbr: "COL", color: "#A8385A" },
  { id: 22, name: "Oilers",         city: "Edmonton",     abbr: "EDM", color: "#FF4C00" },
  { id: 23, name: "Canucks",        city: "Vancouver",    abbr: "VAN", color: "#1A6BC4" },
  { id: 24, name: "Ducks",          city: "Anaheim",      abbr: "ANA", color: "#FC4C02" },
  { id: 25, name: "Stars",          city: "Dallas",       abbr: "DAL", color: "#00A06B" },
  { id: 26, name: "Kings",          city: "Los Angeles",  abbr: "LAK", color: "#A2AAAD" },
  { id: 28, name: "Sharks",         city: "San Jose",     abbr: "SJS", color: "#00A0AD" },
  { id: 29, name: "Blue Jackets",   city: "Columbus",     abbr: "CBJ", color: "#1A6BC4" },
  { id: 30, name: "Wild",           city: "Minnesota",    abbr: "MIN", color: "#1A7A52" },
  { id: 52, name: "Jets",           city: "Winnipeg",     abbr: "WPG", color: "#1A5CC4" },
  { id: 54, name: "Golden Knights", city: "Vegas",        abbr: "VGK", color: "#B4975A" },
  { id: 55, name: "Kraken",         city: "Seattle",      abbr: "SEA", color: "#99D9D9" },
  { id: 59, name: "Mammoth",        city: "Utah",         abbr: "UTA", color: "#69B3E7" },
]

const SEASONS    = ["20252026", "20242025"]
const GAME_TYPES = [2, 3]

const SHOT_URL  = "https://api-web.nhle.com/v1/edge/team-shot-location-detail"
const STATS_URL = "https://api-web.nhle.com/v1/club-stats"

async function get(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; nhl-shot-map/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return null
  }
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const data = await get(url)
    if (data !== null) return data
    if (i < retries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)))
  }
  return null
}

let _skaterShape = null

function extractLeaders(data) {
  if (!data) return null

  // Find the array that contains player goal/shot stats
  let skaters = null
  for (const val of Object.values(data)) {
    if (Array.isArray(val) && val.length > 0 && val[0].goals !== undefined) {
      skaters = val
      break
    }
  }
  if (!skaters) return null

  if (!_skaterShape) _skaterShape = Object.keys(skaters[0]).slice(0, 10).join(', ')

  const str   = p => p?.default ?? p ?? ''
  const shots = p => p.shots ?? p.shotsOnGoal ?? 0
  const goals = p => p.goals ?? 0
  const pctg  = p => { const v = p.shootingPctg ?? p.shootingPct ?? 0; return v > 1 ? v / 100 : v }

  const qualified = skaters.filter(p => shots(p) >= 20)
  const pool      = qualified.length ? qualified : skaters

  const topShots = [...skaters].sort((a, b) => shots(b) - shots(a))[0]
  const topGoals = [...skaters].sort((a, b) => goals(b) - goals(a))[0]
  const topPctg  = [...pool].sort((a, b)    => pctg(b)  - pctg(a))[0]

  const fmt = (p, val) => ({
    name:      str(p.lastName),
    firstName: str(p.firstName),
    playerId:  p.playerId,
    val,
  })

  return {
    shots: topShots ? fmt(topShots, shots(topShots)) : null,
    goals: topGoals ? fmt(topGoals, goals(topGoals)) : null,
    pctg:  topPctg  ? fmt(topPctg,  +(pctg(topPctg) * 100).toFixed(1)) : null,
  }
}

async function main() {
  console.log('🏒 NHL Shot Location + Skater Leaders Fetcher')
  console.log(`   ${TEAMS.length} teams × ${SEASONS.length} seasons × ${GAME_TYPES.length} game types\n`)

  // ── Probe the stats endpoint once to confirm shape ─────────────────
  console.log('🔍 Probing club-stats endpoint (TOR/20242025/2)...')
  const probe = await get(`${STATS_URL}/TOR/20242025/2`)
  if (probe) {
    console.log(`   ✓ Response keys: ${Object.keys(probe).join(', ')}`)
    for (const [k, v] of Object.entries(probe)) {
      if (Array.isArray(v) && v.length)
        console.log(`   [${k}] ${v.length} items · keys: ${Object.keys(v[0]).slice(0,10).join(', ')}`)
    }
  } else {
    console.log(`   ✗ returned null — trying numeric id (10)...`)
    const probe2 = await get(`${STATS_URL}/10/20242025/2`)
    if (probe2) {
      console.log(`   ✓ numeric id works! Keys: ${Object.keys(probe2).join(', ')}`)
    } else {
      console.log(`   ✗ both failed — leaders will not be available`)
    }
  }
  console.log()
  // ──────────────────────────────────────────────────────────────────

  const output = {
    fetchedAt:   new Date().toISOString(),
    teams:       TEAMS,
    data:        {},
    leaders:     {},
    missingKeys: [],
  }

  let success = 0, missing = 0, leadersFound = 0

  for (const season of SEASONS) {
    for (const gameType of GAME_TYPES) {
      console.log(`\n📅 Season ${season} · ${gameType === 2 ? 'Regular Season' : 'Playoffs'}`)

      for (const team of TEAMS) {
        const key = `${team.id}_${season}_${gameType}`
        process.stdout.write(`  ${team.abbr.padEnd(4)} `)

        // Shot location
        const shotData = await fetchWithRetry(`${SHOT_URL}/${team.id}/${season}/${gameType}`)
        if (!shotData?.shotLocationDetails?.length) {
          output.missingKeys.push(key)
          process.stdout.write(`—\n`)
          missing++
          await new Promise(r => setTimeout(r, 150))
          continue
        }
        output.data[key] = shotData
        success++

        // Skater stats — abbr first, numeric id as fallback
        const statsData =
          (await get(`${STATS_URL}/${team.abbr}/${season}/${gameType}`)) ??
          (await get(`${STATS_URL}/${team.id}/${season}/${gameType}`))

        const leaders = extractLeaders(statsData)
        if (leaders) {
          output.leaders[key] = leaders
          leadersFound++
          process.stdout.write(`✓ +${leaders.goals?.name ?? '?'}\n`)
        } else {
          process.stdout.write(`✓\n`)
        }

        await new Promise(r => setTimeout(r, 200))
      }
    }
  }

  if (_skaterShape) console.log(`\n📋 Skater fields: ${_skaterShape}`)

  const outDir = join(__dirname, '..', 'public')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'nhl-data.json'), JSON.stringify(output, null, 2))

  console.log(`\n✅ Done!`)
  console.log(`   ${success} shot datasets · ${leadersFound} with leaders · ${missing} missing`)
  console.log(`   → public/nhl-data.json`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
