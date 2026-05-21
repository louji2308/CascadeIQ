const path = require('path');
const dotenv = require('dotenv');

for (const envFile of ['.env', '.env.local', '.env.development']) {
    dotenv.config({ path: path.resolve(__dirname, '..', envFile) });
}
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const { runQuery } = require('./neo4j.cjs');

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'cascadeiq-api' });
});

// Get all scenarios
app.get('/api/debug', (req, res) => {
    res.json({ version: 'with toInteger', timestamp: Date.now() });
});
app.get('/api/scenarios', async(req, res) => {
    try {
        const records = await runQuery(`
  MATCH (s:Scenario)
  RETURN s.id AS id, 
         s.name AS name, 
         toInteger(s.year) AS year,
         s.location AS location, 
         toInteger(s.deaths) AS deaths,
         s.description AS description
  ORDER BY s.year DESC
`);
        res.json({ success: true, data: records });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});
// Get a single scenario with its nodes and edges (for hazard extraction)
app.get('/api/scenarios/:id', async(req, res) => {
    try {
        const { id } = req.params;
        const records = await runQuery(`
      MATCH (sc:Scenario {id: $id})-[:CONTAINS]->(n)
      WITH sc, collect(n) AS scenarioNodes
      UNWIND scenarioNodes AS a
      OPTIONAL MATCH (a)-[r]->(b)
      WHERE b IN scenarioNodes AND type(r) <> 'CONTAINS'
      RETURN
        {id: sc.id, name: sc.name, year: toInteger(sc.year),
         deaths: toInteger(sc.deaths), location: sc.location} AS scenario,
        {id: a.id, name: a.name, label: labels(a)[0],
         severity: toInteger(a.severity)} AS node,
        CASE WHEN r IS NOT NULL THEN
          {from: a.id, to: b.id, type: type(r),
           prob: r.prob, delay_hrs: r.delay_hrs, mechanism: r.mechanism}
        ELSE null END AS edge
    `, { id });
        res.json({ success: true, data: records });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});
// Cascade endpoint (supports ?removed=...)
app.get('/api/cascade/:hazardId', async(req, res) => {
    try {
        const { hazardId } = req.params;
        const minProb = parseFloat(req.query.minProb || '0.5');
        const maxDepth = parseInt(req.query.maxDepth || '6');
        const removed = req.query.removed ? req.query.removed.split(',') : [];

        // If hazardId is the generic live prefix, find the most intense live fire.
        let resolvedHazardId = hazardId;
        if (hazardId === 'live_fire') {
            const liveResult = await runQuery(`
                MATCH (h:Hazard {live: true})
                RETURN h.id AS id
                ORDER BY h.frp_mw DESC
                LIMIT 1
            `);
            if (liveResult.length > 0) {
                resolvedHazardId = liveResult[0].id;
            }
        }

        const cypher = `
      MATCH path = (start:Hazard {id: $hazardId})-[r*1..${maxDepth}]->(end)
      WHERE ALL(rel IN relationships(path) WHERE rel.prob > $minProb)
        AND ALL(n IN nodes(path) WHERE NOT n.id IN $removed)
      WITH path, nodes(path) AS ns, relationships(path) AS rs,
           REDUCE(p = 1.0, r IN relationships(path) | p * r.prob) AS cascade_prob,
           REDUCE(d = 0, r IN relationships(path) | d + r.delay_hrs) AS total_delay
      RETURN
        [n IN ns | {id: n.id, name: n.name, label: labels(n)[0], severity: toInteger(n.severity)}] AS nodes,
        [r IN rs | {from: startNode(r).id, to: endNode(r).id, type: type(r), prob: r.prob, delay_hrs: r.delay_hrs, mechanism: r.mechanism}] AS edges,
        length(path) AS depth,
        round(cascade_prob * 100, 1) AS probability_pct,
        total_delay AS hours_to_end
      ORDER BY cascade_prob DESC
      LIMIT 15
    `;

        const paths = await runQuery(cypher, { hazardId: resolvedHazardId, minProb, removed });
        const riskScore = paths.length > 0 ?
            Math.min(100, Math.round(paths[0].probability_pct * (paths.length / 5))) :
            0;
        const firstPath = paths[0] || { nodes: [], edges: [] };

        res.json({
            success: true,
            riskScore,
            paths,
            nodes: firstPath.nodes,
            edges: firstPath.edges,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/analytics/criticality', async(req, res) => {
    try {
        const records = await runQuery(`
            MATCH path = (start:Hazard)-[r*1..6]->(end)
            WHERE ALL(rel IN relationships(path) WHERE rel.prob > 0.4)
            WITH path,
                 nodes(path) AS pathNodes,
                 REDUCE(p = 1.0, rel IN relationships(path) | p * rel.prob) AS pathProb
            UNWIND pathNodes AS node
            WITH node, path, pathProb
            WHERE NOT node:Scenario
            WITH node,
                 count(path)   AS pathCount,
                 sum(pathProb) AS totalWeight,
                 max(pathProb) AS maxPathProb
            RETURN
                node.id              AS id,
                node.name            AS name,
                labels(node)[0]      AS type,
                toInteger(node.severity) AS severity,
                pathCount            AS pathCount,
                round(totalWeight  * 10000) / 10000 AS totalWeight,
                round(maxPathProb  * 10000) / 10000 AS maxPathProb
            ORDER BY totalWeight DESC
            LIMIT 10
        `);

        if (!records.length) {
            return res.json({ success: true, data: [] });
        }

        const toNum = v => {
            if (v === null || v === undefined) return 0;
            if (typeof v === 'object' && v !== null && 'low' in v) return v.low;
            return Number(v);
        };

        const maxWeight = Math.max(toNum(records[0].totalWeight), 0.0001);

        const data = records.map((r, i) => ({
            rank: i + 1,
            id: r.id,
            name: r.name,
            type: r.type,
            severity: toNum(r.severity) || 5,
            pathCount: toNum(r.pathCount),
            totalWeight: toNum(r.totalWeight),
            maxPathProb: toNum(r.maxPathProb),
            score: Math.round((toNum(r.totalWeight) / maxWeight) * 100),
            isCritical: i === 0,
        }));

        res.json({ success: true, data });

    } catch (err) {
        console.error('[criticality]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── NASA FIRMS REAL-TIME WILDFIRE ENDPOINT ─────────────────────────────────────
// Fetches active fire detections from NASA VIIRS satellite (updates every ~10 min)
// Filters to high-confidence fires only, takes top 5 by FRP (fire intensity)
// Seeds them into Neo4j as live Hazard nodes, returns them to the client

const https = require('https');
const FIRMS_SOURCE = 'NASA FIRMS VIIRS_SNPP_NRT';
const FALLBACK_AS_OF = '2026-05-21T10:30:00.000Z';
const FALLBACK_FIRES = [
    { lat: 34.521, lon: 135.233, brightness: 367.8, acq_date: '2026-05-21', acq_time: '1030', satellite: 'N', confidence: 'h', frp: 287.4 },
    { lat: 38.742, lon: -120.612, brightness: 354.2, acq_date: '2026-05-21', acq_time: '1024', satellite: 'N', confidence: 'h', frp: 241.8 },
    { lat: -33.932, lon: 151.176, brightness: 349.7, acq_date: '2026-05-21', acq_time: '1018', satellite: 'N', confidence: 'h', frp: 198.6 },
    { lat: 51.118, lon: 13.764, brightness: 342.1, acq_date: '2026-05-21', acq_time: '1012', satellite: 'N', confidence: 'h', frp: 164.3 },
    { lat: 3.141, lon: 101.693, brightness: 337.5, acq_date: '2026-05-21', acq_time: '1006', satellite: 'N', confidence: 'h', frp: 129.9 }
];

// Helper: fetch a URL and return the full body as a string
// We use Node's built-in https module so we don't need to worry about 
// axios SSL issues with NASA's servers
function fetchText(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`NASA FIRMS returned HTTP ${res.statusCode}: ${data.slice(0, 160)}`));
                    return;
                }
                resolve(data);
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}

function hasUsableFirmsKey(key) {
    return Boolean(key && key.trim());
}

function coordinateIdPart(value) {
    const prefix = value < 0 ? 'neg_' : '';
    return `${prefix}${Math.abs(value).toFixed(2).replace('.', '_')}`;
}

function regionLabelFor(fire) {
    const latDir = fire.lat >= 0 ? 'N' : 'S';
    const lonDir = fire.lon >= 0 ? 'E' : 'W';
    return `${Math.abs(fire.lat).toFixed(1)}\u00b0${latDir}, ${Math.abs(fire.lon).toFixed(1)}\u00b0${lonDir}`;
}

function formatFire(fire) {
    const region = regionLabelFor(fire);
    const severity = Math.min(10, Math.max(1, Math.round(fire.frp / 150)));

    return {
        id: `live_fire_${coordinateIdPart(fire.lat)}_${coordinateIdPart(fire.lon)}`,
        name: `Live Fire \u00b7 ${region}`,
        lat: fire.lat,
        lon: fire.lon,
        frp_mw: fire.frp,
        severity,
        acq_date: fire.acq_date,
        confidence: fire.confidence,
        region,
        brightness: fire.brightness,
        acq_time: fire.acq_time,
        satellite: fire.satellite
    };
}

function responseFire(fire) {
    return {
        id: fire.id,
        name: fire.name,
        lat: fire.lat,
        lon: fire.lon,
        frp_mw: fire.frp_mw,
        severity: fire.severity,
        acq_date: fire.acq_date,
        confidence: fire.confidence,
        region: fire.region
    };
}

async function seedFireNode(fire, now) {
    await runQuery(`
        MERGE (h:Hazard {id: $nodeId})
        SET h.name = $name,
            h.type = 'wildfire',
            h.severity = $severity,
            h.region = $region,
            h.lat = $lat,
            h.lon = $lon,
            h.frp_mw = $frp,
            h.brightness_k = $brightness,
            h.acq_date = $acq_date,
            h.acq_time = $acq_time,
            h.satellite = $satellite,
            h.confidence = $confidence,
            h.live = true,
            h.last_updated = $now
    `, {
        nodeId: fire.id,
        name: fire.name,
        severity: fire.severity,
        region: fire.region,
        lat: fire.lat,
        lon: fire.lon,
        frp: fire.frp_mw,
        brightness: fire.brightness,
        acq_date: fire.acq_date,
        acq_time: fire.acq_time,
        satellite: fire.satellite,
        confidence: fire.confidence,
        now
    });

    await runQuery(`
        MERGE (sc:Scenario {id: 'live_wildfires_satellite'})
        SET sc.name = 'Live Wildfires — NASA Satellite',
            sc.year = $year,
            sc.location = 'Global (Top 5 by intensity)',
            sc.deaths = 0,
            sc.damage_usd = 0,
            sc.description = 'Real-time wildfire detections from NASA VIIRS satellite (SNPP). Updated every time this endpoint is called.',
            sc.live = true
        WITH sc
        MATCH (h:Hazard {id: $nodeId})
        MERGE (sc)-[:CONTAINS]->(h)
    `, {
        nodeId: fire.id,
        year: new Date().getFullYear()
    });
}

async function seedFiresBestEffort(fires, now) {
    for (const fire of fires) {
        try {
            await seedFireNode(fire, now);
            console.log(`[FIRMS] Seeded: ${fire.id} | FRP: ${fire.frp_mw} MW | Severity: ${fire.severity}`);
        } catch (err) {
            console.warn(`[FIRMS] Neo4j seed skipped for ${fire.id}: ${err.message}`);
        }
    }
}

async function sendFireResponse(res, fires, asOf, options = {}) {
    const formatted = fires.map(formatFire);
    await seedFiresBestEffort(formatted, asOf);

    const payload = {
        success: true,
        live: options.live ?? true,
        fires_seeded: formatted.length,
        source: options.source || FIRMS_SOURCE,
        as_of: asOf,
        data: formatted.map(responseFire)
    };

    if (options.message) {
        payload.message = options.message;
    }

    return res.json(payload);
}

function sendFallbackFireResponse(res, message) {
    return sendFireResponse(res, FALLBACK_FIRES, FALLBACK_AS_OF, {
        live: false,
        source: 'Seeded fallback wildfire data',
        message
    });
}

app.get('/api/realtime/wildfires', async(req, res) => {
    try {
        const FIRMS_KEY = process.env.FIRMS_MAP_KEY;

        // Guard: if no key is configured, return mock data instead of crashing
        if (!hasUsableFirmsKey(FIRMS_KEY)) {
            console.warn('[FIRMS] No FIRMS_MAP_KEY set — returning mock fire data');
            return sendFallbackFireResponse(res, 'Set FIRMS_MAP_KEY in .env to enable live NASA FIRMS data');
        }

        // Build the FIRMS CSV URL
        // VIIRS_SNPP_NRT = Suomi NPP satellite, near-real-time, highest quality
        // world = global coverage
        // 1 = past 24 hours only
        const firmsUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_KEY}/VIIRS_SNPP_NRT/world/1`;

        console.log('[FIRMS] Fetching satellite data from NASA...');
        const csvData = await fetchText(firmsUrl);

        // Split into lines, remove the header line (index 0), remove empty lines
        const lines = csvData.split('\n').slice(1).filter(line => line.trim().length > 0);

        console.log(`[FIRMS] Raw detections received: ${lines.length}`);

        // Parse each CSV line into an object
        // CSV columns: lat,lon,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
        const parsed = lines.map(line => {
            const cols = line.split(',');
            return {
                lat: parseFloat(cols[0]),
                lon: parseFloat(cols[1]),
                brightness: parseFloat(cols[2]),
                acq_date: (cols[5] || '').trim(),
                acq_time: (cols[6] || '').trim(),
                satellite: (cols[7] || '').trim(),
                confidence: (cols[9] || '').trim().toLowerCase(),
                frp: parseFloat(cols[12]) || 0,
                daynight: (cols[13] || '').trim().toUpperCase()
            };
        });

        // Filter: only keep high-confidence detections ('h')
        // Low and nominal confidence ('l', 'n') are often false positives
        const highConf = parsed.filter(f =>
            f.confidence === 'h' &&
            !isNaN(f.lat) &&
            !isNaN(f.lon) &&
            f.frp > 0
        );

        console.log(`[FIRMS] High-confidence fires: ${highConf.length}`);

        // Sort by FRP descending — highest intensity fires first
        highConf.sort((a, b) => b.frp - a.frp);

        // Take top 5 most intense fires globally
        const top5 = highConf.slice(0, 5);

        if (top5.length === 0) {
            return res.json({
                success: true,
                live: true,
                fires_seeded: 0,
                source: FIRMS_SOURCE,
                as_of: new Date().toISOString(),
                data: [],
                message: 'NASA FIRMS returned data, but no high-confidence fires matched the current filter'
            });
        }

        return sendFireResponse(res, top5, new Date().toISOString());

    } catch (err) {
        console.error('[FIRMS] Error:', err.message);
        return sendFallbackFireResponse(res, `NASA FIRMS unavailable: ${err.message}`);
    }
});

// Export for Vercel (critical)
module.exports = app;

if (require.main === module) {
    const PORT = process.env.PORT || 3001;
    const server = app.listen(PORT, () => {
        console.log(`🚀 CascadeIQ API → http://localhost:${PORT}`);
        console.log(`📊 Neo4j URI     → ${process.env.NEO4J_URI?.slice(0, 30)}...`);
        console.log(`\nEndpoints:`);
        console.log(`  GET /health`);
        console.log(`  GET /api/scenarios`);
        console.log(`  GET /api/scenarios/:id`);
        console.log(`  GET /api/cascade/:hazardId`);
        console.log(`  GET /api/analytics/criticality`);
        console.log(`  WS  /ws/simulation`);
    });

    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
        const timers = new Set();
        const clearTimers = () => {
            for (const timer of timers) {
                clearTimeout(timer);
            }
            timers.clear();
        };

        ws.on('message', async(message) => {
            try {
                const payload = JSON.parse(message.toString());

                if (payload.type === 'SIMULATE' && payload.hazardId) {
                    const cypher = `
      MATCH path = (start:Hazard {id: $hazardId})-[r*1..6]->(end)
      WHERE ALL(rel IN relationships(path) WHERE rel.prob > $minProb)
      WITH path, nodes(path) AS ns, relationships(path) AS rs,
           REDUCE(p = 1.0, r IN relationships(path) | p * r.prob) AS cascade_prob,
           REDUCE(d = 0, r IN relationships(path) | d + r.delay_hrs) AS total_delay
      RETURN
        [n IN ns | {id: n.id, name: n.name, label: labels(n)[0], severity: toInteger(n.severity)}] AS nodes,
        [r IN rs | {from: startNode(r).id, to: endNode(r).id, type: type(r), prob: r.prob, delay_hrs: r.delay_hrs, mechanism: r.mechanism}] AS edges,
        length(path) AS depth,
        round(cascade_prob * 100, 1) AS probability_pct,
        total_delay AS hours_to_end
      ORDER BY cascade_prob DESC
      LIMIT 15
    `;

                    const paths = await runQuery(cypher, {
                        hazardId: payload.hazardId,
                        minProb: 0.5
                    });
                    const firstPath = paths[0];

                    if (!firstPath) {
                        throw new Error(`No cascade path found for hazardId: ${payload.hazardId}`);
                    }

                    const nodes = firstPath.nodes || [];
                    const edges = firstPath.edges || [];
                    let accumulatedDelay = 0;

                    nodes.forEach((node, i) => {
                        const previousEdge = i === 0 ? null : edges[i - 1];
                        const delay = i === 0 ? 0 : Number(previousEdge?.delay_hrs || 0) * 600;
                        accumulatedDelay += delay;

                        const timer = setTimeout(() => {
                            timers.delete(timer);

                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({
                                    type: 'CASCADE_NODE',
                                    node: {
                                        id: node.id,
                                        name: node.name,
                                        label: node.label
                                    },
                                    step: i,
                                    total: nodes.length,
                                    mechanism: previousEdge?.mechanism || null
                                }));
                            }

                            if (i === nodes.length - 1) {
                                const completeTimer = setTimeout(() => {
                                    timers.delete(completeTimer);

                                    if (ws.readyState === WebSocket.OPEN) {
                                        ws.send(JSON.stringify({ type: 'SIMULATE_COMPLETE' }));
                                    }
                                }, 600);
                                timers.add(completeTimer);
                            }
                        }, accumulatedDelay);
                        timers.add(timer);
                    });
                }
            } catch (err) {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'SIMULATE_ERROR',
                        error: err.message
                    }));
                }
            }
        });

        ws.on('close', clearTimers);
        ws.on('error', clearTimers);
    });

    const keepAlive = setInterval(() => {}, 1 << 30);

    function shutdown(signal) {
        clearInterval(keepAlive);
        console.log(`\n${signal} received. Shutting down CascadeIQ API...`);
        wss.close(() => server.close(() => {
            process.exit(0);
        }));
    }

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
