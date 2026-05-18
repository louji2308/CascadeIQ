require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { verifyConnection } = require('./services/neo4j');
const scenariosRoute = require('./routes/scenarios');
const cascadeRoute = require('./routes/cascade');

const app = express();

// ── MIDDLEWARE ────────────────────────────────────────────
// cors() allows requests from your Expo app and Vercel dashboard
app.use(cors());
// express.json() lets the server read JSON request bodies
app.use(express.json());

// ── ROUTES ────────────────────────────────────────────────
app.use('/api/scenarios', scenariosRoute);
app.use('/api/cascade', cascadeRoute);

// Health check — always have this
// Judges and Railway use this to confirm the server is alive
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'cascadeiq-api',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// 404 handler — if no route matched
app.use((req, res) => {
    res.status(404).json({ success: false, error: `Route ${req.path} not found` });
});

// ── ERROR HANDLER ─────────────────────────────────────────
// Any route that calls next(err) lands here
// Must have 4 parameters for Express to treat it as error handler
app.use((err, req, res, next) => {
    console.error('API Error:', err.message);
    res.status(500).json({
        success: false,
        error: err.message,
        path: req.path
    });
});

// ── START SERVER ──────────────────────────────────────────
const PORT = process.env.PORT || 3001;

// First verify Neo4j is reachable, then start accepting requests
// If Neo4j is down, the server refuses to start rather than serving broken data
verifyConnection().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 CascadeIQ API running on port ${PORT}`);
        console.log(`   Health: http://localhost:${PORT}/health`);
        console.log(`   Scenarios: http://localhost:${PORT}/api/scenarios`);
    });
}).catch(err => {
    console.error('Failed to start:', err.message);
    process.exit(1);
});