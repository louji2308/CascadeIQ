const dotenv = require('dotenv');
dotenv.config({ path: require('path').resolve(__dirname, '../.env') });

const neo4j = require('neo4j-driver');
require('dotenv').config();

// Create the driver — this is the connection to your AuraDB instance
// We create it ONCE and reuse it for every query (connection pooling)
const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD), {
        maxConnectionPoolSize: 10,
        connectionAcquisitionTimeout: 30000,
    }
);

// This runs once when the server starts
// If the connection fails, the server shuts down immediately
// Better to fail loudly at startup than silently return empty data
async function verifyConnection() {
    const session = driver.session();
    try {
        await session.run('RETURN 1');
        console.log('✅ Neo4j connected successfully');
    } catch (err) {
        console.error('❌ Neo4j connection failed:', err.message);
        process.exit(1);
    } finally {
        await session.close();
    }
}

// Helper to convert Neo4j integers to plain JavaScript numbers
// Neo4j returns integers as {low: N, high: 0} objects
// This converts them back to plain numbers
function toJS(value) {
    if (value === null || value === undefined) return value;

    // Neo4j integer object — {low: N, high: M}
    // For numbers <= 2,147,483,647: high is 0, low is the value
    // For numbers > 2,147,483,647: high is non-zero
    // Formula: actual value = high * 2^32 + (low >>> 0)
    if (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof value.low === 'number' &&
        typeof value.high === 'number'
    ) {
        if (value.high === 0) return value.low;
        if (value.high === -1) return value.low; // negative numbers
        // Large positive integer
        return value.high * 4294967296 + (value.low >>> 0);
    }

    if (Array.isArray(value)) return value.map(toJS);

    if (typeof value === 'object') {
        const result = {};
        for (const key of Object.keys(value)) {
            result[key] = toJS(value[key]);
        }
        return result;
    }

    return value;
}

// The main helper every route will use
// Pass in a Cypher string and a params object
// Get back a plain JavaScript array of objects
async function runQuery(cypher, params = {}) {
    const session = driver.session();
    try {
        const result = await session.run(cypher, params);
        // Convert each record to a plain JS object and fix Neo4j integers
        return result.records.map(record => {
            const obj = record.toObject();
            return toJS(obj);
        });
    } catch (err) {
        console.error('Query failed:', err.message);
        console.error('Cypher:', cypher);
        throw err;
    } finally {
        await session.close();
    }
}

module.exports = { driver, verifyConnection, runQuery };