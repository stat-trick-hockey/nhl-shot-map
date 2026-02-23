# NHL Shot Location Map 🏒

Interactive heatmap of NHL team shot locations, powered by the [NHL Edge API](https://api-web.nhle.com).  
Data auto-refreshes every morning via GitHub Actions and deploys to GitHub Pages.

## Live Site

`https://YOUR_USERNAME.github.io/nhl-shot-map/`

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/nhl-shot-map.git
cd nhl-shot-map
npm install
```

### 2. Fetch NHL data (run this once before dev)

```bash
npm run fetch-data
```

This hits the NHL Edge API for all 32 teams across 2 seasons and saves the results to `public/nhl-data.json`. Takes about 2–3 minutes.

### 3. Run locally

```bash
npm run dev
```

Open `http://localhost:5173/nhl-shot-map/`

---

## Deploy to GitHub Pages

### First-time setup

1. Push this repo to GitHub
2. Go to **Settings → Pages → Source** → set to `gh-pages` branch
3. In **Settings → Actions → General** → set Workflow permissions to **Read and write**

### Manual deploy

```bash
npm run deploy
```

### Automatic daily updates

The GitHub Action in `.github/workflows/deploy.yml` runs every day at 8:00 AM UTC and:

1. Fetches fresh NHL data for all teams
2. Commits the updated `nhl-data.json` if anything changed
3. Rebuilds and redeploys the site to GitHub Pages

No extra configuration needed — it uses the built-in `GITHUB_TOKEN`.

---

## Project Structure

```
nhl-shot-map/
├── .github/
│   └── workflows/
│       └── deploy.yml        # Daily fetch + deploy action
├── public/
│   └── nhl-data.json         # Pre-fetched NHL data (auto-updated)
├── scripts/
│   └── fetch-nhl-data.mjs    # Node script to fetch from NHL API
├── src/
│   ├── App.jsx               # Main React component
│   └── main.jsx              # Entry point
├── index.html
├── package.json
└── vite.config.js
```

---

## Data Source

NHL Edge API — `https://api-web.nhle.com/v1/edge/team-shot-location-detail/{team-id}/{season}/{game-type}`

- Season format: `YYYYYYYY` (e.g. `20252026`)
- Game type: `2` = Regular Season, `3` = Playoffs
