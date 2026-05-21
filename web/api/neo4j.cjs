require('dotenv').config();

const neo4j = require('neo4j-driver');

let driver;

function getDriver() {
    if (!driver) {
        if (!process.env.NEO4J_URI) {
            throw new Error('NEO4J_URI environment variable is not set');
        }
        driver = neo4j.driver(
            process.env.NEO4J_URI,
            neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
        );
    }
    return driver;
}

// Recursively convert all Neo4j Integer objects to plain JS numbers.
// Neo4j driver represents integers as {low, high} objects.
function convertNeo4jIntegers(val) {
    if (val === null || val === undefined) {
        return val;
    }
    // Neo4j Integer — driver exposes neo4j.isInt() for this check
    if (neo4j.isInt(val)) {
        return val.toNumber();
    }
    // Plain JS array — recurse into each element
    if (Array.isArray(val)) {
        return val.map(convertNeo4jIntegers);
    }
    // Plain object (but NOT a Neo4j Node/Relationship/Path) — recurse into values
    if (typeof val === 'object') {
        const out = {};
        for (const key of Object.keys(val)) {
            out[key] = convertNeo4jIntegers(val[key]);
        }
        return out;
    }
    // Primitive (string, number, boolean) — pass through as-is
    return val;
}
async function runQuery(cypher, params = {}) {
    const session = getDriver().session();
    try {
        const result = await session.run(cypher, params);
        return result.records.map(record => {
            const raw = record.toObject();
            return convertNeo4jIntegers(raw);
        });
    } finally {
        await session.close();
    }
}

module.exports = { runQuery };