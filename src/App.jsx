import { useState, useEffect } from "react";

const ZONE_POS = {
  "Low Slot":               { x:255, y:268, w:130, h:62 },
  "High Slot":              { x:260, y:198, w:120, h:62 },
  "Crease":                 { x:268, y:332, w:104, h:44 },
  "L Circle":               { x:112, y:208, w:132, h:62 },
  "R Circle":               { x:396, y:208, w:132, h:62 },
  "L Net Side":             { x:115, y:276, w:132, h:50 },
  "R Net Side":             { x:393, y:276, w:132, h:50 },
  "L Point":                { x:56,  y:126, w:122, h:44 },
  "R Point":                { x:462, y:126, w:122, h:44 },
  "Center Point":           { x:195, y:126, w:250, h:44 },
  "Outside L":              { x:34,  y:214, w:72,  h:56 },
  "Outside R":              { x:534, y:214, w:72,  h:56 },
  "Beyond Red Line":        { x:178, y:52,  w:284, h:40 },
  "Offensive Neutral Zone": { x:162, y:94,  w:316, h:30 },
  "Behind the Net":         { x:246, y:378, w:148, h:34 },
  "L Corner":               { x:50,  y:328, w:112, h:46 },
  "R Corner":               { x:478, y:328, w:112, h:46 },
};

function rankColor(r, total) {
  const pct = r / total;
  if (pct <= 0.15) return "#00E5A0";
  if (pct <= 0.33) return "#6EE7B7";
  if (pct <= 0.66) return "#FCD34D";
  return "#F87171";
}

function vsAvg(val, avg) {
  const d = ((val - avg) / avg) * 100;
  if (d > 5)  return { sym: "▲", color: "#00E5A0", txt: `+${d.toFixed(0)}% vs avg` };
  if (d < -5) return { sym: "▼", color: "#F87171", txt: `${d.toFixed(0)}% vs avg` };
  return { sym: "●", color: "#FCD34D", txt: "≈ playoff avg" };
}

const SEASONS    = ["20252026", "20242025"];
const GAME_TYPES = [{ v: 2, l: "Regular Season" }, { v: 3, l: "Playoffs" }];

/**
 * For a given season + game type, collect all teams that have data,
 * then re-rank each metric from scratch using only those teams.
 * Returns a map of { teamId -> { shotLocationDetails, shotLocationTotals } }
 * with recalculated rank fields.
 */
