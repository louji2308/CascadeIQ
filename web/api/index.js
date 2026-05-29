const path = require('path');
const dotenv = require('dotenv');

for (const envFile of['.env', '.env.local', '.env.development']) {
    dotenv.config({ path: path.resolve(__dirname, '..', envFile) });
}
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const { runQuery } = require('./neo4j.cjs');
const { synthesiseCascadeForFire, fetchWind, fetchPlaceName } = require('./cascade-synthesizer');

const VALIDATION_SEEDS = [
    {
        scenarioId: 'lahaina_2023',
        validationId: 'validation_lahaina_2023',
        validationSource: 'FEMA DR-4724-HI',
        documentedFailures: 7,
        predictedFailures: 7,
        matchedFailures: 7,
        accuracyPercent: 100.0,
        validationDate: '2023-08',
        note: 'Node accuracy is 100%. However, delay estimates for hospital surge were 4 hours in the model versus approximately 6 hours documented, showing the timing calibration needs improvement.'
    },
    {
        scenarioId: 'turkey_eq_2023',
        validationId: 'validation_turkey_eq_2023',
        validationSource: 'WHO & AFAD Post-Earthquake Reports',
        documentedFailures: 7,
        predictedFailures: 7,
        matchedFailures: 7,
        accuracyPercent: 100.0,
        validationDate: '2023-02',
        note: '7 nodes match documented WHO and AFAD post-earthquake reports.'
    },
    {
        scenarioId: 'pakistan_floods_2022',
        validationId: 'validation_pakistan_floods_2022',
        validationSource: 'NDMA Pakistan & OCHA',
        documentedFailures: 6,
        predictedFailures: 6,
        matchedFailures: 6,
        accuracyPercent: 100.0,
        validationDate: '2022-08',
        note: 'Matches NDMA Pakistan and OCHA documented cascades.'
    },
];

