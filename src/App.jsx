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

function vsAvg(val, avg, isPlayoffs) {
  const d = ((val - avg) / avg) * 100;
  if (d > 5)  return { sym: "▲", color: "#00E5A0", txt: `+${d.toFixed(0)}% vs ${isPlayoffs ? "playoff" : "league"} avg` };
  if (d < -5) return { sym: "▼", color: "#F87171", txt: `${d.toFixed(0)}% vs ${isPlayoffs ? "playoff" : "league"} avg` };
  return { sym: "●", color: "#FCD34D", txt: `≈ ${isPlayoffs ? "playoff" : "league"} avg` };
}

const SEASONS    = ["20252026", "20242025"];
const GAME_TYPES = [{ v: 2, l: "Regular Season" }, { v: 3, l: "Playoffs" }];

function buildPlayoffRanks(db, season, gtype) {
  if (!db) return null;
  const playoffTeamData = [];
  for (const [key, val] of Object.entries(db.data)) {
    const [tid, s, g] = key.split("_");
    if (s === season && parseInt(g) === gtype) {
      playoffTeamData.push({ teamId: parseInt(tid), data: val });
    }
  }
  if (playoffTeamData.length === 0) return null;
  const n = playoffTeamData.length;

  function rerank(getter) {
    const sorted = [...playoffTeamData]
      .map(t => ({ teamId: t.teamId, val: getter(t.data) }))
      .sort((a, b) => b.val - a.val);
    const rankMap = {};
    sorted.forEach((item, i) => { rankMap[item.teamId] = i + 1; });
    return rankMap;
  }

  const totalFields = [
    { lc: "all", pos: "all", key: "sog",          rankField: "sogRank" },
    { lc: "all", pos: "all", key: "goals",        rankField: "goalsRank" },
    { lc: "all", pos: "all", key: "shootingPctg", rankField: "shootingPctgRank" },
    { lc: "all", pos: "F",   key: "sog",          rankField: "sogRank" },
    { lc: "all", pos: "F",   key: "goals",        rankField: "goalsRank" },
    { lc: "all", pos: "F",   key: "shootingPctg", rankField: "shootingPctgRank" },
    { lc: "all", pos: "D",   key: "sog",          rankField: "sogRank" },
    { lc: "all", pos: "D",   key: "goals",        rankField: "goalsRank" },
    { lc: "all", pos: "D",   key: "shootingPctg", rankField: "shootingPctgRank" },
  ];

  const totalRankMaps = {};
  for (const f of totalFields) {
    const mapKey = `${f.lc}_${f.pos}_${f.rankField}`;
    totalRankMaps[mapKey] = rerank(d => {
      const row = d.shotLocationTotals?.find(t => t.locationCode === f.lc && t.position === f.pos);
      return row?.[f.key] ?? 0;
    });
  }

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

  const result = { teamCount: n, byTeam: {} };
  for (const { teamId, data } of playoffTeamData) {
    const newTotals = data.shotLocationTotals.map(row => {
      const newRow = { ...row };
      for (const f of totalFields) {
        if (row.locationCode === f.lc && row.position === f.pos) {
          const mapKey = `${f.lc}_${f.pos}_${f.rankField}`;
          newRow[f.rankField] = totalRankMaps[mapKey][teamId] ?? row[f.rankField];
        }
      }
      newRow.sogLeagueAvg          = playoffTeamData.reduce((s,t) => s + (t.data.shotLocationTotals.find(r=>r.locationCode===row.locationCode&&r.position===row.position)?.sog??0), 0) / n;
      newRow.goalsLeagueAvg        = playoffTeamData.reduce((s,t) => s + (t.data.shotLocationTotals.find(r=>r.locationCode===row.locationCode&&r.position===row.position)?.goals??0), 0) / n;
      newRow.shootingPctgLeagueAvg = playoffTeamData.reduce((s,t) => s + (t.data.shotLocationTotals.find(r=>r.locationCode===row.locationCode&&r.position===row.position)?.shootingPctg??0), 0) / n;
      return newRow;
    });
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

  const lowSlot    = get("Low Slot")?.sog      ?? 0;
  const crease     = get("Crease")?.sog        ?? 0;
  const lCircle    = get("L Circle")?.sog      ?? 0;
  const rCircle    = get("R Circle")?.sog      ?? 0;
  const lPoint     = get("L Point")?.sog       ?? 0;
  const rPoint     = get("R Point")?.sog       ?? 0;
  const centerPt   = get("Center Point")?.sog  ?? 0;
  const lNetSide   = get("L Net Side")?.sog    ?? 0;
  const rNetSide   = get("R Net Side")?.sog    ?? 0;
  const behindNet  = get("Behind the Net")?.sog ?? 0;
  const lCorner    = get("L Corner")?.sog      ?? 0;
  const rCorner    = get("R Corner")?.sog      ?? 0;

  const total      = totals.sog || 1;
  const sogRank    = totals.sogRank;
  const shRank     = totals.shootingPctgRank;
  const goalsRank  = totals.goalsRank;
  const defShots   = def?.sog ?? 0;
  const fwdShots   = fwd?.sog ?? 1;

  // Calibrated ratios (based on real 2025-26 league distribution)
  // High danger: range 0.286–0.385, median ~0.330
  // Crease rate: range 0.026–0.050, median ~0.035
  // Low slot:    range 0.220–0.304, median ~0.248
  // Point share: range 0.173–0.246, median ~0.210
  // Circle share:range 0.163–0.220, median ~0.198
  // Net front:   range 0.062–0.110, median ~0.083
  // Def ratio:   range 0.226–0.318, median ~0.270
  // Corner share:range 0.003–0.021, median ~0.011

  const highDanger  = (lowSlot + crease + lNetSide + rNetSide) / total;
  const pointShare  = (lPoint + rPoint + centerPt) / total;
  const circleShare = (lCircle + rCircle) / total;
  const netFront    = (crease + lNetSide + rNetSide) / total;
  const cornerShare = (lCorner + rCorner + behindNet) / total;
  const creaseRate  = crease / total;
  const lowSlotRate = lowSlot / total;
  const defRatio    = defShots / (fwdShots + defShots);

  // Tier thresholds — calibrated to real league spread
  const hdHigh  = highDanger  > 0.350;   // top ~8 teams
  const hdMid   = highDanger  > 0.325;   // top ~16 teams
  const crHigh  = creaseRate  > 0.043;   // top ~8 teams
  const crMid   = creaseRate  > 0.035;   // top ~16 teams
  const lsHigh  = lowSlotRate > 0.265;   // top ~8 teams
  const lsMid   = lowSlotRate > 0.248;   // top ~16 teams
  const ptHigh  = pointShare  > 0.230;   // top ~8 teams
  const ptMid   = pointShare  > 0.210;   // top ~16 teams
  const ciHigh  = circleShare > 0.210;   // top ~8 teams
  const ciMid   = circleShare > 0.197;   // top ~16 teams
  const nfHigh  = netFront    > 0.095;   // top ~8 teams
  const nfMid   = netFront    > 0.083;   // top ~16 teams
  const drHigh  = defRatio    > 0.300;   // top ~10 teams D-driven
  const drLow   = defRatio    < 0.252;   // bottom ~8 teams F-driven
  const coHigh  = cornerShare > 0.015;   // top ~8 teams
  const coMid   = cornerShare > 0.011;   // top ~16 teams

  // Rank bands proportional to pool size
  const top10  = r => r <= Math.ceil(rankTotal * 0.10);
  const top25  = r => r <= Math.ceil(rankTotal * 0.25);
  const bot25  = r => r >= Math.floor(rankTotal * 0.75);
  const bot10  = r => r >= Math.floor(rankTotal * 0.90);

  const elite     = top10(sogRank) && top10(shRank);
  const highVol   = top25(sogRank);
  const lowVol    = bot25(sogRank);
  const clinical  = top25(shRank);
  const vClinical = top10(shRank);
  const wild      = bot25(shRank);
  const vWild     = bot10(shRank);
  const prolific  = top25(goalsRank);
  const starved   = bot25(goalsRank);

  // ── Elite combos ────────────────────────────────────────────────────────
  if (elite && hdHigh && lsHigh)
    return { text: "Unstoppable · Elite danger from everywhere", icon: "⚡" };
  if (elite && ptHigh)
    return { text: "Complete package · Volume, precision, reach", icon: "👑" };
  if (elite)
    return { text: "Complete attack · No weaknesses", icon: "👑" };

  // ── Crease & net-front ───────────────────────────────────────────────────
  if (crHigh && nfHigh && vClinical)
    return { text: "Net-front assassins · Punish every scramble", icon: "🔪" };
  if (crHigh && nfHigh && highVol)
    return { text: "Crease crashers · Swarm the paint relentlessly", icon: "💥" };
  if (crHigh && hdHigh && clinical)
    return { text: "High-danger hunters · Finish in tight", icon: "🎯" };
  if (crHigh && nfHigh)
    return { text: "Net-front heavy · Life in the crease", icon: "🏒" };
  if (crMid && nfMid && hdHigh && highVol)
    return { text: "Inside-out attack · Earn it at the net", icon: "💪" };
  if (nfMid && wild)
    return { text: "Traffic seekers · Quantity game near the net", icon: "📦" };

  // ── Low slot dominant ────────────────────────────────────────────────────
  if (lsHigh && vClinical && prolific)
    return { text: "Low slot assassins · Ruthless from in close", icon: "🔪" };
  if (lsHigh && clinical)
    return { text: "Low slot snipers · Make every chance count", icon: "🎯" };
  if (lsHigh && highVol && wild)
    return { text: "Slot-hungry · Shoot first, ask later", icon: "🔥" };
  if (lsHigh && highVol)
    return { text: "Direct and dangerous · Straight to the slot", icon: "⚡" };

  // lsMid + hdMid: break into sub-types by secondary signal
  if (lsMid && hdMid && crMid && nfMid)
    return { text: "Paint crashers · Crease pressure with slot volume", icon: "🏒" };
  if (lsMid && hdMid && ptMid && drHigh)
    return { text: "Two-way threat · Slot attack plus active blue line", icon: "🔵" };
  if (lsMid && hdMid && ciMid)
    return { text: "Inside-out blend · Slot and circle attack combined", icon: "🔀" };
  if (lsMid && hdMid && coMid && wild)
    return { text: "Physical and scattered · Boards to slot without bite", icon: "💪" };
  if (lsMid && hdMid && coMid)
    return { text: "Physical attack · Corners to slot grind game", icon: "💪" };
  if (lsMid && hdMid && wild)
    return { text: "Slot-heavy shooters · Volume without precision", icon: "🔥" };
  if (lsMid && hdMid && clinical)
    return { text: "Slot-focused and efficient · Earn it up close", icon: "🎯" };
  if (lsMid && hdMid)
    return { text: "Slot-first system · Everything runs through centre", icon: "🏒" };

  // ── High danger broad ────────────────────────────────────────────────────
  if (hdHigh && highVol && clinical)
    return { text: "Danger zone addicts · High volume, high quality", icon: "🔥" };
  if (hdHigh && highVol)
    return { text: "High-danger hunters who live in the slot", icon: "💥" };
  if (hdHigh && clinical)
    return { text: "Selective but lethal · Choose danger, convert", icon: "🎯" };
  if (hdHigh && lowVol)
    return { text: "Opportunists · Wait for danger, then strike", icon: "🦊" };
  if (hdHigh)
    return { text: "High-danger focused · Willing to pay the price", icon: "💥" };
  if (hdMid && clinical && prolific)
    return { text: "Efficient inside-out · Danger with purpose", icon: "🎯" };

  // ── Point shot heavy ─────────────────────────────────────────────────────
  if (ptHigh && drHigh && vClinical)
    return { text: "D-zone snipers · Pinching blueline killers", icon: "🎯" };
  if (ptHigh && drHigh && highVol)
    return { text: "Blue-line blitz · Active D driving offence", icon: "🔵" };
  if (ptHigh && drHigh)
    return { text: "Blue-line heavy · Defenders carry the load", icon: "🔵" };
  if (ptHigh && highVol && wild)
    return { text: "Point shot barrage · Screen and tip everything", icon: "🌊" };
  if (ptHigh && clinical)
    return { text: "Long-range specialists · Make distance shots count", icon: "🎯" };
  if (ptHigh)
    return { text: "Perimeter to slot · Point shots feeding chaos", icon: "🔀" };
  if (ptMid && drHigh && clinical)
    return { text: "Point shot precision · Smart D with reach", icon: "📐" };
  if (ptMid && drHigh)
    return { text: "D-led attack · Blueline carries the offensive load", icon: "🔵" };

  // ── Circle-heavy ─────────────────────────────────────────────────────────
  if (ciHigh && vClinical)
    return { text: "Circle snipers · Ice-cold from the dots", icon: "❄️" };
  if (ciHigh && highVol && clinical)
    return { text: "Faceoff circle threats · Wide and accurate", icon: "🎯" };
  if (ciHigh && highVol)
    return { text: "Wide-angle offence · Circles as the launchpad", icon: "🔄" };
  if (ciHigh && clinical)
    return { text: "Patient outside-in · Pick the spot, hit it", icon: "🧊" };
  if (ciHigh && wild)
    return { text: "Spray and pray from the circles", icon: "🌀" };
  if (ciHigh)
    return { text: "Outside-in system · Circle shots feeding the slot", icon: "↩️" };
  if (ciMid && ptMid)
    return { text: "Wide perimeter attack · Circles and points combined", icon: "🔄" };

  // ── Corner / cycle ───────────────────────────────────────────────────────
  if (coHigh && hdMid && clinical)
    return { text: "Cycle masters · Work the corners, cash in close", icon: "🔄" };
  if (coHigh && highVol)
    return { text: "Grind it out · Board battles feeding the crease", icon: "💪" };
  if (coMid && nfMid)
    return { text: "Below the goal line · Corners to crease game", icon: "🔃" };

  // ── Forward vs D driven ──────────────────────────────────────────────────
  if (drLow && vClinical && prolific)
    return { text: "Forward-driven · Elite scorers carry the load", icon: "⭐" };
  if (drLow && highVol && clinical)
    return { text: "Forward-centric machine · Forwards carry everything", icon: "🏹" };
  if (drHigh && clinical && prolific)
    return { text: "D-zone excellence · Defenders make the difference", icon: "🛡️" };
  if (drHigh && highVol)
    return { text: "D-led attack · Blueline carries the offensive load", icon: "🔵" };

  // ── Volume extremes ──────────────────────────────────────────────────────
  if (highVol && vClinical && prolific)
    return { text: "Offensive powerhouse · Generate and convert", icon: "⚡" };
  if (highVol && vWild)
    return { text: "Shoot-first mentality · Quantity over quality", icon: "🌀" };
  if (highVol && clinical)
    return { text: "High-tempo machine · Volume with purpose", icon: "🔥" };
  if (highVol && wild)
    return { text: "All gas no brakes · Shots from everywhere", icon: "💨" };
  if (highVol)
    return { text: "Volume-driven attack · Keep the goalie busy", icon: "📊" };

  // ── Low volume ───────────────────────────────────────────────────────────
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

  // ── Efficiency fallbacks ─────────────────────────────────────────────────
  if (vClinical && prolific)
    return { text: "Clinical finishers · Make every chance pay", icon: "💎" };
  if (vClinical)
    return { text: "Precision attack · Ice water in their veins", icon: "❄️" };
  if (clinical && prolific)
    return { text: "Efficient and dangerous · Quality over quantity", icon: "🎯" };
  if (clinical && coMid)
    return { text: "Quiet efficiency · Grind-style attack that converts", icon: "🧠" };
  if (clinical)
    return { text: "Selective shooters · Make every shot count", icon: "🧠" };
  if (vWild && highVol)
    return { text: "Chaotic offence · Shoot everything, score little", icon: "🎲" };
  if (wild)
    return { text: "Streaky attack · Hot and cold in waves", icon: "🌊" };
  if (coMid)
    return { text: "Grinding offence · Methodical cycle-based attack", icon: "⚙️" };
  if (nfMid)
    return { text: "Net-presence game · Screens and tips off the rush", icon: "🏒" };

  return { text: "Balanced attack · No clear signature zone", icon: "⚖️" };
}

export default function NHLShotMap() {
  const [db, setDb]           = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [teams, setTeams]     = useState([]);
  const [teamId, setTeamId]   = useState(9);
  const [season, setSeason]   = useState("20252026");
  const [gtype, setGtype]     = useState(2);
  const [hovered, setHovered] = useState(null);
  const [view, setView]       = useState("heatmap");
  const [metric, setMetric]   = useState("sog");

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}nhl-data.json`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(json => { setDb(json); setTeams(json.teams || []); })
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

  const playoffRanks = gtype === 3 ? buildPlayoffRanks(db, season, gtype) : null;
  const playoffCount = playoffRanks?.teamCount ?? 32;
  const data         = gtype === 3 ? playoffRanks?.byTeam?.[teamId] : rawData;
  const rankTotal    = gtype === 3 ? playoffCount : 32;

  const details = data?.shotLocationDetails || [];
  const totals  = data?.shotLocationTotals?.find(t => t.locationCode === "all" && t.position === "all");
  const fwd     = data?.shotLocationTotals?.find(t => t.locationCode === "all" && t.position === "F");
  const def     = data?.shotLocationTotals?.find(t => t.locationCode === "all" && t.position === "D");

  const mval = z => metric === "sog" ? z.sog : metric === "goals" ? z.goals : z.shootingPctg;
  const maxV = details.length ? Math.max(...details.map(mval), 0.001) : 1;

  const hovZ = hovered ? details.find(d => d.area === hovered) : null;

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
        .archetype{margin-top:10px;display:inline-flex;align-items:center;gap:8px;background:${tc}18;border:1px solid ${tc}33;border-radius:3px;padding:5px 10px}
        .arch-icon{font-size:13px;line-height:1}
        .arch-text{font-size:11px;letter-spacing:1px;color:${tc};font-style:italic}
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
        .no-data{padding:60px 20px;text-align:center;color:#333;font-size:10px;letter-spacing:3px}
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
          const sv = vsAvg(totals.sog,          totals.sogLeagueAvg,          gtype === 3);
          const gv = vsAvg(totals.goals,        totals.goalsLeagueAvg,        gtype === 3);
          const pv = vsAvg(totals.shootingPctg, totals.shootingPctgLeagueAvg, gtype === 3);
          return (
            <div className="sg">
              {[
                { lbl:"SHOTS ON GOAL", val:totals.sog,                                rank:totals.sogRank,          v:sv },
                { lbl:"GOALS",         val:totals.goals,                               rank:totals.goalsRank,        v:gv },
                { lbl:"SHOOTING %",    val:`${(totals.shootingPctg*100).toFixed(1)}%`, rank:totals.shootingPctgRank, v:pv },
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
