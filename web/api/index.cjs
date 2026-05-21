const express = require('express');
const cors = require('cors');
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

        const paths = await runQuery(cypher, { hazardId, minProb, removed });
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
// Export for Vercel (critical)
module.exports = app;