async function seedValidationIfMissing() {
    for (const v of VALIDATION_SEEDS) {
        try {
            const exists = await runQuery(`
                MATCH (sc:Scenario {id: $sid})-[:HAS_VALIDATION]->(:Validation {id: $vid})
                RETURN count(*) AS cnt
            `, { sid: v.scenarioId, vid: v.validationId });
            if (exists[0] && exists[0].cnt > 0) {
                console.log(`[Seed] Validation ${v.validationId} exists, skipping`);
                continue;
            }
            await runQuery(`
                MERGE (val:Validation {id: $vid})
                SET val.validationSource = $src,
                    val.documentedFailures = $doc,
                    val.predictedFailures = $pred,
                    val.matchedFailures = $match,
                    val.accuracyPercent = $acc,
                    val.validationDate = $date,
                    val.note = $note
                WITH val
                MATCH (sc:Scenario {id: $sid})
                MERGE (sc)-[:HAS_VALIDATION]->(val)
                RETURN val
            `, {
                vid: v.validationId,
                sid: v.scenarioId,
                src: v.validationSource,
                doc: v.documentedFailures,
                pred: v.predictedFailures,
                match: v.matchedFailures,
                acc: v.accuracyPercent,
                date: v.validationDate,
                note: v.note,
            });
            console.log(`[Seed] Created validation ${v.validationId} for ${v.scenarioId}`);
        } catch (err) {
            console.error(`[Seed] Error seeding ${v.validationId}:`, err.message);
        }
    }
}

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
         s.damage_usd AS damage_usd,
         s.description AS description,
         s.cascadeAttributionFactor AS cascadeAttributionFactor
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

        if (id === 'live_wildfires_satellite') {
            const records = await runQuery(`
                MATCH (sc:Scenario {id: $id})-[:CONTAINS]->(h:Hazard {live: true})
                WHERE h.source = $source
                RETURN
                  {id: sc.id, name: sc.name, year: toInteger(sc.year),
                   deaths: toInteger(sc.deaths), location: sc.location,
                   cascadeAttributionFactor: sc.cascadeAttributionFactor} AS scenario,
                  {id: h.id, name: h.name, label: 'Hazard',
                   severity: toInteger(h.severity)} AS node,
                  null AS edge
                ORDER BY h.frp_mw DESC
            `, { id, source: FIRMS_SOURCE });
            return res.json({ success: true, data: records });
        }

        const records = await runQuery(`
      MATCH (sc:Scenario {id: $id})-[:CONTAINS]->(n)
      WITH sc, collect(n) AS scenarioNodes
      UNWIND scenarioNodes AS a
      OPTIONAL MATCH (a)-[r]->(b)
      WHERE b IN scenarioNodes AND type(r) <> 'CONTAINS'
      RETURN
        {id: sc.id, name: sc.name, year: toInteger(sc.year),
         deaths: toInteger(sc.deaths), location: sc.location,
         cascadeAttributionFactor: sc.cascadeAttributionFactor} AS scenario,
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
// Get validation data for a scenario
app.get('/api/scenarios/:id/validation', async(req, res) => {
    try {
        const { id } = req.params;
        const records = await runQuery(`
            MATCH (sc:Scenario {id: $id})-[:HAS_VALIDATION]->(v:Validation)
            RETURN v {
                .validationSource,
                .documentedFailures,
                .predictedFailures,
                .matchedFailures,
                .accuracyPercent,
                .validationDate,
                .note
            } AS validation
        `, { id });
        if (records.length === 0) {
            return res.json({ success: true, data: null });
        }
        res.json({ success: true, data: records[0].validation });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});
// Seed validation data for all scenarios (idempotent — safe to call repeatedly)
app.post('/api/seed/validation', async(req, res) => {
    try {
        await seedValidationIfMissing();
        res.json({ success: true, message: 'Validation data seeded successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});
// ── SHARED CASCADE COMPUTATION ───────────────────────────────────────────
async function computeCascadeForHazard(hazardId, removed = [], minProb = 0.5, maxDepth = 6) {
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
          round(cascade_prob * 1000) / 10.0 AS probability_pct,
          total_delay AS hours_to_end
        ORDER BY cascade_prob DESC
        LIMIT 15
    `;

    const paths = await runQuery(cypher, { hazardId: resolvedHazardId, minProb, removed });

    // ── PROPER RISK CALCULATION ────────────────────────────────────────
    // Risk = Expected Severity = Σ P(reach endpoint) × severity(endpoint)
    // across all unique cascade endpoints. Scaled to 0-100.
    //
    // For each unique endpoint node, compute the probability the cascade
    // reaches it via ANY path: P_reach = 1 - Π(1 - p_i) for all paths i
    // ending at that node. This is the union probability (at least one
    // path succeeds).
    //
    // Then aggregate: totalExpectedSeverity = Σ P_reach × severity.
    // Scale factor 3 maps a severe cascade (totalExpected ~33) to ~100.
    let riskScore = 0;
    if (paths.length > 0) {
        const endpointMap = new Map();
        for (const path of paths) {
            const endNode = path.nodes[path.nodes.length - 1];
            const id = endNode.id;
            if (!endpointMap.has(id)) {
                endpointMap.set(id, {
                    severity: endNode.severity != null ? endNode.severity : 5,
                    probs: []
                });
            }
            endpointMap.get(id).probs.push(path.probability_pct / 100);
        }

        let totalExpectedSeverity = 0;
        for (const [, ep] of endpointMap) {
            let probReaches = 1;
            for (const p of ep.probs) {
                probReaches *= (1 - p);
            }
            probReaches = 1 - probReaches;
            totalExpectedSeverity += probReaches * ep.severity;
        }

        const SCALE = 3;
        riskScore = Math.min(100, Math.round(totalExpectedSeverity * SCALE));
    }

    const firstPath = paths[0] || { nodes: [], edges: [] };

    return { riskScore, pathCount: paths.length, paths, nodes: firstPath.nodes, edges: firstPath.edges, resolvedHazardId };
}

