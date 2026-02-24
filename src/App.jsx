import { useState, useEffect } from "react";

const ZONE_POS = {
  // ── Above red line ────────────────────────────────────────────────────
  "Beyond Red Line":        { x:130, y:14,  w:380, h:40  },
  // ── Between red (y=110) and blue (y=196) line ─────────────────────────
  "Offensive Neutral Zone": { x:130, y:114, w:380, h:82  },
  // ── Points row ───────────────────────────────────────────────────────
  "L Point":                { x:12,  y:200, w:118, h:50  },
  "Center Point":           { x:134, y:200, w:372, h:50  },
  "R Point":                { x:510, y:200, w:118, h:50  },
  // ── Outside lanes (span both bands) ──────────────────────────────────
  "Outside L":              { x:12,  y:254, w:64,  h:114 },
  "Outside R":              { x:564, y:254, w:64,  h:114 },
  // ── Upper band ───────────────────────────────────────────────────────
  "L Circle":               { x:80,  y:254, w:136, h:64  },
  "High Slot":              { x:220, y:254, w:200, h:64  },
  "R Circle":               { x:424, y:254, w:136, h:64  },
  // ── Lower band ───────────────────────────────────────────────────────
  "L Net Side":             { x:80,  y:322, w:136, h:38  },
  "Low Slot":               { x:220, y:322, w:200, h:38  },
  "R Net Side":             { x:424, y:322, w:136, h:38  },
  // ── Goal area — corners flank crease+behind-net as tall pillars ───────
  "L Corner":               { x:12,  y:364, w:78,  h:16  },
  "R Corner":               { x:550, y:364, w:78,  h:16  },
  // ── Crease starts exactly at goal line (y=380), same width as Low Slot
  "Crease":                 { x:220, y:364, w:200, h:16  },
  // ── Behind the net ────────────────────────────────────────────────────
  "Behind the Net":         { x:12,  y:384, w:616, h:44  },
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

  const r = (text, sub, icon) => ({ text, sub, icon });

  // ── Elite combos ────────────────────────────────────────────────────────
  if (elite && hdHigh && lsHigh)
    return r("Unstoppable", "Top-tier shot volume, elite conversion rate, and a suffocating presence in the most dangerous zones", "⚡");
  if (elite && ptHigh)
    return r("Complete package", "High shot volume and top-end shooting % with a long reach that stretches defences from every angle", "👑");
  if (elite)
    return r("Complete attack", "Among the league's best at generating shots and converting them — no obvious weakness to exploit", "👑");

  // ── Crease & net-front ───────────────────────────────────────────────────
  if (crHigh && nfHigh && vClinical)
    return r("Net-front assassins", "An unusually high share of shots come from the crease and net-front — and they finish them at an elite rate", "🔪");
  if (crHigh && nfHigh && highVol)
    return r("Crease crashers", "High-volume net-front attack — they flood the paint and generate chaos in front of the goalie", "💥");
  if (crHigh && hdHigh && clinical)
    return r("High-danger hunters", "Prioritises shots from the crease and high-danger areas, and converts them efficiently", "🎯");
  if (crHigh && nfHigh)
    return r("Net-front heavy", "Above-average crease and net-front volume — much of the offence is generated right in front of the goalie", "🏒");
  if (crMid && nfMid && hdHigh && highVol)
    return r("Inside-out attack", "High shot volume with strong net-front presence — earns its looks the hard way by working into tight spaces", "💪");
  if (nfMid && wild)
    return r("Traffic seekers", "Sends plenty of shots through net-front traffic but struggles to convert — quantity over quality near the crease", "📦");

  // ── Low slot dominant ────────────────────────────────────────────────────
  if (lsHigh && vClinical && prolific)
    return r("Low slot assassins", "Generates a league-high share of shots from the low slot and converts them at an elite rate — the most dangerous spot on the ice", "🔪");
  if (lsHigh && clinical)
    return r("Low slot snipers", "Attacks the low slot more than almost any team, and is efficient at converting those high-quality looks", "🎯");
  if (lsHigh && highVol && wild)
    return r("Slot-hungry", "Floods the low slot with volume but shoots inconsistently — lots of attempts, variable results", "🔥");
  if (lsHigh && highVol)
    return r("Direct and dangerous", "High shot volume concentrated in the low slot — a direct, straight-to-the-danger-zone approach", "⚡");

  // lsMid + hdMid: break into sub-types by secondary signal
  if (lsMid && hdMid && crMid && nfMid)
    return r("Paint crashers", "Above-average slot volume paired with a notable crease presence — pushes hard into the most dangerous ice", "🏒");
  if (lsMid && hdMid && ptMid && drHigh)
    return r("Two-way threat", "Combines solid slot attack from forwards with active defenders who pinch and contribute from the blue line", "🔵");
  if (lsMid && hdMid && ciMid)
    return r("Inside-out blend", "Attacks from both the low slot and the faceoff circles — a balanced inside-out system that covers the middle third of the ice", "🔀");
  if (lsMid && hdMid && coMid && wild)
    return r("Physical and scattered", "Works the corners and boards into slot shots but misfires often — a physical game that lacks finishing precision", "💪");
  if (lsMid && hdMid && coMid)
    return r("Physical attack", "Earns slot chances through cycle work and corner battles — a grinding, possession-based style", "💪");
  if (lsMid && hdMid && wild)
    return r("Slot-heavy shooters", "Generates a good share of shots from the slot area but shoots below average — volume without enough finish", "🔥");
  if (lsMid && hdMid && clinical)
    return r("Slot-focused and efficient", "Directs shots toward the slot and high-danger areas, and converts those chances at a good rate", "🎯");
  if (lsMid && hdMid)
    return r("Slot-first system", "Funnels most of its attack through the centre of the ice — structured offence built around the slot and low-danger entry", "🏒");

  // ── High danger broad ────────────────────────────────────────────────────
  if (hdHigh && highVol && clinical)
    return r("Danger zone addicts", "Top-tier shot volume with an exceptionally high proportion coming from high-danger areas — and they're converting", "🔥");
  if (hdHigh && highVol)
    return r("High-danger hunters", "Generates huge shot volume from the slot and dangerous areas — relentless at getting to the hardest spots to defend", "💥");
  if (hdHigh && clinical)
    return r("Selective but lethal", "Doesn't overwhelm with volume but picks high-danger spots deliberately and converts at a strong rate", "🎯");
  if (hdHigh && lowVol)
    return r("Opportunists", "Low overall shot volume but a high proportion from dangerous zones — waits for the right moment, then strikes", "🦊");
  if (hdHigh)
    return r("High-danger focused", "A top-percentile share of shots from the most dangerous ice — willing to grind into tight spaces to get quality looks", "💥");
  if (hdMid && clinical && prolific)
    return r("Efficient inside-out", "Above-average danger-zone share combined with above-average conversion — a purposeful attack that makes chances count", "🎯");

  // ── Point shot heavy ─────────────────────────────────────────────────────
  if (ptHigh && drHigh && vClinical)
    return r("D-zone snipers", "Defenders generate a league-high share of shots from the point — and those shots are finding the net at an elite rate", "🎯");
  if (ptHigh && drHigh && highVol)
    return r("Blue-line blitz", "Active pinching defenders flood the zone with point shots, generating volume and creating deflection and tip-in opportunities", "🔵");
  if (ptHigh && drHigh)
    return r("Blue-line heavy", "Defenders contribute an unusually high share of total shots — the offence is built around point shot generation and traffic", "🔵");
  if (ptHigh && highVol && wild)
    return r("Point shot barrage", "High-volume attack with a strong blue-line component — lots of point shots looking for screens and redirects, but inconsistent results", "🌊");
  if (ptHigh && clinical)
    return r("Long-range specialists", "Higher-than-average point shot volume and an ability to convert from distance — defenders and long-range shooters carry offensive weight", "🎯");
  if (ptHigh)
    return r("Perimeter to slot", "Generates a significant share of shots from the point — uses blue-line pressure to open up space and create second-chance opportunities", "🔀");
  if (ptMid && drHigh && clinical)
    return r("Point shot precision", "Defenders punch above their weight — a high defensive shot share paired with above-average conversion keeps opponents honest", "📐");
  if (ptMid && drHigh)
    return r("D-led attack", "Defenders contribute more than average to total shot volume — a blue-line-driven system that relies on point shot generation", "🔵");

  // ── Circle-heavy ─────────────────────────────────────────────────────────
  if (ciHigh && vClinical)
    return r("Circle snipers", "An exceptionally high share of shots from the faceoff circles, converted at an elite rate — precise shooters who thrive from the dots", "❄️");
  if (ciHigh && highVol && clinical)
    return r("Faceoff circle threats", "Above-average shot volume from the circles with good conversion — a wide, accurate attack that stretches defences laterally", "🎯");
  if (ciHigh && highVol)
    return r("Wide-angle offence", "Generates lots of shots from the faceoff circles — a wide-angle attack that tests goalies from the perimeter before finding the slot", "🔄");
  if (ciHigh && clinical)
    return r("Patient outside-in", "Shoots frequently from the circles and converts efficiently — picks spots from distance rather than forcing traffic in tight", "🧊");
  if (ciHigh && wild)
    return r("Spray and pray", "Unusually high circle shot volume but poor conversion — fires from the dots at high volume without consistent results", "🌀");
  if (ciHigh)
    return r("Outside-in system", "A high proportion of shots originate from the faceoff circles — uses wide-angle attempts to set up rebounds and tips in the slot", "↩️");
  if (ciMid && ptMid)
    return r("Wide perimeter attack", "Combines above-average point shot and circle activity — a system that attacks from the perimeter and looks to funnel pucks inside", "🔄");

  // ── Corner / cycle ───────────────────────────────────────────────────────
  if (coHigh && hdMid && clinical)
    return r("Cycle masters", "Works the cycle game hard — wins pucks behind the net and in the corners and converts the resulting slot chances efficiently", "🔄");
  if (coHigh && highVol)
    return r("Grind it out", "High corner and behind-the-net activity feeds a high-volume attack — earns shots through sustained board battles and cycle pressure", "💪");
  if (coMid && nfMid)
    return r("Below the goal line", "Uses corner and behind-net possession to manufacture net-front opportunities — a below-the-hash-marks system", "🔃");

  // ── Forward vs D driven ──────────────────────────────────────────────────
  if (drLow && vClinical && prolific)
    return r("Forward-driven", "Forwards carry almost all offensive responsibility — elite forward shooting keeps the attack dangerous despite minimal blue-line contribution", "⭐");
  if (drLow && highVol && clinical)
    return r("Forward-centric machine", "High-volume attack generated almost entirely by forwards — defenders stay conservative while the forward group does the heavy lifting", "🏹");
  if (drHigh && clinical && prolific)
    return r("D-zone excellence", "Defenders contribute an outsized share of goals and shots — a system that weaponises the blue line with precision", "🛡️");
  if (drHigh && highVol)
    return r("D-led attack", "Defenders generate a top-percentile share of total shots — pinching aggressively and driving volume from the blue line", "🔵");

  // ── Volume extremes ──────────────────────────────────────────────────────
  if (highVol && vClinical && prolific)
    return r("Offensive powerhouse", "Top-quartile shot volume combined with elite conversion — generating and finishing chances at an elite level", "⚡");
  if (highVol && vWild)
    return r("Shoot-first mentality", "One of the highest shot volumes in the league but a bottom-tier shooting % — quantity over quality defines this attack", "🌀");
  if (highVol && clinical)
    return r("High-tempo machine", "Generates shots at a high rate and converts above average — a fast, purposeful attack with both volume and efficiency", "🔥");
  if (highVol && wild)
    return r("All gas no brakes", "Fires shots at an above-average rate from all over the ice but struggles to convert — a high-energy, low-precision attack", "💨");
  if (highVol)
    return r("Volume-driven attack", "One of the higher shot totals in the league — keeps the pressure on by outshooting opponents and banking on volume", "📊");

  // ── Low volume ───────────────────────────────────────────────────────────
  if (lowVol && vClinical && prolific)
    return r("Less is more", "Bottom-quartile shot volume but elite shooting % — maximises every look and scores more than the shot count suggests", "🔪");
  if (lowVol && clinical)
    return r("Patient and precise", "Generates fewer shots than most but converts them at an above-average rate — a selective, quality-over-quantity approach", "🧊");
  if (lowVol && wild && starved)
    return r("Offensively challenged", "Low shot volume and poor conversion — struggles both to generate chances and to finish when they do get one", "😬");
  if (lowVol && starved)
    return r("Quiet attack", "Low shots and goals suggest an offence that can't consistently generate or convert — a team that needs to create more looks", "📉");
  if (lowVol)
    return r("Conservative offence", "Generates fewer shots than average — a patient system that prioritises shot quality and waits for the right moment", "🕰️");

  // ── Efficiency fallbacks ─────────────────────────────────────────────────
  if (vClinical && prolific)
    return r("Clinical finishers", "Elite shooting % drives outsized goal totals — makes every shot count and punishes opponents for leaving any space", "💎");
  if (vClinical)
    return r("Precision attack", "Top-tier shooting % despite average volume — a disciplined, accurate attack that wastes very few scoring chances", "❄️");
  if (clinical && prolific)
    return r("Efficient and dangerous", "Above-average shooting % and goal production — a quality-first approach that generates more goals than raw shot count would suggest", "🎯");
  if (clinical && coMid)
    return r("Quiet efficiency", "A grinding, cycle-based attack that converts chances at a solid rate — unspectacular but effective", "🧠");
  if (clinical)
    return r("Selective shooters", "Above-average shooting % — picks spots carefully and converts more than the volume suggests", "🧠");
  if (vWild && highVol)
    return r("Chaotic offence", "High shot volume but a bottom-tier conversion rate — fires from everywhere but struggles to beat goalies consistently", "🎲");
  if (wild)
    return r("Streaky attack", "Below-average shooting % — tends to run hot and cold, capable of big nights but inconsistent over stretches", "🌊");
  if (coMid)
    return r("Grinding offence", "Works the cycle game and generates shots through board battles and sustained pressure — a methodical, physical approach", "⚙️");
  if (nfMid)
    return r("Net-presence game", "Creates a solid number of looks through net-front screens and deflections — traffic and tips are part of the identity", "🏒");

  return r("Balanced attack", "No single zone or style dominates — an even spread of shot locations with average conversion across the board", "⚖️");
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

  // Stat leaders for this team/season/gtype
  const leaders = db?.leaders?.[key] ?? null;

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
        .archetype{margin-top:10px;display:inline-flex;align-items:flex-start;gap:9px;background:${tc}18;border:1px solid ${tc}33;border-radius:3px;padding:8px 12px;max-width:calc(100% - 110px)}
        .arch-icon{font-size:14px;line-height:1.4;flex-shrink:0}
        .arch-body{display:flex;flex-direction:column;gap:3px}
        .arch-text{font-size:11px;letter-spacing:1px;color:${tc};font-style:italic;line-height:1.3}
        .arch-sub{font-size:9px;letter-spacing:0.2px;color:${tc};opacity:0.5;line-height:1.55;font-style:normal}
        .badge{display:inline-flex;align-items:center;gap:6px;margin-top:10px;font-size:9px;letter-spacing:2px;color:#444;border:1px solid #1E1E2E;padding:4px 10px;border-radius:2px}
        .bdot{width:5px;height:5px;border-radius:50%;background:${tc}}
        .ctrls{padding:10px 14px;display:flex;gap:6px;align-items:center;background:#08080F;border-bottom:1px solid #181828}
        select{background:#10101C;border:1px solid #1E1E2E;color:#999;font-family:'DM Mono',monospace;font-size:10px;padding:5px 7px;border-radius:2px;outline:none;cursor:pointer}
        select:focus{border-color:${tc}77}
        .sel-team{flex:1;min-width:0}
        .sel-season{width:74px;flex-shrink:0}
        .sel-gtype{width:90px;flex-shrink:0}
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
        .s-leader{margin-top:8px;padding-top:7px;border-top:1px solid #1A1A2A;display:flex;flex-direction:column;gap:2px;align-items:center}
        .s-leader-val{font-family:'Anton',sans-serif;font-size:16px;letter-spacing:1px;line-height:1;color:${tc};opacity:0.8}
        .s-leader-name{font-size:8px;letter-spacing:1.5px;color:#484858;text-transform:uppercase}
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
              <span className="arch-body">
                <span className="arch-text">{archetype.text}</span>
                <span className="arch-sub">{archetype.sub}</span>
              </span>
            </>}
          </div>
          <img
            src={`https://assets.nhle.com/logos/nhl/svg/${team.abbr}_light.svg`}
            alt={team.name}
            onError={e => e.target.style.display="none"}
            style={{position:"absolute",right:"20px",top:"50%",transform:"translateY(-50%)",width:"84px",height:"84px",objectFit:"contain",opacity:0.85}}
          />
          <div className="badge">
            <div className="bdot" />
            {slbl} · {gtype === 2 ? "REGULAR SEASON" : "PLAYOFFS"}
          </div>
        </div>

        {/* Controls */}
        <div className="ctrls">
          <select className="sel-team" value={teamId} onChange={e => setTeamId(+e.target.value)} disabled={!teams.length}>
            {teams.map(t => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
          </select>
          <select className="sel-season" value={season} onChange={e => setSeason(e.target.value)}>
            {SEASONS.map(s => <option key={s} value={s}>{s.slice(0,4)}–{s.slice(6)}</option>)}
          </select>
          <select className="sel-gtype" value={gtype} onChange={e => setGtype(+e.target.value)}>
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

              <svg viewBox="0 0 640 440" style={{width:"100%",display:"block"}}>
                <defs>
                  <filter id="gl"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                  <clipPath id="rink-clip">
                    <rect x="10" y="10" width="620" height="420" rx="58"/>
                  </clipPath>
                </defs>

                {/* Rink surface */}
                <rect x="10" y="10" width="620" height="420" rx="58" fill="#09091A" stroke="#252540" strokeWidth="2.5"/>

                {/* Offensive zone subtle tint */}
                <rect x="10" y="196" width="620" height="234" fill="#0B0B20" clipPath="url(#rink-clip)"/>

                {/* Blue line */}
                <line x1="10" y1="196" x2="630" y2="196" stroke="#1A2E6E" strokeWidth="8" clipPath="url(#rink-clip)"/>

                {/* Red center line dashed */}
                <line x1="10" y1="110" x2="630" y2="110" stroke="#5A1010" strokeWidth="4" strokeDasharray="18,10" clipPath="url(#rink-clip)"/>

                {/* Goal line */}
                <line x1="60" y1="380" x2="580" y2="380" stroke="#5A1010" strokeWidth="2.5" clipPath="url(#rink-clip)"/>

                {/* Goal crease fill */}
                <path d="M 272 380 A 48 36 0 0 1 368 380 Z" fill="#0D1A3A" clipPath="url(#rink-clip)"/>
                {/* Goal crease arc */}
                <path d="M 272 380 A 48 36 0 0 1 368 380" fill="none" stroke="#1A2E6E" strokeWidth="2" clipPath="url(#rink-clip)"/>
                {/* Offensive zone faceoff circles with hash marks */}
                {[168, 472].map(cx => (
                  <g key={cx} clipPath="url(#rink-clip)">
                    <circle cx={cx} cy="300" r="58" fill="none" stroke="#1E1040" strokeWidth="2"/>
                    <circle cx={cx} cy="300" r="4" fill="#2A1050"/>
                    {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sy],i) => (
                      <line key={i} x1={cx+sx*38} y1={300+sy*42} x2={cx+sx*50} y2={300+sy*42} stroke="#1E1040" strokeWidth="1.5"/>
                    ))}
                    {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sy],i) => (
                      <line key={"v"+i} x1={cx+sx*42} y1={300+sy*38} x2={cx+sx*42} y2={300+sy*50} stroke="#1E1040" strokeWidth="1.5"/>
                    ))}
                  </g>
                ))}

                {/* Neutral zone faceoff dots */}
                {[168, 472].map(cx => (
                  <circle key={"nz"+cx} cx={cx} cy="158" r="4" fill="#1E1040" clipPath="url(#rink-clip)"/>
                ))}

                {/* Center ice circle + dot */}
                <circle cx="320" cy="110" r="46" fill="none" stroke="#1A2E6E" strokeWidth="1.5" clipPath="url(#rink-clip)"/>
                <circle cx="320" cy="110" r="4" fill="#1A2E6E" clipPath="url(#rink-clip)"/>

                {/* Boards outline on top */}
                <rect x="10" y="10" width="620" height="420" rx="58" fill="none" stroke="#2A2A48" strokeWidth="3"/>

                {/* Zone label */}
                <text x="320" y="26" textAnchor="middle" fill="#1C1C34" fontSize="7" fontFamily="DM Mono" letterSpacing="4">ATTACKING ZONE</text>

                {/* Heat zones rendered over rink markings */}
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
                      <rect x={pos.x} y={pos.y} width={pos.w} height={pos.h} rx="4"
                        fill={tc}
                        fillOpacity={isHov ? Math.min(intensity+0.28,0.94) : intensity*0.75}
                        stroke={isHov ? tc : tc+"44"}
                        strokeWidth={isHov ? "1.5" : "0.5"}
                        filter={isHov ? "url(#gl)" : ""}
                      />
                      <text x={cx} y={cy-4} textAnchor="middle" fill="#FFF" fillOpacity="0.9"
                        fontSize="11" fontFamily="Anton,sans-serif" letterSpacing="0.5" style={{pointerEvents:"none"}}>{top}</text>
                      <text x={cx} y={cy+10} textAnchor="middle" fill="#FFF" fillOpacity="0.5"
                        fontSize="8" fontFamily="DM Mono,monospace" style={{pointerEvents:"none"}}>{sub}</text>
                    </g>
                  );
                })}
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
          const tiles = [
            { lbl:"SHOTS ON GOAL", val:totals.sog,                                rank:totals.sogRank,          v:sv, leader:leaders?.shots },
            { lbl:"GOALS",         val:totals.goals,                               rank:totals.goalsRank,        v:gv, leader:leaders?.goals },
            { lbl:"SHOOTING %",    val:`${(totals.shootingPctg*100).toFixed(1)}%`, rank:totals.shootingPctgRank, v:pv, leader:leaders?.pctg  },
          ];
          return (
            <div className="sg">
              {tiles.map(s => (
                <div className="sc" key={s.lbl}>
                  <div className="sn">{s.val}</div>
                  <div className="sl">{s.lbl}</div>
                  <div className="ss" style={{color:rankColor(s.rank, rankTotal)}}>#{s.rank} of {rankTotal}</div>
                  <div className="ss" style={{color:s.v.color,fontSize:"8px",marginTop:"2px"}}>{s.v.sym} {s.v.txt}</div>
                  {s.leader && (
                    <div className="s-leader">
                      <span className="s-leader-val">{s.leader.val}{s.lbl==="SHOOTING %" ? "%" : ""}</span>
                      <span className="s-leader-name">{s.leader.name}</span>
                    </div>
                  )}
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
