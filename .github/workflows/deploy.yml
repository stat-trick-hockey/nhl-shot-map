name: Fetch NHL Data & Deploy

on:
  # Run every day at 8:00 AM UTC (4 AM ET / 1 AM PT)
  schedule:
    - cron: '0 8 * * *'

  # Also run on every push to main (so deploys work normally too)
  push:
    branches:
      - main

  # Allow manual trigger from the GitHub Actions tab
  workflow_dispatch:

jobs:
  fetch-and-deploy:
    runs-on: ubuntu-latest

    permissions:
      contents: write  # needed to commit the updated JSON and push to gh-pages

    steps:
      - name: Checkout repo
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Fetch NHL data
        run: node scripts/fetch-nhl-data.mjs

      - name: Check if data changed
        id: diff
        run: |
          git diff --quiet public/nhl-data.json || echo "changed=true" >> $GITHUB_OUTPUT

      - name: Commit updated data
        if: steps.diff.outputs.changed == 'true'
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add public/nhl-data.json
          git commit -m "chore: update NHL data $(date -u +'%Y-%m-%d')"
          git push

      - name: Build site
        run: npm run build

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
          commit_message: "deploy: $(date -u +'%Y-%m-%d %H:%M UTC')"