function buildPlayoffRanks(db, season, gtype) {
  if (!db) return null;

  // Gather all teams that have data for this season/gtype
  const playoffTeamData = [];
  for (const [key, val] of Object.entries(db.data)) {
    const [tid, s, g] = key.split("_");
    if (s === season && parseInt(g) === gtype) {
      playoffTeamData.push({ teamId: parseInt(tid), data: val });
    }
  }
  if (playoffTeamData.length === 0) return null;

  const n = playoffTeamData.length; // e.g. 16

  // Helper: rank all teams by a numeric getter (higher = better rank 1)
  function rerank(getter) {
    const sorted = [...playoffTeamData]
      .map(t => ({ teamId: t.teamId, val: getter(t.data) }))
      .sort((a, b) => b.val - a.val);
    const rankMap = {};
    sorted.forEach((item, i) => { rankMap[item.teamId] = i + 1; });
    return rankMap;
  }

  // --- shotLocationTotals ranks ---
  const totalFields = [
    { lc: "all", pos: "all", key: "sog",           rankField: "sogRank" },
    { lc: "all", pos: "all", key: "goals",         rankField: "goalsRank" },
    { lc: "all", pos: "all", key: "shootingPctg",  rankField: "shootingPctgRank" },
    { lc: "all", pos: "F",   key: "sog",           rankField: "sogRank" },
    { lc: "all", pos: "F",   key: "goals",         rankField: "goalsRank" },
    { lc: "all", pos: "F",   key: "shootingPctg",  rankField: "shootingPctgRank" },
    { lc: "all", pos: "D",   key: "sog",           rankField: "sogRank" },
    { lc: "all", pos: "D",   key: "goals",         rankField: "goalsRank" },
    { lc: "all", pos: "D",   key: "shootingPctg",  rankField: "shootingPctgRank" },
  ];

  const totalRankMaps = {};
  for (const f of totalFields) {
    const mapKey = `${f.lc}_${f.pos}_${f.rankField}`;
    totalRankMaps[mapKey] = rerank(d => {
      const row = d.shotLocationTotals?.find(t => t.locationCode === f.lc && t.position === f.pos);
      return row?.[f.key] ?? 0;
    });
  }

  // --- shotLocationDetails ranks (per area) ---
  const areas = [...new Set(playoffTeamData.flatMap(t => t.data.shotLocationDetails.map(z => z.area)))];
  const detailRankMaps = {};
  for (const area of areas) {
    for (const [field, rankField] of [["sog","sogRank"],["goals","goalsRank"],["shootingPctg","shootingPctgRank"]]) {
      const mapKey = `${area}_${rankField}`;
      detailRankMaps[mapKey] = rerank(d => {
        const row = d.shotLocationDetails?.find(z => z.area === area);
        return row?.[field] ?? 0;
      });
    }
  }

  // Build output: per-team re-ranked data
  const result = { teamCount: n, byTeam: {} };
  for (const { teamId, data } of playoffTeamData) {
    // Re-rank totals
    const newTotals = data.shotLocationTotals.map(row => {
      const newRow = { ...row };
      for (const f of totalFields) {
        if (row.locationCode === f.lc && row.position === f.pos) {
          const mapKey = `${f.lc}_${f.pos}_${f.rankField}`;
          newRow[f.rankField] = totalRankMaps[mapKey][teamId] ?? row[f.rankField];
        }
      }
      // Recalculate league avg from playoff teams only
      newRow.sogLeagueAvg         = playoffTeamData.reduce((s,t) => s + (t.data.shotLocationTotals.find(r=>r.locationCode===row.locationCode&&r.position===row.position)?.sog??0), 0) / n;
      newRow.goalsLeagueAvg       = playoffTeamData.reduce((s,t) => s + (t.data.shotLocationTotals.find(r=>r.locationCode===row.locationCode&&r.position===row.position)?.goals??0), 0) / n;
      newRow.shootingPctgLeagueAvg= playoffTeamData.reduce((s,t) => s + (t.data.shotLocationTotals.find(r=>r.locationCode===row.locationCode&&r.position===row.position)?.shootingPctg??0), 0) / n;
      return newRow;
    });

    // Re-rank details
    const newDetails = data.shotLocationDetails.map(zone => ({
      ...zone,
      sogRank:          detailRankMaps[`${zone.area}_sogRank`]?.[teamId]          ?? zone.sogRank,
      goalsRank:        detailRankMaps[`${zone.area}_goalsRank`]?.[teamId]        ?? zone.goalsRank,
      shootingPctgRank: detailRankMaps[`${zone.area}_shootingPctgRank`]?.[teamId] ?? zone.shootingPctgRank,
    }));

    result.byTeam[teamId] = { ...data, shotLocationDetails: newDetails, shotLocationTotals: newTotals };
  }

  return result;
}

