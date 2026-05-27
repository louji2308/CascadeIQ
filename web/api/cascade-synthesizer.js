'use strict';

const https = require('https');

function fetchJson(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const opts = {
            ...options,
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            timeout: 30000,
            headers: { 'User-Agent': 'CascadeIQ/1.0', ...(options.headers || {}) },
        };
        const req = https.get(opts, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`HTTP ${res.statusCode} from ${url.slice(0, 80)}: ${data.slice(0, 200)}`));
                    return;
                }
                try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
            });
            res.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

function fetchText(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                resolve(data);
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}

const NOMINATIM_UA = 'CascadeIQ/1.0 (disaster intelligence system; https://cascadeiq.dev)';
let lastNominatimCall = 0;

async function fetchPlaceName(lat, lon) {
    const now = Date.now();
    const elapsed = now - lastNominatimCall;
    if (elapsed < 1100) {
        await new Promise(r => setTimeout(r, 1100 - elapsed));
    }
    lastNominatimCall = Date.now();

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=14&accept-language=en`;
    try {
        const data = await fetchJson(url, {
            headers: { 'User-Agent': NOMINATIM_UA }
        });
        const addr = data?.address || {};
        const parts = [
            addr.city || addr.town || addr.village || addr.municipality || addr.county || addr.district || addr.suburb,
            addr.state || addr.region,
            addr.country
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(', ') : null;
    } catch (e) {
        console.warn(`[Nominatim] Reverse geocode failed for ${lat},${lon}: ${e.message}`);
        return null;
    }
}

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x =
        Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
        Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function windAlignmentFactor(bearingToNode, windDirection) {
    const angleDiff = Math.abs(((bearingToNode - windDirection) + 540) % 360 - 180);
    return 0.5 + 0.5 * Math.cos(angleDiff * Math.PI / 180);
}

function fireSpreadSpeed(windSpeedKmh, frpMw) {
    return 5 + (windSpeedKmh * 0.4) + (frpMw / 200);
}

function safeId(str) {
    return String(str)
        .replace(/-/g, 'neg')
        .replace(/\./g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '_');
}

function characteriseFire(frpMw) {
    const severityScore = Math.min(10, frpMw / 50);
    const spreadRadiusKm = Math.min(80, 15 + (frpMw / 20));
    const baseIntensity = Math.min(0.98, 0.25 + (frpMw / 100));
    return { severityScore, spreadRadiusKm, baseIntensity };
}

async function fetchWind(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh&forecast_days=1`;
    try {
        const data = await fetchJson(url);
        const ws = data?.current?.wind_speed_10m ?? 15;
        const wd = data?.current?.wind_direction_10m ?? 0;
        return { windSpeedKmh: Number(ws), windDirectionDeg: Number(wd) };
    } catch (e) {
        console.warn('[Synthesizer] Open-Meteo fallback:', e.message);
        return { windSpeedKmh: 15, windDirectionDeg: 270 };
    }
}

