// backend/geoUtils.js
// Fonctions geometriques partagees entre le simulateur (ecrit dans Neo4j)
// et le serveur (lit Neo4j et diffuse aux clients).

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
// ------------------------------------------------------------------
export function deplacerPoint(lat, lng, distanceM, capRad) {
    const dLatRad = (distanceM * Math.cos(capRad)) / RAYON_TERRE_M;
    const dLngRad = (distanceM * Math.sin(capRad)) / (RAYON_TERRE_M * Math.cos(lat * Math.PI / 180));

    return {
        lat: lat + dLatRad * (180 / Math.PI),
        lng: lng + dLngRad * (180 / Math.PI)
    };
}

// Distance entre deux points GPS - formule de Haversine
export function distanceHaversine(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return RAYON_TERRE_M * c;
}

export function trouverPyloneProche(lat, lng, pylones) {
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

// Points d'ancrage repartis sur le littoral de Madagascar, pour que les
// dispositifs LoRa initiaux se dispersent sur les cotes plutot que de se
// masser au centre du pays.
export const ZONES_COTIERES = [
    { lat: -18.1499, lng: 49.4023, nom: 'Toamasina (est)' },
    { lat: -15.7167, lng: 46.3167, nom: 'Mahajanga (ouest)' },
    { lat: -23.3568, lng: 43.6667, nom: 'Toliara (sud-ouest)' },
    { lat: -12.2795, lng: 49.2913, nom: 'Antsiranana (nord)' },
    { lat: -21.4500, lng: 47.6167, nom: 'Manakara (sud-est)' },
    { lat: -14.8833, lng: 47.7667, nom: 'Antsohihy (nord-ouest)' },
    { lat: -25.0333, lng: 46.9833, nom: 'Tolagnaro (sud)' },
    { lat: -17.6833, lng: 49.4167, nom: 'Maroantsetra (nord-est)' }
];
