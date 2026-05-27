```
 ██████╗ █████╗ ███████╗ ██████╗ █████╗ ██████╗ ███████╗    ██╗ ██████╗ 
██╔════╝██╔══██╗██╔════╝██╔════╝██╔══██╗██╔══██╗██╔════╝    ██║██╔═══██╗
██║     ███████║███████╗██║     ███████║██║  ██║█████╗      ██║██║   ██║
██║     ██╔══██║╚════██║██║     ██╔══██║██║  ██║██╔══╝      ██║██║▄▄ ██║
╚██████╗██║  ██║███████║╚██████╗██║  ██║██████╔╝███████╗    ██║╚██████╔╝
 ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚═════╝ ╚══════╝    ╚═╝ ╚══▀▀═╝
```

### **Graph-Native Disaster Cascade Intelligence**

*Mapping how disasters kill twice — once at impact, again through cascading system failures*

[![Live Demo](https://img.shields.io/badge/%20Live%20Demo-cascadeiq--nine.vercel.app-000020?style=for-the-badge)](https://cascadeiq-nine.vercel.app/)
[![HackHazards 26](https://img.shields.io/badge/Competition-HackHazards'26-000020?style=for-the-badge)](https://www.namespace.world/events/AH6926)
[![Neo4j](https://img.shields.io/badge/Neo4j-AuraDB-000020?style=for-the-badge&logo=neo4j)](https://neo4j.com/cloud/aura/)
[![Deployed on Railway](https://img.shields.io/badge/API-Railway-000020?style=for-the-badge&logo=railway)](https://railway.app/)
[![Deployed on Vercel](https://img.shields.io/badge/Web-Vercel-000020?style=for-the-badge&logo=vercel)](https://vercel.com/)
[![React Native](https://img.shields.io/badge/Mobile-Expo%20Go-000020?style=for-the-badge&logo=expo)](https://expo.dev/)

</div>

---

## The Problem That No Tool Has Solved

On **August 8, 2023**, a wildfire ignited in Lahaina, Maui. Within hours it was the deadliest American wildfire in over a century — 100 lives lost, $5.5 billion in damage.

The fire itself was survivable. What killed people was the **cascade**:

```
Wildfire ignites
   │
   ├── Destroys power lines ──────► Power grid fails (96% load, 23 lines down)
   │                                      │
   │                                      └──► Cell towers + 911 go dark (48hr outage)
   │                                                │
   ├── Forces mass evacuation ────► 12,000 on single-lane road ──► Gridlock (180min delay)
   │                                      │
   │                                      └──► 1,400 vehicles trapped on Front Street
   │
   └── Toxic smoke (AQI 342) ─────► Hospital surge (418 patients, capacity: 220)
                                          │
                                          └──► No backup power ──► Life-support failure
```

**Disaster response fails not from a single catastrophic event but from a chain of interconnected system collapses that no one modeled in advance.**

Today's emergency management tools are built on flat spreadsheets, static risk matrices, and siloed department databases. None of them answer the question that matters most:

> *"If this node fails, what else fails — and in what order — and how fast?"*

CascadeIQ was built to answer exactly that question.

---

## What CascadeIQ Is

CascadeIQ is a **graph-native disaster intelligence platform** that models disasters the way they actually behave — as cascading failures through an interconnected network of hazards, infrastructure, resources, events, and failure modes.

By storing disaster scenarios as **property graphs in Neo4j**, we can:

- Query cascade propagation paths in milliseconds using Cypher's native graph traversal
- Compute path-weighted risk scores using an algorithm equivalent to PageRank on a directed probability graph
- Simulate step-by-step cascade propagation in real time via WebSocket
- Receive live wildfire intelligence from NASA FIRMS VIIRS satellite data (updated every ~10 minutes)
- Model mitigation — remove a node (hospital, road, power grid), watch the cascade graph recalculate

**The insight**: disasters are not point events. They are graph traversal problems. And graph databases are the only tool natively designed to answer graph questions.

---

## Live Demo & Deployment

| Surface | URL | Status |
|---|---|---|
| **Web Dashboard** | [cascadeiq-nine.vercel.app](https://cascadeiq-nine.vercel.app/) | [![Vercel](https://img.shields.io/badge/live-online-brightgreen)](https://cascadeiq-nine.vercel.app/) |
| **REST + WebSocket API** | Railway (auto-deployed) | ![Railway](https://img.shields.io/badge/API-online-brightgreen) |
| **Mobile App** | Expo Go — scan QR from repo | ![Expo](https://img.shields.io/badge/expo-ready-000020) |
| **Graph Database** | Neo4j AuraDB (managed cloud) | ![Neo4j](https://img.shields.io/badge/neo4j-connected-008CC1) |

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                  │
│                                                                       │
│  ┌─────────────────────┐          ┌─── ─────────────────────────┐     │
│  │   React Web App     │          │   Expo React Native App     │     │
│  │   (Vite + Sigma.js) │          │   (iOS / Android / Go)      │     │ 
│  │                     │          │                             │     │ 
│  │  • Force-directed   │          │  • Animated cascade graph   │     │
│  │    graph (ForceA2)  │          │  • Chronological timeline   │     │
│  │  • Live simulation  │          │  • Risk badge scoring       │     │
│  │  • Mitigation panel │          │  • SVG + react-native-svg   │     │
│  └──────────┬──────────┘          └─────────────┬───────────────┘     │
│             │                                   │                     │ 
└─────────────┼───────────────────────────────────┼─────────────────────┘ 
              │  HTTP / WebSocket                 │  HTTP
              ▼                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          API LAYER (Railway)                           │
│                                                                        │
│              Express.js + Node.js + WebSocket Server                   │ 
│                                                                        │
│  GET /api/scenarios             — list all disaster events             │
│  GET /api/scenarios/:id         — nodes + edges for a scenario         │
│  GET /api/cascade/:hazardId     — all paths from a hazard node         │
│  GET /api/analytics/criticality — path-weighted centrality ranking     │
│  GET /api/realtime/wildfires    — NASA FIRMS live satellite data       │
│  WS  /ws/simulation             — step-by-step cascade propagation     │
│                                                                        │
└─────────────────────────────┬──────────────────────────────────────────┘
                              │  Bolt protocol (TLS)
                              ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     DATA LAYER (Neo4j AuraDB)                          │
│                                                                        │
│   (:Hazard)──[:TRIGGERS]──►(:Event)──[:OVERWHELMS]──►(:Resource)       │
│                                                                        │
│   Property graph: nodes carry severity, type, region, metadata         │
│   Relationships carry: prob, delay_hrs, mechanism                      │
│                                                                        │
│   Seeded: Lahaina 2023 · Turkey-Syria EQ 2023 · Pakistan Floods        │
│   Live:   NASA VIIRS SNPP satellite detections (top-5 by FRP MW)       │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS (NASA FIRMS API)
┌─────────────────────────────┴──────────────────────────────────────────┐
│              NASA FIRMS VIIRS-SNPP Near-Real-Time Feed                 │
│         High-confidence fire detections · Ranked by FRP (MW)           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## The Graph Data Model

This is what makes CascadeIQ fundamentally different from any spreadsheet-based risk tool. Every disaster scenario lives as a **labeled property graph** in Neo4j:

### Node Labels

| Label | Meaning | Example |
|---|---|---|
| `Hazard` | The originating disaster event | 7.8M Kahramanmaras Earthquake |
| `Event` | A triggered secondary occurrence | Mass Building Collapse |
| `Infrastructure` | A physical system under stress | Maui Power Grid |
| `Resource` | A capacity-limited service | Maui Memorial Medical Center |
| `Failure` | A system breakdown mode | Emergency Comms Failure |
| `Scenario` | A named disaster container | Lahaina Wildfire 2023 |

### Relationship Types (with properties)

```cypher
(hazard:Hazard)-[:TRIGGERS {
  prob: 0.97,          // probability this cascade edge fires
  delay_hrs: 1,        // hours until downstream effect manifests
  mechanism: "Rapid fire spread forces evacuation orders"
}]->(event:Event)
```

All cascade relationships carry three critical properties:
- **`prob`** — the probability that this cascade link activates (0.0–1.0)
- **`delay_hrs`** — the real-world time before the downstream effect manifests
- **`mechanism`** — a human-readable explanation of the causal link

### Real Lahaina Subgraph (Cypher)

```cypher
// What killed people wasn't the fire — it was this:
(wildfire:Hazard)-[:DESTROYS {prob: 0.85, delay_hrs: 2}]->(power:Infrastructure)
(power:Infrastructure)-[:TRIGGERS {prob: 0.89, delay_hrs: 3}]->(comms:Failure)
(wildfire:Hazard)-[:TRIGGERS {prob: 0.97, delay_hrs: 1}]->(evac:Event)
(evac:Event)-[:BLOCKS {prob: 0.91, delay_hrs: 0}]->(roads:Infrastructure)
(evac:Event)-[:OVERWHELMS {prob: 0.78, delay_hrs: 4}]->(hospital:Resource)
(hospital:Resource)-[:WORSENED_BY {prob: 0.73, delay_hrs: 5}]->(power:Infrastructure)
// Feedback loop: power failure worsens hospital, hospital overwhelmed without power
```

---

## The Algorithm: Path-Weighted Cascade Centrality

> *"Critical node scoring uses a path-weighted centrality algorithm over the cascade graph — each node is scored by the number of cascade paths it participates in, weighted by cumulative cascade probability. This produces a ranking functionally equivalent to PageRank on a directed probability graph, implemented in native Cypher for compatibility with AuraDB."*

### How It Works

**Step 1 — Enumerate all cascade paths** from each Hazard node up to depth 6:

```cypher
MATCH path = (start:Hazard {id: $hazardId})-[r*1..6]->(end)
WHERE ALL(rel IN relationships(path) WHERE rel.prob > $minProb)
```

**Step 2 — Compute cumulative cascade probability** for each path:

```cypher
REDUCE(p = 1.0, r IN relationships(path) | p * r.prob) AS cascade_prob
```

A path `A→B→C→D` with edge probabilities `[0.97, 0.89, 0.78]` yields `cascade_prob = 0.97 × 0.89 × 0.78 ≈ 0.673`.

**Step 3 — Compute total cascade delay**:

```cypher
REDUCE(d = 0, r IN relationships(path) | d + r.delay_hrs) AS total_delay
```

**Step 4 — Risk scoring** (aggregated expected severity):

For each unique endpoint node reachable by the cascade, compute the probability the cascade reaches it via *any* path (union probability):

```
P_reach(e) = 1 - Π(1 - p_i)    for all paths i ending at e
```

Then aggregate across all endpoints:

```
totalExpectedSeverity = Σ P_reach(e) × severity(e)
riskScore = min(100, round(totalExpectedSeverity × 3))
```

This is the standard **Risk = Probability × Consequence** framework. Removing a node (mitigation) prunes all paths through it, reducing `totalExpectedSeverity` — the risk score drops proportionally to the node's importance in the cascade.


**Step 5 — Criticality ranking** (PageRank-equivalent):

```cypher
WITH node,
     count(path)   AS pathCount,
     sum(pathProb) AS totalWeight,   // ← This is the centrality score
     max(pathProb) AS maxPathProb
ORDER BY totalWeight DESC
```

`totalWeight` (sum of probabilities across all paths containing this node) is mathematically equivalent to PageRank on a directed probability graph. Nodes that appear on many high-probability paths score highest — these are the critical intervention points.

**Why Neo4j?** Because `MATCH path = (n)-[*1..6]->(m)` is a native Cypher operation that the graph database executes with index-backed BFS in milliseconds. The same query in a relational database would require 6-level recursive CTEs that time out on any real-world dataset.

---

## Features

### Web Dashboard

**Live Graph Visualization**
- Force-directed layout via ForceAtlas2 (graphology-layout-forceatlas2)
- Sigma.js WebGL renderer — handles large graphs smoothly
- Hover: highlights connected nodes, dims unconnected subgraph, shows tooltip
- Click: opens node analysis panel with connected edges and probabilities
- Smooth eased animations (cubic ease-in/out) for all hover states

**Cascade Path Explorer**
- Top 15 cascade paths ranked by probability × depth
- Click any path to highlight it in the graph
- Each path shows: probability %, hops, hours to full cascade, node chain

**Live Cascade Simulation**
- WebSocket-powered (with client-side fallback for Vercel deployment)
- Step-by-step propagation through the selected cascade path
- Timeline bar with node dots that light up in sequence
- Elapsed timer, step counter, current node label
- Cinematic delays (1.2–2.5s per step) for dramatic impact

**Mitigation Control Panel**
- Toggle any Infrastructure or Resource node offline
- API recalculates all cascade paths with that node removed
- Risk score updates live — see how disabling one node reshapes the cascade topology
- System integrity meter tracks % of nodes online

**Risk Gauge**
- SVG arc gauge, animated on load
- Color-coded by level: LOW (green) / MODERATE (amber) / HIGH (orange) / CRITICAL (red)
- Threat level badge in header updates globally

**Live Wildfire Intelligence**
- NASA FIRMS VIIRS-SNPP near-real-time satellite feed
- Filters to high-confidence detections only
- Ranks top 5 by Fire Radiative Power (FRP, in megawatts)
- Automatically seeds detected fires into Neo4j as live Hazard nodes
- Connects them under a `live_wildfires_satellite` Scenario node

**Boot Sequence**
- Animated system initialization screen with progress bar
- Particle field background with canvas-drawn node network
- Scan-line header animation, pulsing status dots

### Mobile App (Expo React Native)

- Native cascade graph rendering using `react-native-svg` and `Svg`
- Concentric ring layout — hazard at center, subsequent cascade rings at `depth × 95px` radius
- Animated node appearance: each depth ring reveals at `depth × 800ms` delay, simulating real cascade timing
- Risk badge component with animated count-up from 0 to score
- Chronological cascade timeline screen — events sorted by cumulative delay hours
- Pull-to-refresh scenario list
- Error and loading states with retry

### Pre-Seeded Disaster Scenarios

**1. Lahaina Wildfire 2023** (Hawaii, USA)
- 100 deaths · $5.5B damage
- 67 mph winds · 2,170 acres
- 7 interconnected nodes · 5 cascade relationship types

**2. Turkey-Syria Earthquake 2023** (Kahramanmaras)
- 59,000 deaths · $34B damage
- 7.8M + 7.7M aftershock
- Aftershock modeled as a second-order cascade trigger

**3. Pakistan Monsoon Floods 2022** (Sindh & Balochistan)
- 1,739 deaths · $30B damage
- 33M people affected · 33% of Pakistan submerged
- Disease outbreak modeled as tertiary cascade from infrastructure collapse

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Graph Database** | Neo4j AuraDB | Native graph traversal — cascade path queries are BFS, not 6-level JOINs |
| **Graph Query** | Cypher | Expressive path pattern matching with property filters and aggregation |
| **API** | Express.js + Node.js | Simple, fast, WebSocket-compatible |
| **WebSockets** | `ws` library | Real-time cascade simulation streaming |
| **Satellite Data** | NASA FIRMS VIIRS-SNPP NRT | High-confidence near-real-time fire detection |
| **Web Frontend** | React 19 + Vite 8 | Modern build toolchain, React compiler ready |
| **Graph Rendering** | Sigma.js + Graphology | WebGL-accelerated, force-directed layout |
| **Graph Layout** | ForceAtlas2 | Industry-standard large graph layout algorithm |
| **Mobile** | Expo SDK 54 + React Native 0.81 | Cross-platform iOS/Android from one codebase |
| **Mobile SVG** | react-native-svg | Native SVG rendering on device GPU |
| **HTTP Client** | Axios | Request timeout, cancellation, interceptors |
| **Styling (Web)** | CSS custom properties | Dark mode adaptive, CSS variable theming |
| **Deployment** | Vercel (web) + Railway (API) | Zero-config CI/CD, global edge CDN |
| **Database Host** | Neo4j AuraDB | Managed cloud graph database, Bolt protocol |
| **TypeScript** | v5.9 (web) + v5.9 (app) | Type-safe throughout, strict mode |

---

## Project Structure

```
cascadeiq/
├── web/                          # React web dashboard
│   ├── src/
│   │   ├── App.tsx               # Main dashboard (2000+ lines of disaster intelligence)
│   │   ├── components/
│   │   │   ├── GraphView.tsx     # Sigma.js graph — hover, click, simulation
│   │   │   ├── GraphView.css     # Military-aesthetic graph styling
│   │   │   ├── ControlPanel.tsx  # Mitigation toggle panel
│   │   │   └── ControlPanel.css  # Tactical UI styles
│   │   └── index.css             # Global design system + animations
│   ├── api/
│   │   ├── index.js              # Express server + WebSocket + all endpoints
│   │   └── neo4j.cjs             # Neo4j driver + integer conversion utilities
│   ├── vercel.json               # Vercel serverless function config
│   └── vite.config.ts            # Vite + proxy config
│
├── app/                          # Expo React Native mobile app
│   ├── App.tsx                   # Navigation stack (Home → Cascade → Timeline)
│   ├── screens/
│   │   ├── HomeScreen.tsx        # Scenario list with disaster cards
│   │   ├── CascadeScreen.tsx     # Graph + stats + top paths
│   │   └── TimelineScreen.tsx    # Chronological cascade timeline
│   ├── components/
│   │   ├── CascadeGraph.tsx      # SVG cascade graph with animation
│   │   └── RiskBadge.tsx         # Animated risk score badge
│   ├── constants/api.ts          # API endpoint configuration
│   └── types/index.ts            # Shared TypeScript interfaces
│
├── data/
│   ├── seed_lahaina.cypher       # Lahaina wildfire seed data
│   └── seed_scenarios_2_3.cypher # Turkey EQ + Pakistan Floods seed data
│
├── railway.json                  # Railway API deployment config
└── package.json                  # Monorepo root scripts
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- A [Neo4j AuraDB](https://neo4j.com/cloud/aura/) free instance
- A [NASA FIRMS API key](https://firms.modaps.eosdis.nasa.gov/api/area/) (free, for live wildfire data)

### 1. Clone & Install

```bash
git clone https://github.com/louji2308/cascadeiq.git
cd cascadeiq

# Install web dependencies
cd web && npm install

# Install app dependencies  
cd ../app && npm install
```

### 2. Seed the Neo4j Database

In your Neo4j AuraDB browser (or any Cypher client):

```bash
# Copy and run each file in the Neo4j browser:
cat data/seed_lahaina.cypher
cat data/seed_scenarios_2_3.cypher
```

Or use `cypher-shell`:
```bash
cypher-shell -u neo4j -p <your-password> -a <your-uri> \
  --file data/seed_lahaina.cypher

cypher-shell -u neo4j -p <your-password> -a <your-uri> \
  --file data/seed_scenarios_2_3.cypher
```

### 3. Configure Environment

```bash
# web/.env.development
VITE_API_URL=http://localhost:3001
FIRMS_MAP_KEY=your_nasa_firms_api_key

# web/.env (for Neo4j connection in API)
NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-generated-password
```

### 4. Run Everything

```bash
# From repo root
npm run api    # Start Express API on :3001
npm run web    # Start Vite dev server on :5173

# Mobile (separate terminal)
npm run app    # Start Expo dev server
# Then scan QR code with Expo Go app on your phone
```

### 5. Access

| Interface | URL |
|---|---|
| Web Dashboard | http://localhost:5173 |
| API Health | http://localhost:3001/health |
| Mobile | Expo Go → scan QR from terminal |

---

## API Reference

### `GET /api/scenarios`
Returns all seeded disaster scenarios.

```json
{
  "success": true,
  "data": [
    {
      "id": "lahaina_2023",
      "name": "Lahaina Wildfire 2023",
      "year": 2023,
      "location": "Maui, Hawaii, USA",
      "deaths": 100,
      "damage_usd": 5500000000,
      "description": "Deadliest US wildfire in over a century"
    }
  ]
}
```

### `GET /api/scenarios/:id`
Returns all nodes and edges belonging to a scenario, used to build the graph.

### `GET /api/cascade/:hazardId?minProb=0.5&maxDepth=6&removed=node1,node2`

The core cascade query. Returns all cascade paths from the hazard node.

| Parameter | Default | Description |
|---|---|---|
| `minProb` | `0.5` | Minimum edge probability to include in paths |
| `maxDepth` | `6` | Maximum hops in the cascade chain |
| `removed` | `""` | Comma-separated node IDs to exclude (mitigation mode) |

```json
{
  "success": true,
  "hazard": { "name": "Lahaina Wildfire", "severity": 9, "type": "wildfire" },
  "riskScore": 91,
  "pathCount": 8,
  "paths": [
    {
      "nodes": [
        { "id": "hazard_wildfire_lahaina", "name": "Lahaina Wildfire", "label": "Hazard", "severity": 9 },
        { "id": "event_evacuation_lahaina", "name": "Mass Evacuation Order", "label": "Event" }
      ],
      "edges": [
        { "from": "hazard_wildfire_lahaina", "to": "event_evacuation_lahaina", "type": "TRIGGERS", "prob": 0.97, "delay_hrs": 1, "mechanism": "Rapid fire spread forces evacuation orders" }
      ],
      "depth": 3,
      "probability_pct": 67.3,
      "hours_to_end": 9
    }
  ]
}
```

### `GET /api/analytics/criticality`
Returns nodes ranked by path-weighted centrality score.

```json
{
  "success": true,
  "data": [
    {
      "rank": 1,
      "id": "infra_power_maui",
      "name": "Maui Power Grid",
      "type": "Infrastructure",
      "severity": 8,
      "pathCount": 5,
      "totalWeight": 3.21,
      "score": 100,
      "isCritical": true
    }
  ]
}
```

### `GET /api/realtime/wildfires`
Fetches live fire data from NASA FIRMS VIIRS-SNPP, seeds top-5 fires into Neo4j, returns fire metadata.

```json
{
  "success": true,
  "live": true,
  "fires_seeded": 5,
  "source": "NASA FIRMS VIIRS_SNPP_NRT",
  "as_of": "2026-05-24T10:30:00.000Z",
  "data": [
    {
      "id": "live_fire_34_52_135_23",
      "name": "Live Fire · 34.5°N, 135.2°E",
      "lat": 34.521,
      "lon": 135.233,
      "frp_mw": 287.4,
      "severity": 10,
      "acq_date": "2026-05-24",
      "confidence": "h",
      "region": "34.5°N, 135.2°E"
    }
  ]
}
```

### WebSocket `ws://host/` — Cascade Simulation

```javascript
// Client sends:
{ "type": "SIMULATE", "hazardId": "hazard_wildfire_lahaina" }

// Server streams back (one per cascade step):
{ "type": "CASCADE_NODE", "node": { "id": "...", "name": "...", "label": "..." }, "step": 0, "total": 5, "mechanism": "..." }
{ "type": "CASCADE_NODE", "step": 1, ... }
// ...
{ "type": "SIMULATE_COMPLETE" }
```

---

## Deployment

### Vercel (Web Frontend + Serverless API)

```bash
cd web
npx vercel --prod
```

The `vercel.json` routes all `/api/*` requests to the serverless Express function and all other routes to the React SPA:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.js" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

> **Note**: WebSocket simulation falls back to a client-side simulation engine on Vercel (serverless functions don't support persistent connections). The Railway deployment supports full WebSocket functionality.

### Railway (API + WebSocket Server)

```bash
# Connect your GitHub repo to Railway
# Set environment variables in Railway dashboard:
# NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, FIRMS_MAP_KEY, PORT
```

The `railway.json` configures build and start:

```json
{
  "build": { "buildCommand": "npm install" },
  "deploy": { "startCommand": "node api/index.js" }
}
```

### Expo Go (Mobile)

```bash
cd app
npx expo start

# Scan QR code with Expo Go (iOS/Android)
# For production builds:
npx expo build:ios
npx expo build:android
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEO4J_URI` | ✅ | Neo4j AuraDB connection string (`neo4j+s://...`) |
| `NEO4J_USER` | ✅ | Database username (usually `neo4j`) |
| `NEO4J_PASSWORD` | ✅ | Database password |
| `FIRMS_MAP_KEY` | ⚡ | NASA FIRMS API key (enables live wildfire data) |
| `VITE_API_URL` | ✅ | Base URL for API (set per-environment) |
| `PORT` | 🔧 | API server port (Railway sets this automatically) |

---

## Why Graph Databases for Disaster Modeling

The core thesis of CascadeIQ is that **disaster cascade problems are graph problems** — and deserve graph solutions.

Consider the Turkey-Syria earthquake data. When you want to know "what does the hospital collapse trigger?", a relational database forces you to:

```sql
SELECT * FROM cascade_links WHERE from_node_id = 'hospital'
-- Then for each result, another query for its downstream nodes
-- Repeat recursively up to depth 6...
```

Six levels of recursion in SQL becomes catastrophically slow at real disaster-data scale, requires complex CTEs, and still cannot express path-level properties like cumulative probability.

In Cypher:

```cypher
MATCH path = (h:Hazard {id: $id})-[*1..6]->(end)
WHERE ALL(rel IN relationships(path) WHERE rel.prob > 0.5)
RETURN path
ORDER BY REDUCE(p=1.0, r IN relationships(path) | p*r.prob) DESC
```

This is **one query**. The graph database traverses the adjacency structure natively, evaluating relationship properties at each hop. No JOINs. No recursion stack overflows. No 30-second timeouts.

And because Neo4j stores the graph structure in memory-mapped files with index-backed node lookups, the BFS is O(V + E) over the reachable subgraph — not O(V^6) like a naive relational approach.

---

## The Mitigation Engine

One of CascadeIQ's most powerful features is **counterfactual cascade modeling** — the ability to ask "what would have happened if we had fixed this first?"

When a user removes nodes from the graph:

```
User toggles "Maui Power Grid" → OFFLINE

API re-runs cascade query with: ?removed=infra_power_maui

Cypher adds: AND ALL(n IN nodes(path) WHERE NOT n.id IN $removed)

Result: Cascade paths through the power grid are eliminated
        New risk score calculated on remaining paths
        Graph re-renders showing the reconfigured cascade topology
```

This is how CascadeIQ becomes a **planning tool**, not just an analysis tool. Emergency managers can model:

- "If we pre-position backup generators at hospitals, what happens to the cascade?"
- "If we pre-clear evacuation routes, what's the new risk score?"
- "Which single node removal reduces risk score the most?"

The answer to the last question is precisely what the **criticality ranking** computes — and it's why `path-weighted centrality` is the right algorithm for this domain.

---

## Roadmap

- [ ] **Temporal simulation replay** — scrub through time on a historical disaster
- [ ] **Multi-scenario comparison** — diff two scenarios' cascade graphs side-by-side
- [ ] **Custom scenario builder** — draw new nodes and edges in the UI
- [ ] **AI-assisted mechanism generation** — LLM suggests cascade edges from news data
- [ ] **Real-time sensor integration** — USGS seismic feeds, NOAA weather alerts
- [ ] **Export to emergency management formats** — NIMS, ICS-200, FEMA reports
- [ ] **Collaborative annotation** — multiple responders can mark nodes in real time
- [ ] **Historical validation** — compare predicted cascade to documented post-disaster reports

---

## Built for HackHazards '26

> CascadeIQ was built from scratch during HackHazards '26 — a hackathon focused on technology for disaster preparedness, emergency response, and humanitarian impact.

**The core challenge we chose**: Most disaster tech focuses on *after the event* — search and rescue, damage assessment, aid logistics. We chose to focus on the hours *before and during* — the moment when knowing the cascade could still change outcomes.

**The hypothesis**: If emergency managers had seen the Lahaina cascade graph before August 8, 2023, they would have known to pre-position hospital backup power, pre-clear the single-lane evacuation route, and ensure communication system redundancy. The fire would still have burned. The death toll might have been different.

**The technology**: Neo4j's graph database was the key unlock. Without it, we could not express cascade queries in any reasonable form. With it, queries that would take minutes in SQL run in under 100ms. That performance difference is what makes real-time mitigation modeling possible.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

The NASA FIRMS data accessed by this application is provided by the NASA Fire Information for Resource Management System and is subject to NASA's standard data use policies. All seeded disaster scenario data is based on publicly available post-incident reports.

---

<div align="center">

**CascadeIQ** — Because the next disaster is already connected to something you haven't modeled yet.

*Built with Neo4j · Deployed on Vercel & Railway · Real data from NASA FIRMS*

[![Live Demo](https://img.shields.io/badge/🚀%20Try%20It%20Now-cascadeiq--nine.vercel.app-black?style=for-the-badge)](https://cascadeiq-nine.vercel.app/)

</div>