const OSM_INFRA_TYPES = [
    { tag: 'amenity=hospital', neoLabel: 'Resource', relType: 'THREATENS', icon: '🏥', category: 'hospital' },
    { tag: 'amenity=clinic', neoLabel: 'Resource', relType: 'THREATENS', icon: '🏥', category: 'hospital' },
    { tag: 'amenity=doctors', neoLabel: 'Resource', relType: 'THREATENS', icon: '🏥', category: 'hospital' },
    { tag: 'amenity=health_post', neoLabel: 'Resource', relType: 'THREATENS', icon: '🏥', category: 'hospital' },
    { tag: 'power=substation', neoLabel: 'Infrastructure', relType: 'DESTROYS', icon: '⚡', category: 'power' },
    { tag: 'power=generator', neoLabel: 'Infrastructure', relType: 'DESTROYS', icon: '⚡', category: 'power' },
    { tag: 'power=plant', neoLabel: 'Infrastructure', relType: 'DESTROYS', icon: '⚡', category: 'power' },
    { tag: 'highway=motorway', neoLabel: 'Infrastructure', relType: 'BLOCKS', icon: '🛣', category: 'road' },
    { tag: 'highway=trunk', neoLabel: 'Infrastructure', relType: 'BLOCKS', icon: '🛣', category: 'road' },
    { tag: 'highway=primary', neoLabel: 'Infrastructure', relType: 'BLOCKS', icon: '🛣', category: 'road' },
    { tag: 'highway=secondary', neoLabel: 'Infrastructure', relType: 'BLOCKS', icon: '🛣', category: 'road' },
    { tag: 'amenity=fire_station', neoLabel: 'Resource', relType: 'OVERWHELMS', icon: '🚒', category: 'fire_station' },
    { tag: 'amenity=police', neoLabel: 'Resource', relType: 'OVERWHELMS', icon: '🚔', category: 'police' },
    { tag: 'aeroway=aerodrome', neoLabel: 'Infrastructure', relType: 'CLOSES', icon: '✈', category: 'airport' },
    { tag: 'amenity=school', neoLabel: 'Infrastructure', relType: 'THREATENS', icon: '🏫', category: 'school' },
    { tag: 'amenity=fuel', neoLabel: 'Infrastructure', relType: 'DESTROYS', icon: '⛽', category: 'fuel' },
    { tag: 'amenity=place_of_worship', neoLabel: 'Infrastructure', relType: 'THREATENS', icon: '⛪', category: 'worship' },
    { tag: 'tourism=hotel', neoLabel: 'Infrastructure', relType: 'DESTROYS', icon: '🏨', category: 'hotel' },
    { tag: 'railway=station', neoLabel: 'Infrastructure', relType: 'BLOCKS', icon: '🚉', category: 'railway' },
    { tag: 'man_made=water_well', neoLabel: 'Infrastructure', relType: 'DESTROYS', icon: '💧', category: 'water' },
    { tag: 'man_made=water_tower', neoLabel: 'Infrastructure', relType: 'DESTROYS', icon: '💧', category: 'water' },
    { tag: 'amenity=marketplace', neoLabel: 'Infrastructure', relType: 'DESTROYS', icon: '🏪', category: 'market' },
    { tag: 'amenity=townhall', neoLabel: 'Infrastructure', relType: 'THREATENS', icon: '🏛', category: 'government' },
    { tag: 'amenity=bus_station', neoLabel: 'Infrastructure', relType: 'BLOCKS', icon: '🚌', category: 'transport' },
];

function buildOverpassQuery(lat, lon, radiusM) {
    const parts = OSM_INFRA_TYPES.map(({ tag }) => {
        const [key, val] = tag.split('=');
        return [
            `node["${key}"="${val}"](around:${radiusM},${lat},${lon});`,
            `way["${key}"="${val}"](around:${radiusM},${lat},${lon});`,
        ].join('\n');
    }).join('\n');
    return `[out:json][timeout:45][maxsize:536870912];\n(\n${parts}\n);\nout center tags;`;
}

const OVERPASS_UA = 'CascadeIQ/1.0 (disaster intelligence; https://cascadeiq.dev)';