function deriveArchetype(details, totals, fwd, def, rankTotal) {
  if (!details?.length || !totals) return null;

  const get = area => details.find(d => d.area === area);

  const lowSlot   = get("Low Slot")?.sog     ?? 0;
  const highSlot  = get("High Slot")?.sog    ?? 0;
  const crease    = get("Crease")?.sog       ?? 0;
  const lCircle   = get("L Circle")?.sog     ?? 0;
  const rCircle   = get("R Circle")?.sog     ?? 0;
  const lPoint    = get("L Point")?.sog      ?? 0;
  const rPoint    = get("R Point")?.sog      ?? 0;
  const centerPt  = get("Center Point")?.sog ?? 0;
  const lNetSide  = get("L Net Side")?.sog   ?? 0;
  const rNetSide  = get("R Net Side")?.sog   ?? 0;
  const outsideL  = get("Outside L")?.sog    ?? 0;
  const outsideR  = get("Outside R")?.sog    ?? 0;
  const behindNet = get("Behind the Net")?.sog ?? 0;
  const lCorner   = get("L Corner")?.sog     ?? 0;
  const rCorner   = get("R Corner")?.sog     ?? 0;
  const beyondRed = get("Beyond Red Line")?.sog ?? 0;
  const offNeutral= get("Offensive Neutral Zone")?.sog ?? 0;

  const total     = totals.sog || 1;
  const sogRank   = totals.sogRank;
  const shRank    = totals.shootingPctgRank;
  const goalsRank = totals.goalsRank;
  const defShots  = def?.sog  ?? 0;
  const fwdShots  = fwd?.sog  ?? 1;
  const defShPctg = def?.shootingPctg  ?? 0;
  const fwdShPctg = fwd?.shootingPctg  ?? 0;

  // Zone ratios
  const highDanger  = (lowSlot + crease + lNetSide + rNetSide) / total;
  const slotShare   = (lowSlot + highSlot) / total;
  const pointShare  = (lPoint + rPoint + centerPt) / total;
  const circleShare = (lCircle + rCircle) / total;
  const perimShare  = (outsideL + outsideR + beyondRed + offNeutral) / total;
  const netFront    = (crease + lNetSide + rNetSide) / total;
  const cornerShare = (lCorner + rCorner + behindNet) / total;
  const defRatio    = defShots / (fwdShots + defShots);
  const creaseRate  = crease / total;
  const lowSlotRate = lowSlot / total;

  // Rank bands (proportional to pool size)
  const top10  = r => r <= Math.ceil(rankTotal * 0.10);
  const top25  = r => r <= Math.ceil(rankTotal * 0.25);
  const top40  = r => r <= Math.ceil(rankTotal * 0.40);
  const bot25  = r => r >= Math.floor(rankTotal * 0.75);
  const bot10  = r => r >= Math.floor(rankTotal * 0.90);
  const mid    = r => !top25(r) && !bot25(r);

  const elite     = top10(sogRank) && top10(shRank);
  const highVol   = top25(sogRank);
  const lowVol    = bot25(sogRank);
  const clinical  = top25(shRank);
  const vClinical = top10(shRank);
  const wild      = bot25(shRank);
  const vWild     = bot10(shRank);
  const prolific  = top25(goalsRank);
  const starved   = bot25(goalsRank);
  const defDriven = defRatio > 0.32;
  const fwdDriven = defRatio < 0.22;

  // ── Elite combos ──────────────────────────────────────────────────────
  if (elite && highDanger > 0.55)
    return { text: "Unstoppable · Elite danger from everywhere", icon: "⚡" };
  if (elite && slotShare > 0.48)
    return { text: "Slot dominators · Volume meets precision", icon: "🎯" };
  if (elite)
    return { text: "Complete attack · No weaknesses", icon: "👑" };

  // ── Crease & net-front ─────────────────────────────────────────────────
  if (creaseRate > 0.07 && netFront > 0.14 && vClinical)
    return { text: "Net-front assassins · Punish every scramble", icon: "🔪" };
  if (creaseRate > 0.07 && netFront > 0.14 && highVol)
    return { text: "Crease crashers · Swarm the paint relentlessly", icon: "💥" };
  if (creaseRate > 0.06 && highDanger > 0.55 && clinical)
    return { text: "High-danger hunters · Finish in tight", icon: "🎯" };
  if (creaseRate > 0.06 && highDanger > 0.55)
    return { text: "Net-front heavy · Life in the crease", icon: "🏒" };
  if (netFront > 0.13 && wild)
    return { text: "Traffic seekers · Quantity game near the net", icon: "📦" };

  // ── Slot-centric ───────────────────────────────────────────────────────
  if (lowSlotRate > 0.30 && vClinical)
    return { text: "Low slot snipers · Make every chance count", icon: "🎯" };
  if (lowSlotRate > 0.30 && highVol)
    return { text: "Slot-hungry · Shoot first, ask later", icon: "🔥" };
  if (lowSlotRate > 0.28 && clinical)
    return { text: "Direct and deadly · Straight to the slot", icon: "⚡" };
  if (slotShare > 0.50 && highVol && wild)
    return { text: "Volume merchants · Flood the slot", icon: "📊" };
  if (slotShare > 0.48 && clinical)
    return { text: "Structured attack · Earn the slot every time", icon: "🧩" };
  if (slotShare > 0.48)
    return { text: "Slot-first system · Everything runs through centre", icon: "🏒" };

  // ── High danger broad ──────────────────────────────────────────────────
  if (highDanger > 0.58 && highVol && clinical)
    return { text: "Danger zone addicts · High volume, high quality", icon: "🔥" };
  if (highDanger > 0.58 && highVol)
    return { text: "Inside-out attack · Earn it the hard way", icon: "💪" };
  if (highDanger > 0.58 && clinical)
    return { text: "Selective but lethal · Choose danger, convert", icon: "🎯" };
  if (highDanger > 0.55 && lowVol)
    return { text: "Opportunists · Wait for danger, then strike", icon: "🦊" };
  if (highDanger > 0.55)
    return { text: "High-danger focused · Willing to pay the price", icon: "💥" };

  // ── Blue-line / point shot heavy ───────────────────────────────────────
  if (pointShare > 0.24 && defDriven && vClinical)
    return { text: "D-zone snipers · Pinching blueline killers", icon: "🎯" };
  if (pointShare > 0.24 && defDriven && highVol)
    return { text: "Blue-line blitz · Active D driving offence", icon: "🔵" };
  if (pointShare > 0.22 && defDriven && clinical)
    return { text: "Point shot precision · Smart D with north-south reach", icon: "📐" };
  if (pointShare > 0.22 && defDriven)
    return { text: "Blue-line heavy · Defenders carry the load", icon: "🔵" };
  if (pointShare > 0.22 && highVol)
    return { text: "Point shot barrage · Screen and tip everything", icon: "🌊" };
  if (pointShare > 0.20 && clinical)
    return { text: "Long-range specialists · Make distance shots count", icon: "🎯" };
  if (pointShare > 0.20)
    return { text: "Perimeter to slot · Point shots feeding chaos", icon: "🔀" };

  // ── Circle-heavy ───────────────────────────────────────────────────────
  if (circleShare > 0.24 && vClinical)
    return { text: "Circle snipers · Ice-cold from the dots", icon: "❄️" };
  if (circleShare > 0.24 && highVol && clinical)
    return { text: "Faceoff circle threats · Wide and accurate", icon: "🎯" };
  if (circleShare > 0.22 && highVol)
    return { text: "Wide-angle offence · Circles as the launchpad", icon: "🔄" };
  if (circleShare > 0.22 && clinical)
    return { text: "Patient outside-in · Pick the spot, hit it", icon: "🧊" };
  if (circleShare > 0.20 && wild)
    return { text: "Spray and pray from the circles", icon: "🌀" };
  if (circleShare > 0.20)
    return { text: "Outside-in system · Circle shots feeding the slot", icon: "↩️" };

  // ── Perimeter / long range ─────────────────────────────────────────────
  if (perimShare > 0.12 && highVol && wild)
    return { text: "Long-range spammers · Quantity from distance", icon: "📡" };
  if (perimShare > 0.12 && highVol)
    return { text: "Perimeter volume team · Force rebounds everywhere", icon: "🌊" };
  if (perimShare > 0.10 && clinical)
    return { text: "Long-range precision · Surprising from distance", icon: "🎯" };

  // ── Corner / behind net ────────────────────────────────────────────────
  if (cornerShare > 0.06 && highDanger > 0.50)
    return { text: "Cycle masters · Work the corners, cash in close", icon: "🔄" };
  if (cornerShare > 0.06)
    return { text: "Grind it out · Board battles feeding the crease", icon: "💪" };

  // ── Volume extremes ────────────────────────────────────────────────────
  if (highVol && vClinical)
    return { text: "Offensive powerhouse · Generate and convert", icon: "⚡" };
  if (highVol && vWild)
    return { text: "Shoot-first mentality · Quantity over quality", icon: "🌀" };
  if (highVol && clinical)
    return { text: "High-tempo machine · Volume with purpose", icon: "🔥" };
  if (highVol && wild)
    return { text: "All gas no brakes · Shots from everywhere", icon: "💨" };
  if (highVol)
    return { text: "Volume-driven attack · Keep the goalie busy", icon: "📊" };

  // ── Low volume ─────────────────────────────────────────────────────────
  if (lowVol && vClinical && prolific)
    return { text: "Less is more · Ruthless efficiency", icon: "🔪" };
  if (lowVol && clinical)
    return { text: "Patient and precise · Low volume, high impact", icon: "🧊" };
  if (lowVol && wild && starved)
    return { text: "Offensively challenged · Rare shots, rare goals", icon: "😬" };
  if (lowVol && starved)
    return { text: "Quiet attack · Struggle to generate and convert", icon: "📉" };
  if (lowVol)
    return { text: "Conservative offence · Choose moments carefully", icon: "🕰️" };

  // ── D vs F driven ──────────────────────────────────────────────────────
  if (defDriven && clinical && prolific)
    return { text: "D-zone excellence · Defenders make the difference", icon: "🛡️" };
  if (defDriven && highVol)
    return { text: "D-led attack · Blueline carries the offensive load", icon: "🔵" };
  if (fwdDriven && vClinical)
    return { text: "Forward-driven · Elite scorers do the heavy lifting", icon: "⭐" };
  if (fwdDriven && highVol)
    return { text: "Forward-centric machine · D stay home", icon: "🏹" };

  // ── Efficiency combos ──────────────────────────────────────────────────
  if (vClinical && prolific)
    return { text: "Clinical finishers · Make every chance pay", icon: "💎" };
  if (vClinical)
    return { text: "Precision attack · Ice water in their veins", icon: "❄️" };
  if (clinical && prolific)
    return { text: "Efficient and dangerous · Quality over quantity", icon: "🎯" };
  if (clinical)
    return { text: "Selective shooters · Make every shot count", icon: "🧠" };
  if (vWild && highVol)
    return { text: "Chaotic offence · Shoot everything, score little", icon: "🎲" };
  if (wild)
    return { text: "Streaky attack · Hot and cold in waves", icon: "🌊" };

  // ── Fallback ───────────────────────────────────────────────────────────
  return { text: "Balanced attack · No clear signature zone", icon: "⚖️" };
}

