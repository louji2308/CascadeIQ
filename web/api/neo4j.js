const neo4j = require('neo4j-driver');

let driver;

function getDriver() {
    if (!driver) {
        driver = neo4j.driver(
            process.env.NEO4J_URI,
            neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
        );
    }
    return driver;
}

async function runQuery(cypher, params = {}) {
    const session = getDriver().session();
    try {
        const result = await session.run(cypher, params);
        return result.records.map(record => record.toObject());
    } finally {
        await session.close();
    }
}

module.exports = { runQuery };