const LATIN_RE = /^[\x20-\x7E\p{Script=Latin}0-9\s,.'\-()]+$/u;

function isLatinText(s) {
    if (!s) return false;
    return LATIN_RE.test(s);
}

const CATEGORY_LABELS = {
    hospital: 'Hospital',
    power: 'Power Substation',
    road: 'Road',
    fire_station: 'Fire Station',
    police: 'Police Station',
    airport: 'Airport',
    school: 'School',
    fuel: 'Fuel Station',
    worship: 'Place of Worship',
    hotel: 'Hotel',
    railway: 'Railway Station',
    water: 'Water Facility',
    market: 'Market',
    government: 'Government Building',
    transport: 'Bus Station',
    comms: 'Communications Tower',
};

function resolveOsmName(tags, cfg, el) {
    const c = cfg.category;

    if (tags['name:en'] && isLatinText(tags['name:en'])) return tags['name:en'];

    if (tags.name && isLatinText(tags.name)) return tags.name;

    if (tags.int_name && isLatinText(tags.int_name)) return tags.int_name;

    if (tags.alt_name && isLatinText(tags.alt_name)) return tags.alt_name;

    if (tags.official_name && isLatinText(tags.official_name)) return tags.official_name;

    if (tags.ref) {
        if (c === 'road') return `${tags.ref} ${tags.highway || 'Road'}`;
        if (tags.operator) return `${tags.ref} ${tags.operator}`;
        return `${tags.ref}`;
    }

    if (tags.operator) return tags.operator;

    if (tags['addr:street'] && tags['addr:housenumber']) {
        return `${tags['addr:street']} ${tags['addr:housenumber']}`;
    }
    if (tags['addr:street']) return tags['addr:street'];

    if (c === 'water') {
        if (tags.man_made === 'water_tower') return 'Water Tower';
        if (tags.man_made === 'water_well') return 'Water Well';
    }

    if (c === 'power') {
        if (tags.power === 'substation') return tags.voltage ? `Substation ${tags.voltage}` : 'Power Substation';
        if (tags.power === 'generator') return tags.generator_source ? `${tags.generator_source} Generator` : 'Power Generator';
        if (tags.power === 'plant') return 'Power Plant';
    }

    if (c === 'road') {
        const roadType = tags.highway || 'Road';
        return `Unnamed ${roadType.charAt(0).toUpperCase() + roadType.slice(1)}`;
    }

    const label = CATEGORY_LABELS[c] || c;
    return `${label}`;
}

async function queryOverpass(lat, lon, radiusKm) {
    const radii = [radiusKm, Math.min(radiusKm * 2, 80), Math.min(radiusKm * 3, 120)];

    for (let attempt = 0; attempt < radii.length; attempt++) {
        const rKm = radii[attempt];
        const radiusM = Math.round(rKm * 1000);
        const query = buildOverpassQuery(lat, lon, radiusM);
        const encoded = encodeURIComponent(query);
        const url = `https://overpass-api.de/api/interpreter?data=${encoded}`;

        try {
            const data = await fetchJson(url, {
                headers: { 'User-Agent': OVERPASS_UA }
            });
            const elements = data?.elements ?? [];
            const count = elements.length;
            console.log(`[Overpass] Attempt ${attempt + 1}: ${rKm.toFixed(0)}km radius → ${count} elements`);
            if (count >= 3) return elements;
        } catch (e) {
            console.warn(`[Overpass] Attempt ${attempt + 1} failed: ${e.message}`);
        }
    }

    console.log(`[Overpass] All attempts exhausted for ${lat},${lon} — no infrastructure found within max radius`);
    return [];
}

function matchInfraType(tags) {
    for (const cfg of OSM_INFRA_TYPES) {
        const [key, val] = cfg.tag.split('=');
        if (tags[key] === val) return cfg;
    }
    return null;
}

function calcEdgePhysics({ distanceKm, spreadRadiusKm, baseIntensity, windAlignFactor, frpMw, windSpeedKmh }) {
    const distRatio = distanceKm / spreadRadiusKm;
    const distFactor = Math.max(0.05, 1 - (distRatio * distRatio));

    const rawProb = baseIntensity * distFactor * windAlignFactor;
    const prob = Math.max(0.08, Math.min(0.97, rawProb));

    const spreadSpeedKmh = fireSpreadSpeed(windSpeedKmh, frpMw);
    const delayHrs = Math.max(0.5, distanceKm / spreadSpeedKmh);

    return { prob, delayHrs, spreadSpeedKmh };
}

function buildMechanism(infraName, distanceKm, bearingToNode, windDirectionDeg, spreadSpeedKmh, frpMw, windSpeedKmh) {
    const angleDiff = Math.round(Math.abs(((bearingToNode - windDirectionDeg) + 540) % 360 - 180));
    const etaMin = Math.round((distanceKm / spreadSpeedKmh) * 60);
    return (
        `FRP ${frpMw.toFixed(0)}MW fire spreads at ${spreadSpeedKmh.toFixed(0)}km/h; ` +
        `${infraName} is ${distanceKm.toFixed(1)}km away (${bearingToNode.toFixed(0)}°, ` +
        `${angleDiff}° off wind axis ${windDirectionDeg}°, wind ${windSpeedKmh.toFixed(0)}km/h); ` +
        `estimated arrival ~${etaMin}min`
    );
}

function buildSecondaryEdges(primaryNodes, hazardId) {
    const secondary = [];
    const powerNodes = primaryNodes.filter(n => n.category === 'power');
    const hospitalNodes = primaryNodes.filter(n => n.category === 'hospital');

    powerNodes.forEach((pn) => {
        const commsId = `synth_comms_failure_${safeId(pn.nodeId)}`;
        secondary.push({
            nodeId: commsId,
            name: `Communications Failure (${pn.shortName})`,
            neoLabel: 'Failure',
            category: 'comms',
            fromId: pn.nodeId,
            relType: 'TRIGGERS',
            prob: Math.max(0.3, pn.prob * 0.85),
            delayHrs: pn.delayHrs + 0.5,
            mechanism: `Power loss at ${pn.name} cascades to cell tower and emergency comms outage`,
        });

        hospitalNodes.forEach((hn) => {
            secondary.push({
                nodeId: hn.nodeId,
                name: hn.name,
                neoLabel: hn.neoLabel,
                category: hn.category,
                fromId: commsId,
                relType: 'WORSENED_BY',
                prob: Math.max(0.25, hn.prob * 0.7),
                delayHrs: pn.delayHrs + 2.0,
                mechanism: `${hn.name} loses backup communications; coordination with emergency services severed`,
                isCrossEdge: true,
            });
        });
    });

    return secondary;
}

const SYNTHETIC_TEMPLATES = [
    { nameSuffix: 'General Hospital', neoLabel: 'Resource', relType: 'THREATENS', category: 'hospital', icon: '🏥' },
    { nameSuffix: 'Primary School', neoLabel: 'Infrastructure', relType: 'THREATENS', category: 'school', icon: '🏫' },
    { nameSuffix: 'Fuel Station', neoLabel: 'Infrastructure', relType: 'DESTROYS', category: 'fuel', icon: '⛽' },
    { nameSuffix: 'Central Market', neoLabel: 'Infrastructure', relType: 'DESTROYS', category: 'market', icon: '🏪' },
    { nameSuffix: 'District Road N1', neoLabel: 'Infrastructure', relType: 'BLOCKS', category: 'road', icon: '🛣' },
    { nameSuffix: 'Town Council', neoLabel: 'Infrastructure', relType: 'THREATENS', category: 'government', icon: '🏛' },
    { nameSuffix: 'Community Church', neoLabel: 'Infrastructure', relType: 'THREATENS', category: 'worship', icon: '⛪' },
    { nameSuffix: 'Bus Terminal', neoLabel: 'Infrastructure', relType: 'BLOCKS', category: 'transport', icon: '🚌' },
    { nameSuffix: 'Water Treatment Plant', neoLabel: 'Infrastructure', relType: 'DESTROYS', category: 'water', icon: '💧' },
    { nameSuffix: 'Police Station', neoLabel: 'Resource', relType: 'OVERWHELMS', category: 'police', icon: '🚔' },
];

function generateSyntheticInfrastructure(lat, lon, placePrefix, spreadRadiusKm, frpMw, windSpeedKmh, windDirectionDeg, baseIntensity, existingNodes) {
    const existingCategories = new Set(existingNodes.map(n => n.category));
    const synthetic = [];
    const synthId = Math.floor(Math.abs(lon * 10000));

    for (let i = 0; i < SYNTHETIC_TEMPLATES.length && synthetic.length < 6; i++) {
        const tmpl = SYNTHETIC_TEMPLATES[i];
        if (existingCategories.has(tmpl.category)) continue;

        const distanceKm = 2 + (i * 3.5) + (Math.sin(i * 2.7) * 2);
        if (distanceKm > spreadRadiusKm) continue;

        const bearingToNode = (windDirectionDeg + 30 + (i * 50) + Math.round(Math.sin(i) * 20) + 360) % 360;
        const windAlignFactor = windAlignmentFactor(bearingToNode, windDirectionDeg);
        const { prob, delayHrs, spreadSpeedKmh } = calcEdgePhysics({
            distanceKm,
            spreadRadiusKm,
            baseIntensity,
            windAlignFactor,
            frpMw,
            windSpeedKmh,
        });
        const adjustedProb = Math.max(prob, 0.38);
        if (adjustedProb < 0.35) continue;

        const bearingLabel = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(bearingToNode / 45) % 8];
        const nodeId = `synth_${tmpl.category}_${synthId}_${i}`;
        const name = `${placePrefix} ${tmpl.nameSuffix}`;
        const mechanism = `FRP ${frpMw.toFixed(0)}MW fire spreads at ${spreadSpeedKmh.toFixed(0)}km/h; ${name} is ${distanceKm.toFixed(1)}km ${bearingLabel} (${bearingToNode.toFixed(0)}° from fire, ${Math.round(Math.abs(((bearingToNode - windDirectionDeg) + 540) % 360 - 180))}° off wind axis ${windDirectionDeg}°); estimated arrival ~${Math.round((distanceKm / spreadSpeedKmh) * 60)}min`;

        synthetic.push({
            nodeId,
            osmId: `synth_${i}`,
            name,
            shortName: name.length > 20 ? name.slice(0, 19) + '…' : name,
            neoLabel: tmpl.neoLabel,
            relType: tmpl.relType,
            category: tmpl.category,
            distanceKm,
            bearingToNode,
            windAlignFactor,
            prob: adjustedProb,
            delayHrs,
            mechanism,
            lat: lat + (distanceKm / 111) * Math.cos(bearingToNode * Math.PI / 180),
            lon: lon + (distanceKm / (111 * Math.cos(lat * Math.PI / 180))) * Math.sin(bearingToNode * Math.PI / 180),
            synthesised: true,
        });
    }

    return synthetic;
}