export default function NHLShotMap() {
  const [db, setDb]         = useState(null);       // full loaded JSON
  const [loadErr, setLoadErr] = useState(null);
  const [teams, setTeams]   = useState([]);

  const [teamId, setTeamId] = useState(9);
  const [season, setSeason] = useState("20252026");
  const [gtype, setGtype]   = useState(2);
  const [hovered, setHovered] = useState(null);
  const [view, setView]     = useState("heatmap");
  const [metric, setMetric] = useState("sog");

  // Load the pre-fetched JSON on mount
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}nhl-data.json`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(json => {
        setDb(json);
        setTeams(json.teams || []);
      })
      .catch(err => {
        console.error("Failed to load nhl-data.json:", err);
        setLoadErr("Could not load NHL data. Run `npm run fetch-data` first.");
      });
  }, []);

  const team    = teams.find(t => t.id === teamId) || { name: "—", city: "—", abbr: "—", color: "#888" };
  const tc      = team.color || "#888";
  const key     = `${teamId}_${season}_${gtype}`;
  const rawData = db?.data?.[key];
  const slbl    = season ? `${season.slice(0,4)}–${season.slice(6)}` : "";

  // In playoffs mode, recalculate ranks using only playoff teams
  const playoffRanks  = gtype === 3 ? buildPlayoffRanks(db, season, gtype) : null;
  const playoffCount  = playoffRanks?.teamCount ?? 32;
  const data          = gtype === 3 ? playoffRanks?.byTeam?.[teamId] : rawData;
  const rankTotal     = gtype === 3 ? playoffCount : 32;

  const details = data?.shotLocationDetails || [];
  const totals  = data?.shotLocationTotals?.find(t => t.locationCode === "all" && t.position === "all");
  const fwd     = data?.shotLocationTotals?.find(t => t.locationCode === "all" && t.position === "F");
  const def     = data?.shotLocationTotals?.find(t => t.locationCode === "all" && t.position === "D");

  const mval = z => metric === "sog" ? z.sog : metric === "goals" ? z.goals : z.shootingPctg;
  const maxV = details.length ? Math.max(...details.map(mval), 0.001) : 1;

  const hovZ = hovered ? details.find(d => d.area === hovered) : null;

  // ── Archetype one-liner from data ───────────────────────────────────────
  const archetype = deriveArchetype(details, totals, fwd, def, rankTotal);

  const fetchedDate = db?.fetchedAt
    ? new Date(db.fetchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div style={{ minHeight:"100vh", background:"#07070F", display:"flex", alignItems:"center", justifyContent:"center", padding:"20px 12px", fontFamily:"'DM Mono','Courier New',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Anton&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .card{width:100%;max-width:560px;background:#0C0C18;border:1px solid #1C1C2C;border-radius:3px;overflow:hidden}
        .hdr{background:linear-gradient(155deg,${tc}1A 0%,transparent 55%);padding:22px 24px 18px;border-bottom:1px solid #181828;position:relative}
        .eyebrow{font-size:9px;letter-spacing:4px;color:#383848;margin-bottom:4px}
        .city{font-size:10px;letter-spacing:4px;color:#555;text-transform:uppercase}
        .teamname{font-family:'Anton',sans-serif;font-size:50px;letter-spacing:3px;line-height:1;color:${tc}}
        .abbr-bg{position:absolute;right:22px;top:18px;font-family:'Anton',sans-serif;font-size:72px;letter-spacing:4px;color:${tc};opacity:.07;line-height:1;pointer-events:none;user-select:none}
        .badge{display:inline-flex;align-items:center;gap:6px;margin-top:10px;font-size:9px;letter-spacing:2px;color:#444;border:1px solid #1E1E2E;padding:4px 10px;border-radius:2px}
        .bdot{width:5px;height:5px;border-radius:50%;background:${tc}}
        .ctrls{padding:10px 14px;display:flex;gap:8px;flex-wrap:wrap;background:#08080F;border-bottom:1px solid #181828}
        select{background:#10101C;border:1px solid #1E1E2E;color:#999;font-family:'DM Mono',monospace;font-size:10px;padding:6px 8px;border-radius:2px;outline:none;cursor:pointer;flex:1;min-width:100px}
        select:focus{border-color:${tc}77}
        .tog{display:flex;border:1px solid #1E1E2E;border-radius:2px;overflow:hidden}
        .tbtn{background:transparent;border:none;color:#444;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;padding:6px 10px;cursor:pointer;transition:all .15s;white-space:nowrap}
        .tbtn.on{background:${tc};color:#000;font-weight:500}
        .rink-wrap{position:relative;padding:14px 10px 0}
        .tip{position:absolute;z-index:20;pointer-events:none;background:#050510;border:1px solid ${tc}44;padding:10px 14px;border-radius:3px;font-size:10px;min-width:165px;top:16px;right:12px}
        .tip-h{color:${tc};letter-spacing:2px;font-size:9px;margin-bottom:7px}
        .tip-r{display:flex;justify-content:space-between;margin-bottom:3px;color:#555}
        .tip-v{color:#DDD}
        .tip-rk{margin-left:5px;font-size:8px}
        .sg{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#181828;border-top:1px solid #181828}
        .sc{background:#0C0C18;padding:14px 10px;text-align:center}
        .sn{font-family:'Anton',sans-serif;font-size:36px;letter-spacing:1px;line-height:1;color:${tc}}
        .sl{font-size:8px;letter-spacing:2px;color:#383848;margin-top:3px}
        .ss{font-size:8px;margin-top:2px}
        .pg{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#181828}
        .pc{background:#0C0C18;padding:12px 14px}
        .ph{font-size:8px;letter-spacing:3px;color:#383848;margin-bottom:8px}
        .pr{display:flex;justify-content:space-between;margin-bottom:4px}
        .pk{font-size:9px;color:#484858}
        .pv{font-size:11px;color:${tc}}
        .prk{font-size:8px;margin-left:3px}
        .leg{display:flex;gap:12px;padding:8px 14px;justify-content:flex-end}
        .li{display:flex;align-items:center;gap:4px;font-size:8px;letter-spacing:1px;color:#383848}
        .ld{width:6px;height:6px;border-radius:50%}
        .tw{overflow-x:auto}
        table{width:100%;border-collapse:collapse;font-size:10px}
        th{padding:8px 10px;text-align:right;color:#383848;letter-spacing:2px;font-size:8px;border-bottom:1px solid #181828}
        th:first-child{text-align:left}
        td{padding:7px 10px;text-align:right;border-bottom:1px solid #101018;color:#777}
        td:first-child{text-align:left;color:#BBB}
        tr:hover td{background:#10101C}
        .foot{padding:10px 20px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #181828;background:#08080F}
        .fl{font-size:8px;letter-spacing:2px;color:#252535}
        .archetype{margin-top:10px;display:inline-flex;align-items:center;gap:8px;background:${tc}18;border:1px solid ${tc}33;border-radius:3px;padding:5px 10px}
        .arch-icon{font-size:13px;line-height:1}
        .arch-text{font-size:11px;letter-spacing:1px;color:${tc};font-style:italic;}
        .err{padding:40px 20px;text-align:center;color:#F87171;font-size:10px;letter-spacing:2px;line-height:1.8}
      `}</style>

      <div className="card">
        {/* Header */}
        <div className="hdr">
          <div className="eyebrow">NHL EDGE // SHOT LOCATION REPORT</div>
          <div className="city">{team.city}</div>
          <div className="teamname">{team.name || "Loading…"}</div>
          <div className="archetype">
            {archetype && <>
              <span className="arch-icon">{archetype.icon}</span>
              <span className="arch-text">{archetype.text}</span>
            </>}
          </div>
          <img
            src={`https://assets.nhle.com/logos/nhl/svg/${team.abbr}_light.svg`}
            alt={team.name}
            onError={e => e.target.style.display="none"}
            style={{position:"absolute",right:"20px",top:"14px",width:"90px",height:"90px",objectFit:"contain",opacity:0.85}}
          />
          <div className="badge">
            <div className="bdot" />
            {slbl} · {gtype === 2 ? "REGULAR SEASON" : "PLAYOFFS"}
          </div>
        </div>

        {/* Controls */}
        <div className="ctrls">
          <select value={teamId} onChange={e => setTeamId(+e.target.value)} disabled={!teams.length}>
            {teams.map(t => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
          </select>
          <select value={season} onChange={e => setSeason(e.target.value)}>
            {SEASONS.map(s => <option key={s} value={s}>{s.slice(0,4)}–{s.slice(6)}</option>)}
          </select>
          <select value={gtype} onChange={e => setGtype(+e.target.value)}>
            {GAME_TYPES.map(g => <option key={g.v} value={g.v}>{g.l}</option>)}
          </select>
          <div className="tog">
            <button className={`tbtn ${view==="heatmap"?"on":""}`} onClick={()=>setView("heatmap")}>MAP</button>
            <button className={`tbtn ${view==="table"?"on":""}`} onClick={()=>setView("table")}>TABLE</button>
          </div>
        </div>

        {/* Error state */}
        {loadErr && (
          <div className="err">
            ⚠ {loadErr}<br/>
            <span style={{color:"#555",fontSize:"9px"}}>Run `npm run fetch-data` then restart the dev server.</span>
          </div>
        )}

        {/* Loading state */}
        {!db && !loadErr && (
          <div className="no-data">LOADING DATA ···</div>
        )}

        {/* No data for this combo */}
        {db && !data && !loadErr && (
          <div className="no-data">NO DATA FOR THIS SELECTION<br/><span style={{fontSize:"8px",color:"#252535"}}>(playoffs may not have been played)</span></div>
        )}

        {/* Heatmap view */}
        {data && view === "heatmap" && (
          <>
            <div style={{padding:"8px 14px",background:"#08080F",display:"flex",gap:"6px",alignItems:"center",borderBottom:"1px solid #181828"}}>
              <span style={{fontSize:"9px",letterSpacing:"2px",color:"#383848"}}>COLOR BY</span>
              {[["sog","SHOTS"],["goals","GOALS"],["pctg","SH%"]].map(([k,l]) => (
                <button key={k} className={`tbtn ${metric===k?"on":""}`}
                  style={{border:"1px solid #1E1E2E",borderRadius:"2px"}}
                  onClick={()=>setMetric(k)}>{l}</button>
              ))}
            </div>

            <div className="rink-wrap">
              {hovZ && (
                <div className="tip">
                  <div className="tip-h">{hovZ.area.toUpperCase()}</div>
                  <div className="tip-r"><span>Shots on Goal</span><span className="tip-v">{hovZ.sog}<span className="tip-rk" style={{color:rankColor(hovZ.sogRank, rankTotal)}}>#{hovZ.sogRank}</span></span></div>
                  <div className="tip-r"><span>Goals</span><span className="tip-v">{hovZ.goals}<span className="tip-rk" style={{color:rankColor(hovZ.goalsRank, rankTotal)}}>#{hovZ.goalsRank}</span></span></div>
                  <div className="tip-r"><span>Shooting %</span><span className="tip-v">{(hovZ.shootingPctg*100).toFixed(1)}%<span className="tip-rk" style={{color:rankColor(hovZ.shootingPctgRank, rankTotal)}}>#{hovZ.shootingPctgRank}</span></span></div>
                </div>
              )}

              <svg viewBox="0 0 640 430" style={{width:"100%",display:"block"}}>
                <defs>
                  <filter id="gl"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                </defs>
                <rect x="8" y="20" width="624" height="396" rx="62" fill="#0A0A18" stroke="#181828" strokeWidth="2"/>
                <line x1="8" y1="142" x2="632" y2="142" stroke="#182040" strokeWidth="1.5" strokeDasharray="5,4"/>
                <line x1="8" y1="106" x2="632" y2="106" stroke="#1A1628" strokeWidth="1" strokeDasharray="3,6"/>
                <ellipse cx="320" cy="378" rx="74" ry="22" fill="none" stroke="#1C2440" strokeWidth="1.5"/>
                <rect x="284" y="390" width="72" height="18" rx="2" fill="none" stroke="#1C1C32" strokeWidth="1.5"/>
                {[178,462].map(cx => (
                  <g key={cx}>
                    <circle cx={cx} cy="268" r="60" fill="none" stroke="#14142A" strokeWidth="1.5"/>
                    <circle cx={cx} cy="268" r="3" fill="#14142A"/>
                  </g>
                ))}

                {details.map(zone => {
                  const pos = ZONE_POS[zone.area];
                  if (!pos) return null;
                  const val       = mval(zone);
                  const intensity = Math.max(0.12, val / maxV);
                  const isHov     = hovered === zone.area;
                  const cx        = pos.x + pos.w / 2;
                  const cy        = pos.y + pos.h / 2;
                  const top       = metric === "sog" ? zone.sog : metric === "goals" ? zone.goals : `${(zone.shootingPctg*100).toFixed(0)}%`;
                  const sub       = metric === "sog" ? `${(zone.shootingPctg*100).toFixed(0)}%` : metric === "goals" ? `${zone.sog} sog` : `${zone.goals}g`;

                  return (
                    <g key={zone.area}
                      onMouseEnter={() => setHovered(zone.area)}
                      onMouseLeave={() => setHovered(null)}
                      style={{cursor:"pointer"}}
                    >
                      <rect x={pos.x} y={pos.y} width={pos.w} height={pos.h} rx="3"
                        fill={tc}
                        fillOpacity={isHov ? Math.min(intensity+0.28,0.94) : intensity*0.78}
                        stroke={isHov ? tc : "transparent"}
                        strokeWidth="1.5"
                        filter={isHov ? "url(#gl)" : ""}
                      />
                      <text x={cx} y={cy-4} textAnchor="middle" fill="#FFF" fillOpacity="0.88"
                        fontSize="11" fontFamily="Anton,sans-serif" letterSpacing="0.5" style={{pointerEvents:"none"}}>{top}</text>
                      <text x={cx} y={cy+10} textAnchor="middle" fill="#FFF" fillOpacity="0.52"
                        fontSize="8" fontFamily="DM Mono,monospace" style={{pointerEvents:"none"}}>{sub}</text>
                    </g>
                  );
                })}
                <text x="320" y="14" textAnchor="middle" fill="#181828" fontSize="7" fontFamily="DM Mono" letterSpacing="4">ATTACKING ZONE</text>
              </svg>
            </div>

            <div className="leg">
              {[["#00E5A0","TOP 15%"],["#6EE7B7","TOP 33%"],["#FCD34D","MID"],["#F87171","BOTTOM"]].map(([c,l]) => (
                <div key={l} className="li"><div className="ld" style={{background:c}}/>{l}</div>
              ))}
              {gtype === 3 && <div className="li" style={{color:"#333"}}>· of {rankTotal} teams</div>}
            </div>
          </>
        )}

        {/* Table view */}
        {data && view === "table" && (
          <div className="tw">
            <table>
              <thead>
                <tr><th>ZONE</th><th>SOG</th><th>RK</th><th>GOALS</th><th>RK</th><th>SH%</th><th>RK</th></tr>
              </thead>
              <tbody>
                {[...details].sort((a,b) => b.sog - a.sog).map(z => (
                  <tr key={z.area}>
                    <td>{z.area}</td>
                    <td>{z.sog}</td>
                    <td style={{color:rankColor(z.sogRank, rankTotal)}}>#{z.sogRank}</td>
                    <td>{z.goals}</td>
                    <td style={{color:rankColor(z.goalsRank, rankTotal)}}>#{z.goalsRank}</td>
                    <td>{(z.shootingPctg*100).toFixed(1)}%</td>
                    <td style={{color:rankColor(z.shootingPctgRank, rankTotal)}}>#{z.shootingPctgRank}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        {totals && (() => {
          const sv = vsAvg(totals.sog,           totals.sogLeagueAvg);
          const gv = vsAvg(totals.goals,         totals.goalsLeagueAvg);
          const pv = vsAvg(totals.shootingPctg,  totals.shootingPctgLeagueAvg);
          return (
            <div className="sg">
              {[
                { lbl:"SHOTS ON GOAL", val:totals.sog,                                 rank:totals.sogRank,          v:sv },
                { lbl:"GOALS",         val:totals.goals,                                rank:totals.goalsRank,        v:gv },
                { lbl:"SHOOTING %",    val:`${(totals.shootingPctg*100).toFixed(1)}%`,  rank:totals.shootingPctgRank, v:pv },
              ].map(s => (
                <div className="sc" key={s.lbl}>
                  <div className="sn">{s.val}</div>
                  <div className="sl">{s.lbl}</div>
                  <div className="ss" style={{color:rankColor(s.rank, rankTotal)}}>#{s.rank} of {rankTotal}</div>
                  <div className="ss" style={{color:s.v.color,fontSize:"8px",marginTop:"2px"}}>{s.v.sym} {s.v.txt}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* F/D split */}
        {fwd && def && (
          <div className="pg">
            {[{lbl:"FORWARDS",d:fwd},{lbl:"DEFENSEMEN",d:def}].map(({lbl,d}) => (
              <div className="pc" key={lbl}>
                <div className="ph">{lbl}</div>
                {[["Shots",d.sog,d.sogRank],["Goals",d.goals,d.goalsRank],["Sh%",`${(d.shootingPctg*100).toFixed(1)}%`,d.shootingPctgRank]].map(([k,v,r]) => (
                  <div className="pr" key={k}>
                    <span className="pk">{k}</span>
                    <span className="pv">{v}<span className="prk" style={{color:rankColor(r, rankTotal)}}>#{r}</span></span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="foot">
          <div className="fl">NHL EDGE API · api-web.nhle.com</div>
          {fetchedDate && <div className="fl">UPDATED {fetchedDate.toUpperCase()}</div>}
        </div>
      </div>
    </div>
  );
}
