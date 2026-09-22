// backend/loraSimulation.js
// Simulation de dispositifs LoRa se deplacant en temps reel autour d'un centre.

const RAYON_TERRE_M = 6371000; // rayon moyen de la Terre, en metres

// ------------------------------------------------------------------
// Deplace un point GPS (lat, lng) d'une certaine distance (m) selon un cap (radians)
//
// D'ou ca vient :
// Sur un cercle de rayon R, un arc de longueur s correspond a un angle
// theta (en radians) tel que : s = R * theta  =>  theta = s / R
//
// On projette ce deplacement sur les axes lat/lng :
//   - composante nord-sud (latitude)  -> dtheta_lat = (s * cos(cap)) / R
//   - composante est-ouest (longitude) -> dtheta_lng = (s * sin(cap)) / R
//
// Pour la longitude on divise EN PLUS par cos(latitude), car les meridiens
// se rapprochent en allant vers les poles : a une latitude donnee, un meme
// angle de longitude represente une distance reelle plus petite que a
// l'equateur (distance reelle = R * cos(lat) * dtheta_lng).
//
// On convertit enfin les radians en degres (* 180/pi) car lat/lng sont en degres.
// ------------------------------------------------------------------
function deplacerPoint(lat, lng, distanceM, capRad) {
    const dLatRad = (distanceM * Math.cos(capRad)) / RAYON_TERRE_M;
    const dLngRad = (distanceM * Math.sin(capRad)) / (RAYON_TERRE_M * Math.cos(lat * Math.PI / 180));

    return {
        lat: lat + dLatRad * (180 / Math.PI),
        lng: lng + dLngRad * (180 / Math.PI)
    };
}

// Distance entre deux points GPS - formule de Haversine
// (plus precise que le plan tangent ci-dessus sur de grandes distances,
// on l'utilise ici juste pour comparer les distances device <-> pylones)
function distanceHaversine(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return RAYON_TERRE_M * c;
}

function trouverPyloneProche(lat, lng, pylones) {
    let proche = null;
    let distMin = Infinity;
    for (const p of pylones) {
        if (p.lat == null || p.lon == null) continue;
        const d = distanceHaversine(lat, lng, parseFloat(p.lat), parseFloat(p.lon));
        if (d < distMin) {
            distMin = d;
            proche = p;
        }
    }
    return proche ? { pylone: proche, distance: distMin } : null;
}

class SimulationLora {
    constructor(nombreDispositifs = 8, centre = { lat: -18.8792, lng: 47.5079 }, rayonInitialM = 15000) {
        this.pylones = [];
        this.dispositifs = [];

        for (let i = 0; i < nombreDispositifs; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const rayon = Math.random() * rayonInitialM;
            const pos = deplacerPoint(centre.lat, centre.lng, rayon, angle);

            this.dispositifs.push({
                id: `lora-${i + 1}`,
                lat: pos.lat,
                lng: pos.lng,
                cap: Math.random() * 2 * Math.PI,  // direction actuelle, en radians
                vitesse: 1 + Math.random() * 4,     // m/s (~3.6 a 18 km/h : pieton/velo/moto lente)
                batterie: 100
            });
        }
    }

    setPylones(pylones) {
        this.pylones = pylones;
    }

    // Un pas de simulation : fait avancer chaque dispositif d'un cran
    tick(intervalleS = 2) {
        for (const d of this.dispositifs) {
            // Marche aleatoire "correlee" : le cap derive legerement a chaque tick
            // au lieu d'etre totalement aleatoire -> trajectoire plus realiste
            // (pas de zigzags impossibles).
            d.cap += (Math.random() - 0.5) * 0.6;

            const distanceParcourue = d.vitesse * intervalleS; // d = v * t
            const nouvellePos = deplacerPoint(d.lat, d.lng, distanceParcourue, d.cap);
            d.lat = nouvellePos.lat;
            d.lng = nouvellePos.lng;

            d.batterie = Math.max(0, d.batterie - 0.02);
        }
        return this.etat();
    }

    etat() {
        return this.dispositifs.map((d) => {
            const proche = trouverPyloneProche(d.lat, d.lng, this.pylones);
            return {
                id: d.id,
                lat: d.lat,
                lng: d.lng,
                batterie: Math.round(d.batterie * 10) / 10,
                pylone_proche: proche ? {
                    code_site: proche.pylone.code_site,
                    nom: proche.pylone.nom,
                    lat: parseFloat(proche.pylone.lat),
                    lng: parseFloat(proche.pylone.lon),
                    distance_m: Math.round(proche.distance)
                } : null
            };
        });
    }
}

export default SimulationLora;