async function synthesiseCascadeForFire(fire, runQuery) {
    const { lat, lon, frp_mw: frpMw, id: fireId, name: fireName, region } = fire;

    console.log(`[Synthesizer] Starting cascade synthesis for ${fireName} (FRP: ${frpMw}MW)`);

    const { severityScore, spreadRadiusKm, baseIntensity } = characteriseFire(frpMw);

    console.log('[Synthesizer] Fetching wind data from Open-Meteo...');
    console.log('[Synthesizer] Fetching location name from Nominatim...');
    const [windData, placeName, osmElements] = await Promise.all([
        fetchWind(lat, lon),
        fetchPlaceName(lat, lon),
        queryOverpass(lat, lon, spreadRadiusKm),
    ]);
    const { windSpeedKmh, windDirectionDeg } = windData;
    console.log(`[Synthesizer] Wind: ${windSpeedKmh.toFixed(1)}km/h from ${windDirectionDeg}°`);
    console.log(`[Synthesizer] Location: ${placeName || region}`);
    console.log(`[Synthesizer] Querying Overpass for infrastructure within ${spreadRadiusKm.toFixed(0)}km...`);
    console.log(`[Synthesizer] Found ${osmElements.length} OSM elements`);

    const scored = [];
    const seenNames = new Set();

    for (const el of osmElements) {
        const tags = el.tags || {};
        const elLat = el.lat ?? el.center?.lat;
        const elLon = el.lon ?? el.center?.lon;
        if (!elLat || !elLon) continue;

        const cfg = matchInfraType(tags);
        if (!cfg) continue;

        const elName = resolveOsmName(tags, cfg, el);
        const dedupeKey = `${cfg.category}:${elName.slice(0, 30).toLowerCase()}`;
        if (seenNames.has(dedupeKey)) continue;
        seenNames.add(dedupeKey);

        const distanceKm = haversineKm(lat, lon, elLat, elLon);
        if (distanceKm > spreadRadiusKm) continue;

        const bearingToNode = bearingDeg(lat, lon, elLat, elLon);
        const windAlignFactor = windAlignmentFactor(bearingToNode, windDirectionDeg);

        const { prob, delayHrs, spreadSpeedKmh } = calcEdgePhysics({
            distanceKm,
            spreadRadiusKm,
            baseIntensity,
            windAlignFactor,
            frpMw,
            windSpeedKmh,
        });

        if (prob < 0.08) continue;

        const mechanism = buildMechanism(
            elName, distanceKm, bearingToNode,
            windDirectionDeg, spreadSpeedKmh, frpMw, windSpeedKmh,
        );

        scored.push({
            nodeId: `osm_${cfg.category}_${safeId(el.id)}`,
            osmId: el.id,
            name: elName,
            shortName: elName.length > 20 ? elName.slice(0, 19) + '…' : elName,
            neoLabel: cfg.neoLabel,
            relType: cfg.relType,
            category: cfg.category,
            distanceKm,
            bearingToNode,
            windAlignFactor,
            prob,
            delayHrs,
            mechanism,
            lat: elLat,
            lon: elLon,
        });
    }

    const seen = {};
    let topNodes = scored
        .sort((a, b) => b.prob - a.prob)
        .filter((n) => {
            const count = seen[n.category] || 0;
            if (count >= 3) return false;
            seen[n.category] = count + 1;
            return true;
        })
        .slice(0, 12);

    // No synthetic fallback — use only real OSM data
    if (topNodes.length === 0) {
        console.warn(`[Synthesizer] No real OSM infrastructure found within ${spreadRadiusKm.toFixed(0)}km`);
    }

    console.log(`[Synthesizer] Selected ${topNodes.length} infrastructure nodes after scoring`);

    const secondaryEdges = buildSecondaryEdges(topNodes, fireId);

    const resolvedPlaceName = placeName || region;

    console.log('[Synthesizer] Seeding synthesised cascade into Neo4j...');

    try {
        await runQuery(`
      MATCH (h:Hazard {id: $fireId})
      SET h.wind_speed_kmh = $ws,
          h.wind_direction_deg = $wd,
          h.spread_radius_km = $radius,
          h.cascade_synthesised = true,
          h.synthesis_timestamp = $now,
          h.place_name = $placeName
    `, {
            fireId,
            ws: windSpeedKmh,
            wd: windDirectionDeg,
            radius: spreadRadiusKm,
            placeName: resolvedPlaceName,
            now: new Date().toISOString(),
        });
    } catch (e) {
        console.warn('[Synthesizer] Could not update hazard wind data:', e.message);
    }

    const seededNodes = [];
    const seededEdges = [];

    for (const node of topNodes) {
        try {
            await runQuery(`
        MERGE (n {id: $nodeId})
        SET n:${node.neoLabel},
            n.name = $name,
            n.osm_id = $osmId,
            n.lat = $lat,
            n.lon = $lon,
            n.distance_km = $dist,
            n.bearing_deg = $bearing,
            n.wind_alignment = $windAlign,
            n.source = 'OpenStreetMap',
            n.synthesised = true
        WITH n
        MATCH (h:Hazard {id: $fireId})
        MERGE (sc:Scenario {id: 'live_wildfires_satellite'})
        MERGE (sc)-[:CONTAINS]->(n)
        MERGE (h)-[r:${node.relType}]->(n)
        SET r.prob = $prob,
            r.delay_hrs = $delayHrs,
            r.mechanism = $mechanism,
            r.synthesised = true
      `, {
                nodeId: node.nodeId,
                name: node.name,
                osmId: String(node.osmId),
                lat: node.lat,
                lon: node.lon,
                dist: node.distanceKm,
                bearing: node.bearingToNode,
                windAlign: node.windAlignFactor,
                fireId,
                prob: node.prob,
                delayHrs: node.delayHrs,
                mechanism: node.mechanism,
            });

            seededNodes.push({ id: node.nodeId, name: node.name, label: node.neoLabel, severity: Math.round(node.prob * 10) });
            seededEdges.push({ from: fireId, to: node.nodeId, type: node.relType, prob: node.prob, delay_hrs: node.delayHrs, mechanism: node.mechanism });
        } catch (e) {
            console.warn(`[Synthesizer] Could not seed node ${node.nodeId}:`, e.message);
        }
    }

    const seededSecondaryNodeIds = new Set();

    for (const sec of secondaryEdges) {
        if (sec.isCrossEdge) {
            try {
                await runQuery(`
          MATCH (a {id: $fromId}), (b {id: $toId})
          MERGE (a)-[r:${sec.relType}]->(b)
          SET r.prob = $prob,
              r.delay_hrs = $delayHrs,
              r.mechanism = $mechanism,
              r.synthesised = true
        `, {
                    fromId: sec.fromId,
                    toId: sec.nodeId,
                    prob: sec.prob,
                    delayHrs: sec.delayHrs,
                    mechanism: sec.mechanism,
                });
                seededEdges.push({ from: sec.fromId, to: sec.nodeId, type: sec.relType, prob: sec.prob, delay_hrs: sec.delayHrs, mechanism: sec.mechanism });
            } catch (e) {
                console.warn('[Synthesizer] Cross-edge seed failed:', e.message);
            }
            continue;
        }

        if (seededSecondaryNodeIds.has(sec.nodeId)) continue;

        try {
            await runQuery(`
        MERGE (n {id: $nodeId})
        SET n:Failure,
            n.name = $name,
            n.synthesised = true
        WITH n
        MERGE (sc:Scenario {id: 'live_wildfires_satellite'})
        MERGE (sc)-[:CONTAINS]->(n)
        WITH n
        MATCH (from {id: $fromId})
        MERGE (from)-[r:${sec.relType}]->(n)
        SET r.prob = $prob,
            r.delay_hrs = $delayHrs,
            r.mechanism = $mechanism,
            r.synthesised = true
      `, {
                nodeId: sec.nodeId,
                name: sec.name,
                fromId: sec.fromId,
                prob: sec.prob,
                delayHrs: sec.delayHrs,
                mechanism: sec.mechanism,
            });

            seededSecondaryNodeIds.add(sec.nodeId);
            seededNodes.push({ id: sec.nodeId, name: sec.name, label: 'Failure', severity: Math.round(sec.prob * 8) });
            seededEdges.push({ from: sec.fromId, to: sec.nodeId, type: sec.relType, prob: sec.prob, delay_hrs: sec.delayHrs, mechanism: sec.mechanism });
        } catch (e) {
            console.warn('[Synthesizer] Secondary node seed failed:', e.message);
        }
    }

    console.log(`[Synthesizer] Seeded ${seededNodes.length} nodes, ${seededEdges.length} edges`);

    const paths = buildSyntheticPaths(fireId, fireName, topNodes, secondaryEdges, seededNodes);

    const avgProb = topNodes.length > 0 ?
        topNodes.reduce((s, n) => s + n.prob, 0) / topNodes.length :
        0;
    const densityFactor = Math.min(1, topNodes.length / 5);
    const riskScore = Math.min(100, Math.round(avgProb * 100 * (0.6 + 0.4 * densityFactor) * (severityScore / 10 + 0.3)));

    const displayName = `Live Fire · ${resolvedPlaceName}`;

    return {
        success: true,
        fireId,
        fireName,
        placeName: resolvedPlaceName,
        wind: { speedKmh: windSpeedKmh, directionDeg: windDirectionDeg },
        spreadRadiusKm,
        infrastructureFound: topNodes.length,
        nodesSeeded: seededNodes.length,
        edgesSeeded: seededEdges.length,
        riskScore,
        nodes: [
            { id: fireId, name: displayName, label: 'Hazard', severity: Math.round(severityScore) },
            ...seededNodes,
        ],
        edges: seededEdges,
        paths,
        compassData: topNodes.map(n => ({
            name: n.shortName,
            bearing: n.bearingToNode,
            distanceKm: n.distanceKm,
            prob: n.prob,
            category: n.category,
            label: n.neoLabel,
        })),
    };
}

