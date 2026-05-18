const express = require('express');
const router = express.Router();
const { runQuery } = require('../services/neo4j');

// GET /api/scenarios
// Returns all scenarios ordered by year (newest first)
// This powers the home screen dropdown in the Expo app
router.get('/', async(req, res, next) => {
    try {
        const records = await runQuery(`
      MATCH (s:Scenario)
      RETURN s.id AS id,
             s.name AS name,
             s.year AS year,
             s.location AS location,
             s.deaths AS deaths,
             s.damage_usd AS damage_usd,
             s.description AS description
      ORDER BY s.year DESC
    `);
        res.json({ success: true, count: records.length, data: records });
    } catch (err) {
        next(err);
    }
});

// GET /api/scenarios/:id
// Returns one scenario + all its nodes + all edges between those nodes
// This is what Query 3 from Phase 1 does
router.get('/:id', async(req, res, next) => {
    try {
        const { id } = req.params;

        // First get the scenario metadata
        const scenarioRecords = await runQuery(`
      MATCH (sc:Scenario {id: $id})
      RETURN sc.id AS id, sc.name AS name, sc.year AS year,
             sc.location AS location, sc.deaths AS deaths,
             sc.description AS description
    `, { id });

        if (scenarioRecords.length === 0) {
            return res.status(404).json({ success: false, error: 'Scenario not found' });
        }

        // Then get all edges between nodes in this scenario
        const edgeRecords = await runQuery(`
      MATCH (sc:Scenario {id: $id})-[:CONTAINS]->(n)
      WITH collect(n) AS scenarioNodes
      UNWIND scenarioNodes AS a
      UNWIND scenarioNodes AS b
      MATCH (a)-[r]->(b)
      WHERE type(r) <> 'CONTAINS'
      RETURN
        {id: a.id, name: a.name, label: labels(a)[0],
         severity: a.severity, type: a.type} AS source,
        {id: b.id, name: b.name, label: labels(b)[0],
         severity: b.severity, type: b.type} AS target,
        {type: type(r), prob: r.prob,
         delay_hrs: r.delay_hrs, mechanism: r.mechanism} AS rel
    `, { id });

        // Build a clean nodes list (unique) from the edges
        const nodeMap = {};
        edgeRecords.forEach(record => {
            if (record.source && record.source.id) nodeMap[record.source.id] = record.source;
            if (record.target && record.target.id) nodeMap[record.target.id] = record.target;
        });

        res.json({
            success: true,
            scenario: scenarioRecords[0],
            nodes: Object.values(nodeMap),
            edges: edgeRecords.map(r => r.rel ? { source: r.source.id, target: r.target.id, ...r.rel } :
                null
            ).filter(Boolean)
        });

    } catch (err) {
        next(err);
    }
});

module.exports = router;