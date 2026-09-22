// backend/server.js
import express from 'express';
import cors from 'cors';
import neo4j from 'neo4j-driver';
import 'dotenv/config';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import SimulationLora from './loraSimulation.js';

const app = express();
app.use(cors());

console.log('   Configuration Neo4j :');
console.log('   URI      =', process.env.NEO4J_URI);
console.log('   USER     =', process.env.NEO4J_USER);
console.log('   DATABASE =', process.env.NEO4J_DATABASE);
console.log('   PORT     =', process.env.PORT);

// ============================================================
// CONNEXION NEO4J
// ============================================================
const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

driver.verifyConnectivity()
    .then(() => console.log('Connexion Neo4j OK'))
    .catch((err) => console.error('Erreur Neo4j :', err.message));

// ============================================================
// FONCTIONS UTILITAIRES
// ============================================================

async function query(cypher, params = {}) {
    const session = driver.session({
        database: process.env.NEO4J_DATABASE || 'neo4j'
    });
    try {
        const result = await session.run(cypher, params);
        return result.records;
    } finally {
        await session.close();
    }
}

// Convertit les entiers Neo4j en JS natif
function toNative(record) {
    const out = {};
    record.keys.forEach((key) => {
        const value = record.get(key);
        out[key] = neo4j.isInt(value) ? value.toNumber() : value;
    });
    return out;
}

// ============================================================
// ROUTES
// ============================================================

// Route racine : liste des endpoints
app.get('/', (req, res) => {
    res.json({
        message: 'API Connecteo operationnelle',
        endpoints: {
            pylones: '/api/pylones',
            pyloneParCode: '/api/pylones/:codeSite',
            pylonesBbox: '/api/pylones/bbox?minLat=...&minLng=...&maxLat=...&maxLng=...'
        }
    });
});

// Route : tous les pylones
app.get('/api/pylones', async (req, res) => {
    try {
        console.log('Requete /api/pylones');
        const records = await query(`
            MATCH (p:Pylone)
            WHERE p.lat IS NOT NULL AND p.lon IS NOT NULL
            RETURN
                p.nom             AS nom,
                p.code_site       AS code_site,
                p.type_site       AS type_site,
                p.lat             AS lat,
                p.lon             AS lon,
                p.hauteur_m       AS hauteur_m,
                p.nom_commune     AS nom_commune,
                p.nom_district    AS nom_district,
                p.nom_region      AS nom_region,
                p.milieu          AS milieu,
                p.proprietaire    AS proprietaire,
                p.source_energie  AS source_energie,
                p.tech_2g         AS tech_2g,
                p.tech_3g         AS tech_3g,
                p.tech_4g         AS tech_4g,
                p.tech_5g         AS tech_5g
            LIMIT 5000
        `);
        console.log(`   ${records.length} pylones envoyes`);
        res.json(records.map(toNative));
    } catch (err) {
        console.error('Erreur /api/pylones :', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Route : un pylone par code_site
app.get('/api/pylones/:codeSite', async (req, res) => {
    try {
        const records = await query(
            `MATCH (p:Pylone {code_site: $codeSite})
             RETURN
                p.nom          AS nom,
                p.code_site    AS code_site,
                p.type_site    AS type_site,
                p.lat          AS lat,
                p.lon          AS lon,
                p.proprietaire AS proprietaire
             LIMIT 1`,
            { codeSite: req.params.codeSite }
        );
        if (records.length === 0) {
            return res.status(404).json({ error: 'Pylone non trouve' });
        }
        res.json(toNative(records[0]));
    } catch (err) {
        console.error('Erreur /api/pylones/:codeSite :', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Route : pylones dans une bounding box (utile si beaucoup de points)
app.get('/api/pylones/bbox', async (req, res) => {
    try {
        const { minLat, minLng, maxLat, maxLng } = req.query;
        const records = await query(
            `MATCH (p:Pylone)
             WHERE p.lat IS NOT NULL AND p.lon IS NOT NULL
               AND p.lat >= $minLat AND p.lat <= $maxLat
               AND p.lon >= $minLng AND p.lon <= $maxLng
             RETURN
                p.nom          AS nom,
                p.code_site    AS code_site,
                p.type_site    AS type_site,
                p.lat          AS lat,
                p.lon          AS lon,
                p.proprietaire AS proprietaire
             LIMIT 1000`,
            {
                minLat: parseFloat(minLat),
                minLng: parseFloat(minLng),
                maxLat: parseFloat(maxLat),
                maxLng: parseFloat(maxLng)
            }
        );
        res.json(records.map(toNative));
    } catch (err) {
        console.error('Erreur /api/pylones/bbox :', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// SIMULATION LORA (temps reel via WebSocket)
// ============================================================

// Recupere la liste des pylones depuis Neo4j (reutilise pour que les
// devices LoRa puissent calculer leur pylone le plus proche)
async function chargerPylones() {
    try {
        const records = await query(`
            MATCH (p:Pylone)
            WHERE p.lat IS NOT NULL AND p.lon IS NOT NULL
            RETURN p.nom AS nom, p.code_site AS code_site, p.lat AS lat, p.lon AS lon
        `);
        return records.map(toNative);
    } catch (err) {
        console.error('Erreur chargement pylones pour simulation :', err.message);
        return [];
    }
}

const NB_DISPOSITIFS_LORA = 20;
const INTERVALLE_TICK_S = 2; // duree simulee entre deux positions (en secondes)

const simulation = new SimulationLora(NB_DISPOSITIFS_LORA);

// httpServer commun a Express (routes REST) et au WebSocket (flux temps reel)
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

function diffuserEtat(etat) {
    const message = JSON.stringify({ type: 'lora_update', dispositifs: etat });
    wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
            client.send(message);
        }
    });
}

wss.on('connection', (ws) => {
    console.log('Client WebSocket connecte (', wss.clients.size, 'client(s) )');
    // Envoie l'etat courant immediatement a ce nouveau client
    ws.send(JSON.stringify({ type: 'lora_update', dispositifs: simulation.etat() }));

    ws.on('close', () => {
        console.log('Client WebSocket deconnecte (', wss.clients.size, 'restant(s) )');
    });
});

// ============================================================
// DeMARRAGE
// ============================================================
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, async () => {
    console.log(`🚀 API demarree sur http://localhost:${PORT}`);
    console.log(`   Test : http://localhost:${PORT}/api/pylones`);
    console.log(`   WebSocket LoRa : ws://localhost:${PORT}`);

    const pylones = await chargerPylones();
    simulation.setPylones(pylones);
    console.log(`   ${pylones.length} pylones charges pour la simulation LoRa`);

    // Boucle de simulation : avance les positions et diffuse a tous les clients
    setInterval(() => {
        const etat = simulation.tick(INTERVALLE_TICK_S);
        diffuserEtat(etat);
    }, INTERVALLE_TICK_S * 1000);
});