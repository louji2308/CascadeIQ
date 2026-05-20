const express = require('express');
const cors = require('cors');
const { runQuery } = require('./neo4j');

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

// Export for Vercel (critical)
module.exports = app;