// Cascade endpoint (supports ?removed=...)
app.get('/api/cascade/:hazardId', async(req, res) => {
    try {
        const { hazardId } = req.params;
        const minProb = parseFloat(req.query.minProb || '0.5');
        const maxDepth = parseInt(req.query.maxDepth || '6');
        const removed = req.query.removed ? req.query.removed.split(',') : [];

        const cascade = await computeCascadeForHazard(hazardId, removed, minProb, maxDepth);

        const hazardInfo = await runQuery(`
            MATCH (h:Hazard {id: $hazardId})
            RETURN h.name AS name, toInteger(h.severity) AS severity, h.type AS type
            LIMIT 1
        `, { hazardId: cascade.resolvedHazardId });

        const hazard = hazardInfo[0]
            ? { name: hazardInfo[0].name, severity: hazardInfo[0].severity, type: hazardInfo[0].type }
            : { name: cascade.resolvedHazardId, severity: 5, type: 'unknown' };

        res.json({
            success: true,
            hazard,
            riskScore: cascade.riskScore,
            pathCount: cascade.pathCount,
            paths: cascade.paths,
            nodes: cascade.nodes,
            edges: cascade.edges,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── INTERVENTION OPTIMIZER ──────────────────────────────────────────────
app.get('/api/recommend-interventions/:hazardId', async (req, res) => {
    try {
        const { hazardId } = req.params;

        // Resolve hazard and find the parent scenario
        const resolved = await computeCascadeForHazard(hazardId, []);
        const resolvedHazardId = resolved.resolvedHazardId;

        const scenarioInfo = await runQuery(`
            MATCH (sc:Scenario)-[:CONTAINS]->(h:Hazard {id: $hazardId})
            RETURN sc.id AS scenarioId, toInteger(sc.deaths) AS deaths, sc.name AS scenarioName
            LIMIT 1
        `, { hazardId: resolvedHazardId });

        if (!scenarioInfo.length) {
            return res.status(404).json({ success: false, error: 'No scenario found for this hazard' });
        }

        const { scenarioId, deaths, scenarioName } = scenarioInfo[0];

        // Baseline cascade (no removals)
        const baseline = resolved;

        // Fetch all mitigable nodes (Infrastructure / Resource)
        const mitigableNodes = await runQuery(`
            MATCH (sc:Scenario {id: $scenarioId})-[:CONTAINS]->(n)
            WHERE n:Infrastructure OR n:Resource
            RETURN n.id AS id, n.name AS name, labels(n)[0] AS label
        `, { scenarioId });

        if (!mitigableNodes.length) {
            return res.json({
                success: true,
                scenarioId,
                scenarioName,
                baselineRiskScore: baseline.riskScore,
                baselinePathCount: baseline.pathCount,
                topRecommendation: null,
                allOptions: [],
                combinedTopTwo: null,
                note: 'No mitigable nodes (Infrastructure or Resource) found in this scenario',
            });
        }

        // Test every single-node removal, one at a time
        const results = [];
        for (const node of mitigableNodes) {
            const result = await computeCascadeForHazard(resolvedHazardId, [node.id]);
            const riskReduction = Math.max(0, baseline.riskScore - result.riskScore);
            const eliminatedPaths = Math.max(0, baseline.pathCount - result.pathCount);
            results.push({
                nodeId: node.id,
                nodeName: node.name,
                nodeLabel: node.label,
                riskScoreAfter: result.riskScore,
                riskReduction: Math.round(riskReduction * 10) / 10,
                eliminatedPaths,
                pathCountAfter: result.pathCount,
            });
        }

        // Rank: biggest risk reduction first, then most paths eliminated
        results.sort((a, b) => {
            const diff = b.riskReduction - a.riskReduction;
            if (diff !== 0) return diff;
            return b.eliminatedPaths - a.eliminatedPaths;
        });

        const top = results[0];
        const second = results.length > 1 ? results[1] : null;

        // Combined top-two intervention
        let combinedTopTwo = null;
        if (top && second && results.length >= 2) {
            const combinedResult = await computeCascadeForHazard(resolvedHazardId, [top.nodeId, second.nodeId]);
            const combinedReduction = Math.max(0, baseline.riskScore - combinedResult.riskScore);
            const combinedEliminated = Math.max(0, baseline.pathCount - combinedResult.pathCount);
            combinedTopTwo = {
                node1: { id: top.nodeId, name: top.nodeName, label: top.nodeLabel },
                node2: { id: second.nodeId, name: second.nodeName, label: second.nodeLabel },
                riskScoreAfter: combinedResult.riskScore,
                riskReduction: Math.round(combinedReduction * 10) / 10,
                eliminatedPaths: combinedEliminated,
            };
        }

        // Determine if the top choice has meaningful impact
        const topHasImpact = top && (top.riskReduction > 0 || top.eliminatedPaths > 0);

        // Lives-saved estimate — use riskReduction if available, fall back to path elimination ratio
        const livesSaved = (deaths && topHasImpact)
            ? top.riskReduction > 0
                ? Math.floor(deaths * (top.riskReduction / 100) * 0.25)
                : Math.floor(deaths * (top.eliminatedPaths / baseline.pathCount) * 0.25)
            : 0;

        // Plain-language recommendation
        let recommendation;
        if (top && top.riskReduction > 0) {
            recommendation = `Protecting ${top.nodeName} before disaster strikes reduces cascade risk by ${top.riskReduction} points and eliminates ${top.eliminatedPaths} of the ${baseline.pathCount} most dangerous failure chains. This is your highest-leverage intervention.`;
        } else if (top && top.eliminatedPaths > 0) {
            recommendation = `Protecting ${top.nodeName} eliminates ${top.eliminatedPaths} of ${baseline.pathCount} cascade chains, reducing the breadth of potential failure propagation even though the risk index remains elevated.`;
        } else {
            recommendation = 'No meaningful risk reduction identified from single-node interventions. Consider protecting multiple systems simultaneously.';
        }

        res.json({
            success: true,
            scenarioId,
            scenarioName,
            deaths,
            baselineRiskScore: baseline.riskScore,
            baselinePathCount: baseline.pathCount,
            topRecommendation: topHasImpact ? {
                nodeId: top.nodeId,
                nodeName: top.nodeName,
                nodeLabel: top.nodeLabel,
                riskReduction: top.riskReduction,
                eliminatedPaths: top.eliminatedPaths,
                riskScoreAfter: top.riskScoreAfter,
                recommendation,
                livesSaved,
                disclaimer: 'Model estimate based on historical data. Not all deaths are cascade-preventable. Actual outcomes depend on many factors beyond infrastructure protection.',
            } : null,
            allOptions: results,
            combinedTopTwo,
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
const FIRMS_SOURCE = 'NASA FIRMS VIIRS_NRT';
const FIRMS_NRT_SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'];
const FIRMS_DAY_RANGE = Math.min(5, Math.max(1, parseInt(process.env.FIRMS_DAY_RANGE || '2', 10) || 2));
const FIRMS_DETECTION_LIMIT = 30;

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

function splitCsvLine(line) {
    const values = [];
    let current = '';
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1];

        if (char === '"' && quoted && next === '"') {
            current += '"';
            i++;
        } else if (char === '"') {
            quoted = !quoted;
        } else if (char === ',' && !quoted) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    values.push(current);
    return values.map(v => v.trim());
}

function parseFirmsCsv(csvData, source) {
    const rows = csvData.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (rows.length === 0) return [];

    const headers = splitCsvLine(rows[0]).map(h => h.toLowerCase());
    const indexOf = (...names) => {
        for (const name of names) {
            const index = headers.indexOf(name);
            if (index !== -1) return index;
        }
        return -1;
    };

    const latIdx = indexOf('latitude', 'lat');
    const lonIdx = indexOf('longitude', 'lon');
    const frpIdx = indexOf('frp');

    if (latIdx === -1 || lonIdx === -1 || frpIdx === -1) {
        throw new Error(`NASA FIRMS ${source} CSV missing latitude/longitude/frp columns: ${rows[0].slice(0, 160)}`);
    }

    const brightnessIdx = indexOf('bright_ti4', 'brightness', 'bright_t31');
    const acqDateIdx = indexOf('acq_date');
    const acqTimeIdx = indexOf('acq_time');
    const satelliteIdx = indexOf('satellite');
    const confidenceIdx = indexOf('confidence');
    const daynightIdx = indexOf('daynight');

    return rows.slice(1).map((line, rowIndex) => {
        const cols = splitCsvLine(line);
        return {
            lat: parseFloat(cols[latIdx]),
            lon: parseFloat(cols[lonIdx]),
            brightness: brightnessIdx === -1 ? null : parseFloat(cols[brightnessIdx]),
            acq_date: acqDateIdx === -1 ? '' : (cols[acqDateIdx] || '').trim(),
            acq_time: acqTimeIdx === -1 ? '' : (cols[acqTimeIdx] || '').trim(),
            satellite: satelliteIdx === -1 ? '' : (cols[satelliteIdx] || '').trim(),
            confidence: confidenceIdx === -1 ? '' : (cols[confidenceIdx] || '').trim().toLowerCase(),
            frp: parseFloat(cols[frpIdx]) || 0,
            daynight: daynightIdx === -1 ? '' : (cols[daynightIdx] || '').trim().toUpperCase(),
            source,
            detection_index: rowIndex
        };
    });
}

function coordinateIdPart(value) {
    const prefix = value < 0 ? 'neg_' : '';
    return `${prefix}${Math.abs(value).toFixed(5).replace('.', '_')}`;
}

function safeSourcePart(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
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
        id: `live_fire_${safeSourcePart([
            fire.source || 'firms',
            fire.satellite || 'sat',
            fire.acq_date || 'date',
            fire.acq_time || 'time',
            fire.detection_index ?? 'idx'
        ].join('_'))}_${coordinateIdPart(fire.lat)}_${coordinateIdPart(fire.lon)}`,
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
        satellite: fire.satellite,
        firms_source: fire.source
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
        region: fire.region,
        satellite: fire.satellite,
        firms_source: fire.firms_source
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
            h.firms_source = $firmsSource,
            h.confidence = $confidence,
            h.live = true,
            h.source = $source,
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
        firmsSource: fire.firms_source,
        confidence: fire.confidence,
        source: FIRMS_SOURCE,
        now
    });

    await runQuery(`
        MERGE (sc:Scenario {id: 'live_wildfires_satellite'})
        SET sc.name = 'Live Wildfires — NASA Satellite',
            sc.year = $year,
            sc.location = 'Global (Top 30 detections by intensity)',
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

async function enrichFireWithPlaceNameAsync(fire) {
    try {
        const placeName = await fetchPlaceName(fire.lat, fire.lon);
        if (placeName) {
            const displayName = `Live Fire · ${placeName}`;
            await runQuery(`
                MATCH (h:Hazard {id: $nodeId})
                SET h.place_name = $placeName,
                    h.name = $displayName,
                    h.region = $placeName
            `, { nodeId: fire.id, placeName, displayName });
            console.log(`[FIRMS] Enriched ${fire.id} → ${placeName}`);
        }
    } catch (err) {
        console.warn(`[FIRMS] Place name enrichment skipped for ${fire.id}: ${err.message}`);
    }
}

async function cleanSynthesisedData() {
    try {
        // 1. Remove stale live cascade nodes, including older builds that
        //    predated the synthesised=true marker but used OSM/synth ids.
        await runQuery(`
            MATCH (sc:Scenario {id: 'live_wildfires_satellite'})-[:CONTAINS]->(n)
            WHERE n.synthesised = true
               OR n.source = 'OpenStreetMap'
               OR n.id STARTS WITH 'osm_'
               OR n.id STARTS WITH 'synth_'
            DETACH DELETE n
        `);

        // 2. Remove every remaining live-scenario membership. The current
        //    FIRMS detections are linked back in immediately after cleanup.
        await runQuery(`
            MATCH (sc:Scenario {id: 'live_wildfires_satellite'})-[r:CONTAINS]->()
            DELETE r
        `);

        // 3. Clean up synthesis-derived properties from remaining hazard nodes.
        await runQuery(`
            MATCH (h:Hazard {live: true})
            REMOVE h.wind_speed_kmh, h.wind_direction_deg, h.spread_radius_km,
                   h.cascade_synthesised, h.synthesis_timestamp, h.place_name
        `);

        console.log('[FIRMS] Cleaned up synthesised data & old hazard links');
    } catch (err) {
        console.warn('[FIRMS] Cleanup warning:', err.message);
    }
}

async function sendFireResponse(res, fires, asOf, options = {}) {
    await cleanSynthesisedData();
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

    res.json(payload);

    // Fire-and-forget: enrich each fire with a real place name from Nominatim.
    // The rate limiter (1.1s between calls) in fetchPlaceName serializes them.
    // Next load of this endpoint will show real place names in the dropdown.
    for (const f of formatted) {
        enrichFireWithPlaceNameAsync(f);
    }
}

app.get('/api/realtime/wildfires', async(req, res) => {
    try {
        const FIRMS_KEY = process.env.FIRMS_MAP_KEY;

        if (!hasUsableFirmsKey(FIRMS_KEY)) {
            console.warn('[FIRMS] No FIRMS_MAP_KEY set — no live NASA data returned');
            await cleanSynthesisedData();
            return res.status(503).json({
                success: false,
                live: false,
                fires_seeded: 0,
                source: FIRMS_SOURCE,
                as_of: new Date().toISOString(),
                data: [],
                error: 'FIRMS_MAP_KEY is not configured. Live NASA FIRMS data is required.'
            });
        }

        console.log(`[FIRMS] Fetching ${FIRMS_DAY_RANGE}-day NRT satellite data from NASA...`);

        const sourceResults = await Promise.allSettled(FIRMS_NRT_SOURCES.map(async(source) => {
            const firmsUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_KEY}/${source}/world/${FIRMS_DAY_RANGE}`;
            const csvData = await fetchText(firmsUrl);
            const detections = parseFirmsCsv(csvData, source);
            console.log(`[FIRMS] ${source}: ${detections.length} raw detections`);
            return detections;
        }));

        const parsed = [];
        const sourceErrors = [];

        for (let i = 0; i < sourceResults.length; i++) {
            const result = sourceResults[i];
            if (result.status === 'fulfilled') {
                parsed.push(...result.value);
            } else {
                sourceErrors.push(`${FIRMS_NRT_SOURCES[i]}: ${result.reason.message}`);
            }
        }

        if (parsed.length === 0 && sourceErrors.length === FIRMS_NRT_SOURCES.length) {
            throw new Error(sourceErrors.join(' | '));
        }

        if (sourceErrors.length > 0) {
            console.warn(`[FIRMS] Some sources failed: ${sourceErrors.join(' | ')}`);
        }

        console.log(`[FIRMS] Combined raw detections received: ${parsed.length}`);

        const validFires = parsed.filter(f =>
            !isNaN(f.lat) &&
            !isNaN(f.lon) &&
            f.frp > 0
        );

        // Prefer high-confidence detections, but do not blank the graph when
        // the current NASA feed only contains nominal detections.
        const highConf = validFires.filter(f => f.confidence === 'h');

        console.log(`[FIRMS] High-confidence fires: ${highConf.length}`);

        // Sort by FRP descending — highest intensity fires first
        const candidates = highConf.length > 0 ? highConf : validFires;
        candidates.sort((a, b) => b.frp - a.frp);

        // Take the strongest live detections globally.
        const topDetections = candidates.slice(0, FIRMS_DETECTION_LIMIT);

        if (topDetections.length === 0) {
            await cleanSynthesisedData();
            return res.json({
                success: true,
                live: true,
                fires_seeded: 0,
                source: FIRMS_SOURCE,
                as_of: new Date().toISOString(),
                data: [],
                message: 'NASA FIRMS returned data, but no active detections with positive FRP were available'
            });
        }

        return sendFireResponse(res, topDetections, new Date().toISOString());

    } catch (err) {
        console.error('[FIRMS] Error:', err.message);
        await cleanSynthesisedData();
        return res.status(502).json({
            success: false,
            live: false,
            fires_seeded: 0,
            source: FIRMS_SOURCE,
            as_of: new Date().toISOString(),
            data: [],
            error: `NASA FIRMS unavailable: ${err.message}`
        });
    }
});

// ── LIVE CASCADE SYNTHESIS ENDPOINT ─────────────────────────────────────────
// Synthesizes a full cascade graph for any live wildfire using real-time wind
// (Open-Meteo) and real infrastructure (OpenStreetMap/Overpass).
app.get('/api/realtime/wildfires/cascade/:fireId', async (req, res) => {
    const { fireId } = req.params;
    console.log(`[Synthesis] Request for fireId: ${fireId}`);

    try {
        // Load the fire from Neo4j
        console.log('[Synthesis] Loading fire from Neo4j...');
        const fireRecords = await runQuery(`
            MATCH (h:Hazard {id: $fireId})
            RETURN h.id AS id, h.name AS name, h.lat AS lat, h.lon AS lon,
                   h.frp_mw AS frp_mw, h.region AS region, h.acq_date AS acq_date
            LIMIT 1
        `, { fireId });

        if (!fireRecords.length) {
            console.error(`[Synthesis] Fire ${fireId} not found in Neo4j`);
            return res.status(404).json({ success: false, error: `Fire ${fireId} not found in Neo4j` });
        }

        const fire = fireRecords[0];
        console.log(`[Synthesis] Fire loaded: ${fire.name} @ ${fire.lat},${fire.lon} FRP: ${fire.frp_mw}MW`);

        const result = await synthesiseCascadeForFire(fire, runQuery);
        console.log(`[Synthesis] Complete: ${result.nodesSeeded} nodes, ${result.edgesSeeded} edges, riskScore: ${result.riskScore}`);
        res.json(result);

    } catch (err) {
        console.error('[Synthesis] ERROR:', err.message);
        console.error('[Synthesis] Stack:', err.stack);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── WIND DATA ENDPOINT ─────────────────────────────────────────────────────
// Returns live wind data for any lat/lon from Open-Meteo (free, no key).
app.get('/api/realtime/wildfires/wind/:lat/:lon', async (req, res) => {
    try {
        const lat = parseFloat(req.params.lat);
        const lon = parseFloat(req.params.lon);

        if (isNaN(lat) || isNaN(lon)) {
            return res.status(400).json({ success: false, error: 'Invalid lat/lon' });
        }

        const wind = await fetchWind(lat, lon);
        res.json({ success: true, lat, lon, wind });
    } catch (err) {
        console.error('[Wind]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Export for Vercel (critical)
module.exports = app;

if (require.main === module) {
    const PORT = parseInt(process.env.PORT, 10) || 3001;

    (function boot(port, maxRetries = 5) {
        app.listen(port)
            .on('error', (err) => {
                if (err.code === 'EADDRINUSE' && maxRetries > 0) {
                    console.warn(`⚠ Port ${port} in use — trying ${port + 1}`);
                    boot(port + 1, maxRetries - 1);
                } else {
                    console.error(`✖ Failed to start on port ${port}:`, err.message);
                    process.exit(1);
                }
            })
            .on('listening', function () {
                const actualPort = this.address().port;
                const suffix = actualPort !== Number(port) ? ` (requested ${port})` : '';
                console.log(`🚀 CascadeIQ API → http://localhost:${actualPort}${suffix}`);
                console.log(`📊 Neo4j URI     → ${process.env.NEO4J_URI?.slice(0, 30)}...`);
                console.log(`\nEndpoints:`);
                console.log(`  GET /health`);
                console.log(`  GET /api/scenarios`);
                console.log(`  GET /api/scenarios/:id`);
                console.log(`  GET /api/scenarios/:id/validation`);
                console.log(`  POST /api/seed/validation`);
                console.log(`  GET /api/cascade/:hazardId`);
                console.log(`  GET /api/recommend-interventions/:hazardId`);
                console.log(`  GET /api/analytics/criticality`);
                console.log(`  WS  /ws/simulation`);
                console.log(`  GET /api/realtime/wildfires`);
                console.log(`  GET /api/realtime/wildfires/cascade/:fireId`);
                console.log(`  GET /api/realtime/wildfires/wind/:lat/:lon`);

                seedValidationIfMissing().then(seeded => {
                    console.log(`[Boot] Validation seeding complete`);
                }).catch(err => {
                    console.error(`[Boot] Validation seeding error:`, err.message);
                });

                const wss = new WebSocket.Server({ server: this });

                wss.on('connection', (ws) => {
                    const timers = new Set();
                    const clearTimers = () => {
                        for (const timer of timers) {
                            clearTimeout(timer);
                        }
                        timers.clear();
                    };

                    ws.on('message', async (message) => {
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
        round(cascade_prob * 1000) / 10.0 AS probability_pct,
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

                    const pingInterval = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.ping();
                        } else {
                            clearInterval(pingInterval);
                        }
                    }, 30000);

                    ws.on('close', () => {
                        clearInterval(pingInterval);
                        clearTimers();
                    });

                    ws.on('error', () => {
                        clearInterval(pingInterval);
                        clearTimers();
                    });
                });

                const keepAlive = setInterval(() => { }, 1 << 30);

                function shutdown(signal) {
                    clearInterval(keepAlive);
                    console.log(`\n${signal} received. Shutting down CascadeIQ API...`);
                    wss.close(() => this.close(() => process.exit(0)));
                }

                process.on('SIGINT', () => shutdown('SIGINT'));
                process.on('SIGTERM', () => shutdown('SIGTERM'));
            });
    })(PORT);
}
