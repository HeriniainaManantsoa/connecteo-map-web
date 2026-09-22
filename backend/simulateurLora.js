// backend/simulateurLora.js
//
// Script INDEPENDANT du serveur API. A lancer a part, dans un terminal separe :
//     node simulateurLora.js
//
// Role : cree les noeuds :Lora dans Neo4j s'ils n'existent pas encore, puis
// les deplace en continu (marche aleatoire) et ecrit leur nouvelle position
// dans la base a chaque tick. Ne fait AUCUN WebSocket, AUCUN Express -
// juste de l'ecriture Neo4j en boucle.

import neo4j from 'neo4j-driver';
import 'dotenv/config';
import { deplacerPoint, ZONES_COTIERES } from './geoUtils.js';

const NB_DISPOSITIFS = 8;
const INTERVALLE_TICK_S = 2; // duree simulee (et reelle) entre deux positions

const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

async function query(cypher, params = {}) {
    const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
    try {
        const result = await session.run(cypher, params);
        return result.records;
    } finally {
        await session.close();
    }
}

// Cree les dispositifs manquants (MERGE = ne duplique jamais un id existant).
// ON CREATE : valeurs initiales generees uniquement si le noeud n'existait pas.
// Repartis sur les zones cotieres pour ne pas se masser au centre du pays.
async function assurerDispositifs() {
    for (let i = 0; i < NB_DISPOSITIFS; i++) {
        const id = `lora-${i + 1}`;
        const zone = ZONES_COTIERES[i % ZONES_COTIERES.length];
        const angle = Math.random() * 2 * Math.PI;
        const rayon = Math.random() * 25000; // dispersion locale : 25 km autour de la zone
        const pos = deplacerPoint(zone.lat, zone.lng, rayon, angle);

        await query(
            `MERGE (l:Lora {id: $id})
             ON CREATE SET
                l.lat = $lat,
                l.lon = $lon,
                l.cap = $cap,
                l.vitesse = $vitesse,
                l.batterie = 100.0`,
            {
                id,
                lat: pos.lat,
                lon: pos.lng,
                cap: Math.random() * 2 * Math.PI,
                vitesse: 1 + Math.random() * 4 // m/s
            }
        );
    }
}

// Charge l'etat courant de tous les dispositifs depuis Neo4j (utile si le
// script redemarre : on reprend le mouvement la ou il s'etait arrete,
// au lieu de regenerer des positions aleatoires a chaque lancement).
async function chargerDispositifs() {
    const records = await query(`
        MATCH (l:Lora)
        RETURN l.id AS id, l.lat AS lat, l.lon AS lon,
               l.cap AS cap, l.vitesse AS vitesse, l.batterie AS batterie
    `);
    return records.map((r) => ({
        id: r.get('id'),
        lat: r.get('lat'),
        lng: r.get('lon'),
        cap: r.get('cap'),
        vitesse: r.get('vitesse'),
        batterie: r.get('batterie')
    }));
}

// Ecrit en une seule requete (UNWIND) la nouvelle position de tous les
// dispositifs -> plus efficace que N requetes separees a chaque tick.
async function ecrireDispositifs(dispositifs) {
    await query(
        `UNWIND $dispositifs AS d
         MATCH (l:Lora {id: d.id})
         SET l.lat = d.lat, l.lon = d.lng, l.cap = d.cap,
             l.batterie = d.batterie, l.derniere_maj = timestamp()`,
        { dispositifs }
    );
}

function avancer(dispositifs, intervalleS) {
    for (const d of dispositifs) {
        // Marche aleatoire "correlee" : le cap derive legerement a chaque tick
        // au lieu d'etre totalement aleatoire -> trajectoire plus realiste.
        d.cap += (Math.random() - 0.5) * 0.6;

        const distanceParcourue = d.vitesse * intervalleS; // d = v * t
        const nouvellePos = deplacerPoint(d.lat, d.lng, distanceParcourue, d.cap);
        d.lat = nouvellePos.lat;
        d.lng = nouvellePos.lng;

        d.batterie = Math.max(0, d.batterie - 0.02);
    }
    return dispositifs;
}

async function main() {
    await driver.verifyConnectivity();
    console.log('Simulateur LoRa : connexion Neo4j OK');

    await assurerDispositifs();
    let dispositifs = await chargerDispositifs();
    console.log(`Simulateur LoRa : ${dispositifs.length} dispositifs en mouvement`);

    setInterval(async () => {
        dispositifs = avancer(dispositifs, INTERVALLE_TICK_S);
        try {
            await ecrireDispositifs(dispositifs);
        } catch (err) {
            console.error('Erreur ecriture Neo4j :', err.message);
        }
    }, INTERVALLE_TICK_S * 1000);
}

main().catch((err) => {
    console.error('Erreur simulateur LoRa :', err.message);
    process.exit(1);
});
