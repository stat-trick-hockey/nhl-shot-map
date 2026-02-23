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

function rankColor(r) {
  if (r <= 5)  return "#00E5A0";
  if (r <= 10) return "#6EE7B7";
  if (r <= 20) return "#FCD34D";
  return "#F87171";
}

function vsAvg(val, avg) {
  const d = ((val - avg) / avg) * 100;
  if (d > 5)  return { sym: "▲", color: "#00E5A0", txt: `+${d.toFixed(0)}% vs avg` };
  if (d < -5) return { sym: "▼", color: "#F87171", txt: `${d.toFixed(0)}% vs avg` };
  return { sym: "●", color: "#FCD34D", txt: "≈ league avg" };
}

const SEASONS    = ["20252026", "20242025"];
const GAME_TYPES = [{ v: 2, l: "Regular Season" }, { v: 3, l: "Playoffs" }];

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
  const data    = db?.data?.[key];
  const slbl    = season ? `${season.slice(0,4)}–${season.slice(6)}` : "";

  const details = data?.shotLocationDetails || [];
  const totals  = data?.shotLocationTotals?.find(t => t.locationCode === "all" && t.position === "all");
  const fwd     = data?.shotLocationTotals?.find(t => t.locationCode === "all" && t.position === "F");
  const def     = data?.shotLocationTotals?.find(t => t.locationCode === "all" && t.position === "D");

  const mval = z => metric === "sog" ? z.sog : metric === "goals" ? z.goals : z.shootingPctg;
  const maxV = details.length ? Math.max(...details.map(mval), 0.001) : 1;

  const hovZ = hovered ? details.find(d => d.area === hovered) : null;

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
        .no-data{padding:60px 20px;text-align:center;color:#333;font-size:10px;letter-spacing:3px}
        .err{padding:40px 20px;text-align:center;color:#F87171;font-size:10px;letter-spacing:2px;line-height:1.8}
      `}</style>

      <div className="card">
        {/* Header */}
        <div className="hdr">
          <div className="eyebrow">NHL EDGE // SHOT LOCATION REPORT</div>
          <div className="city">{team.city}</div>
          <div className="teamname">{team.name || "Loading…"}</div>
          <div className="abbr-bg">{team.abbr}</div>
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
                  <div className="tip-r"><span>Shots on Goal</span><span className="tip-v">{hovZ.sog}<span className="tip-rk" style={{color:rankColor(hovZ.sogRank)}}>#{hovZ.sogRank}</span></span></div>
                  <div className="tip-r"><span>Goals</span><span className="tip-v">{hovZ.goals}<span className="tip-rk" style={{color:rankColor(hovZ.goalsRank)}}>#{hovZ.goalsRank}</span></span></div>
                  <div className="tip-r"><span>Shooting %</span><span className="tip-v">{(hovZ.shootingPctg*100).toFixed(1)}%<span className="tip-rk" style={{color:rankColor(hovZ.shootingPctgRank)}}>#{hovZ.shootingPctgRank}</span></span></div>
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
              {[["#00E5A0","TOP 5"],["#6EE7B7","TOP 10"],["#FCD34D","MID"],["#F87171","BOTTOM"]].map(([c,l]) => (
                <div key={l} className="li"><div className="ld" style={{background:c}}/>{l}</div>
              ))}
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
                    <td style={{color:rankColor(z.sogRank)}}>#{z.sogRank}</td>
                    <td>{z.goals}</td>
                    <td style={{color:rankColor(z.goalsRank)}}>#{z.goalsRank}</td>
                    <td>{(z.shootingPctg*100).toFixed(1)}%</td>
                    <td style={{color:rankColor(z.shootingPctgRank)}}>#{z.shootingPctgRank}</td>
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
                  <div className="ss" style={{color:rankColor(s.rank)}}>#{s.rank} of 32</div>
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
                    <span className="pv">{v}<span className="prk" style={{color:rankColor(r)}}>#{r}</span></span>
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
