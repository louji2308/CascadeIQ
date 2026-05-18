const express = require('express');
const router = express.Router();
const { runQuery } = require('../services/neo4j');

// GET /api/cascade/:hazardId
router.get('/:hazardId', async(req, res, next) => {
    try {
        const { hazardId } = req.params;
        const minProb = parseFloat(req.query.minProb || '0.5');

        // Verify hazard exists first
        const hazardCheck = await runQuery(`
      MATCH (h:Hazard {id: $hazardId})
      RETURN h.name AS name, h.severity AS severity, h.type AS type
    `, { hazardId });

        if (hazardCheck.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Hazard with id "${hazardId}" not found`
            });
        }

        // CRITICAL FIX: Neo4j does not allow $parameters inside [r*1..$depth]
        // The depth must be a hardcoded number in the Cypher string itself
        // We build the query string with the number directly interpolated
        const maxDepth = parseInt(req.query.maxDepth || '6');
        const safDepth = Math.min(Math.max(maxDepth, 1), 8); // clamp between 1 and 8

        const cascadeQuery = `
      MATCH path = (start:Hazard {id: $hazardId})-[r*1..${safDepth}]->(end)
      WHERE ALL(rel IN relationships(path) WHERE rel.prob > $minProb)
      WITH path,
           nodes(path) AS ns,
           relationships(path) AS rs,
           REDUCE(p = 1.0, r IN relationships(path) | p * r.prob) AS cascade_prob,
           REDUCE(d = 0, r IN relationships(path) | d + r.delay_hrs) AS total_delay
      RETURN
        [n IN ns | {
          id: n.id,
          name: n.name,
          label: labels(n)[0],
          severity: n.severity,
          type: n.type
        }] AS nodes,
        [r IN rs | {
          type: type(r),
          prob: r.prob,
          delay_hrs: r.delay_hrs,
          mechanism: r.mechanism
        }] AS edges,
        length(path) AS depth,
        round(cascade_prob * 100, 1) AS probability_pct,
        total_delay AS hours_to_end
      ORDER BY cascade_prob DESC
      LIMIT 20
    `;

        const paths = await runQuery(cascadeQuery, { hazardId, minProb });

        // Compute risk score 0-100
        let riskScore = 0;
        if (paths.length > 0) {
            const topProb = paths[0].probability_pct || 0;
            const maxDepthFound = Math.max(...paths.map(p => p.depth || 1));
            riskScore = Math.min(100, Math.round(topProb * (1 + maxDepthFound * 0.05)));
        }

        res.json({
            success: true,
            hazard: hazardCheck[0],
            riskScore,
            pathCount: paths.length,
            paths
        });

    } catch (err) {
        next(err);
    }
});

module.exports = router;