function buildSyntheticPaths(fireId, fireName, topNodes, secondaryEdges, allNodes) {
    const paths = [];
    const hazardNode = { id: fireId, name: fireName, label: 'Hazard', severity: 9 };

    for (const node of topNodes.slice(0, 8)) {
        const infraNode = { id: node.nodeId, name: node.name, label: node.neoLabel, severity: Math.round(node.prob * 10) };
        paths.push({
            nodes: [hazardNode, infraNode],
            edges: [{
                from: fireId,
                to: node.nodeId,
                type: node.relType,
                prob: node.prob,
                delay_hrs: node.delayHrs,
                mechanism: node.mechanism,
            }],
            depth: 1,
            probability_pct: Math.round(node.prob * 1000) / 10,
            hours_to_end: node.delayHrs,
        });

        const secEdge = secondaryEdges.find(s => s.fromId === node.nodeId && !s.isCrossEdge);
        if (secEdge) {
            const secNode = { id: secEdge.nodeId, name: secEdge.name, label: 'Failure', severity: Math.round(secEdge.prob * 8) };
            const combinedProb = node.prob * secEdge.prob;
            paths.push({
                nodes: [hazardNode, infraNode, secNode],
                edges: [
                    { from: fireId, to: node.nodeId, type: node.relType, prob: node.prob, delay_hrs: node.delayHrs, mechanism: node.mechanism },
                    { from: node.nodeId, to: secEdge.nodeId, type: secEdge.relType, prob: secEdge.prob, delay_hrs: secEdge.delayHrs, mechanism: secEdge.mechanism },
                ],
                depth: 2,
                probability_pct: Math.round(combinedProb * 1000) / 10,
                hours_to_end: node.delayHrs + secEdge.delayHrs,
            });
        }
    }

    return paths.sort((a, b) => b.probability_pct - a.probability_pct).slice(0, 12);
}

module.exports = { synthesiseCascadeForFire, fetchWind, fetchPlaceName };