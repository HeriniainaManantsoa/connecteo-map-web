import { useState, useEffect } from 'react';
import {
    APIProvider, Map, AdvancedMarker, Pin, Polyline, InfoWindow, useMap
} from '@vis.gl/react-google-maps';
import './Carte.css';

const CENTRE = { lat: -18.8792, lng: 47.5079 };
const API_URL = 'http://localhost:3001/api/pylones';
const WS_URL = 'ws://localhost:3001';

const COULEURS_OPERATEURS = {
    'Yas': '#e74c3c',
    'Orange': '#f39c12',
    'Airtel': '#3498db',
    'Telma': '#e67e22',
    'default': '#7f8c8d'
};

function getCouleurOperateur(proprietaire) {
    if (!proprietaire) return COULEURS_OPERATEURS.default;
    const p = proprietaire.toLowerCase();
    if (p.includes('yas')) return COULEURS_OPERATEURS['Yas'];
    if (p.includes('orange')) return COULEURS_OPERATEURS['Orange'];
    if (p.includes('airtel')) return COULEURS_OPERATEURS['Airtel'];
    if (p.includes('telma')) return COULEURS_OPERATEURS['Telma'];
    return COULEURS_OPERATEURS.default;
}

// BOUTONS DE ZOOM
function ZoomControls() {
    const map = useMap();
    return (
        <div className="zoom-controls">
            <button className="zoom-btn" onClick={() => map.setZoom((map.getZoom() || 6) + 1)}>+</button>
            <button className="zoom-btn" onClick={() => map.setZoom((map.getZoom() || 6) - 1)}>−</button>
        </div>
    );
}

// BULLE D'INFO POUR UN PYLÔNE
function BullePylone({ pylone, onClose }) {
    const couleur = getCouleurOperateur(pylone.proprietaire);

    // Construction des badges techno
    const badges = [];
    if (pylone.tech_2g) badges.push(<span key="2g" className="badge badge-2g">2G</span>);
    if (pylone.tech_3g) badges.push(<span key="3g" className="badge badge-3g">3G</span>);
    if (pylone.tech_4g) badges.push(<span key="4g" className="badge badge-4g">4G</span>);
    if (pylone.tech_5g) badges.push(<span key="5g" className="badge badge-5g">5G</span>);

    return (
        <InfoWindow
            position={{
                lat: parseFloat(pylone.lat),
                lng: parseFloat(pylone.lon)
            }}
            onCloseClick={onClose}
            pixelOffset={[0, -50]}   // Décale la bulle au-dessus de l'icône
        >
            <div className="bulle-pylone">
                <div className="bulle-header" style={{ borderBottomColor: couleur }}>
                    <span className="bulle-icone">📡</span>
                    <h3 style={{ color: couleur }}>{pylone.nom || 'Pylône'}</h3>
                </div>

                <div className="bulle-corps">
                    {pylone.proprietaire && (
                        <div className="bulle-ligne">
                            <strong>Opérateur :</strong> {pylone.proprietaire}
                        </div>
                    )}
                    {pylone.type_site && (
                        <div className="bulle-ligne">
                            <strong>Type :</strong> {pylone.type_site}
                        </div>
                    )}
                    {pylone.nom_commune && (
                        <div className="bulle-ligne">
                            <strong>Commune :</strong> {pylone.nom_commune}
                        </div>
                    )}
                    {pylone.nom_region && (
                        <div className="bulle-ligne">
                            <strong>Région :</strong> {pylone.nom_region}
                        </div>
                    )}
                    {pylone.hauteur_m && (
                        <div className="bulle-ligne">
                            <strong>Hauteur :</strong> {pylone.hauteur_m} m
                        </div>
                    )}
                    {pylone.source_energie && (
                        <div className="bulle-ligne">
                            <strong>Énergie :</strong> {pylone.source_energie}
                        </div>
                    )}

                    {badges.length > 0 && (
                        <div className="bulle-badges">
                            {badges}
                        </div>
                    )}

                    {pylone.lat && pylone.lon && (
                        <div className="bulle-coords">
                            📍 {parseFloat(pylone.lat).toFixed(4)}, {parseFloat(pylone.lon).toFixed(4)}
                        </div>
                    )}
                </div>
            </div>
        </InfoWindow>
    );
}

// MARQUEUR D'UN DISPOSITIF LORA (+ liaison vers son pylône le plus proche)
function MarqueurLora({ dispositif }) {
    return (
        <>
            <AdvancedMarker
                position={{ lat: dispositif.lat, lng: dispositif.lng }}
                title={`${dispositif.id} — batterie ${dispositif.batterie}%`}
            >
                <img
                    src="/lora.png"
                    alt="Dispositif LoRa"
                    style={{
                                    width: '40px',
                                    height: 'auto',
                                    cursor: 'pointer',
                                    filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))',
                                    transition: 'transform 0.15s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                />
            </AdvancedMarker>

            {dispositif.pylone_proche && (
                <Polyline
                    path={[
                        { lat: dispositif.lat, lng: dispositif.lng },
                        { lat: dispositif.pylone_proche.lat, lng: dispositif.pylone_proche.lng }
                    ]}
                    strokeColor="#27ae60"
                    strokeOpacity={0.6}
                    strokeWeight={2}
                    icons={[{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '10px' }]}
                />
            )}
        </>
    );
}

// AFFICHAGE DE LA POLYLIGNE
function ItineraireAffiche({ trace }) {
    const map = useMap();

    useEffect(() => {
        if (!trace || trace.length === 0 || !map) return;
        const bounds = new window.google.maps.LatLngBounds();
        trace.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, { padding: 60 });
    }, [trace, map]);

    if (!trace || trace.length === 0) return null;

    return (
        <Polyline
            path={trace}
            strokeColor="#1a73e8"
            strokeWeight={6}
            strokeOpacity={0.85}
        />
    );
}

// FONCTIONS UTILITAIRES : Nominatim + OSRM
async function geocoder(adresse) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(adresse)}&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
    const data = await res.json();
    if (data.length === 0) throw new Error(`Adresse non trouvée : "${adresse}"`);
    return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        nom: data[0].display_name
    };
}

async function calculerItineraire(depart, arrivee) {
    const url = `https://router.project-osrm.org/route/v1/driving/${depart.lng},${depart.lat};${arrivee.lng},${arrivee.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) throw new Error("Aucun itinéraire trouvé");
    const route = data.routes[0];
    const trace = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    return {
        trace,
        distance: `${(route.distance / 1000).toFixed(1)} km`,
        duree: `${Math.round(route.duration / 60)} min`
    };
}

// PANNEAU ITINÉRAIRE
function PanneauItineraire({ onCalculer, onEffacer, infos, chargement }) {
    const [ouvert, setOuvert] = useState(false);
    const [depart, setDepart] = useState('');
    const [arrivee, setArrivee] = useState('');

    const handleCalculer = (e) => {
        e.preventDefault();
        if (!depart.trim() || !arrivee.trim()) return;
        onCalculer(depart.trim(), arrivee.trim());
    };

    const handleEffacer = () => {
        setDepart('');
        setArrivee('');
        onEffacer();
    };

    return (
        <div className="itineraire-panel">
            {!ouvert && (
                <button className="itineraire-toggle" onClick={() => setOuvert(true)} title="Calculer un itinéraire">
                    🧭
                </button>
            )}

            {ouvert && (
                <div className="itineraire-contenu">
                    <div className="itineraire-header">
                        <h3>🧭 Itinéraire</h3>
                        <button className="itineraire-fermer" onClick={() => setOuvert(false)}>✕</button>
                    </div>

                    <form onSubmit={handleCalculer}>
                        <div className="itineraire-champ">
                            <span className="icone">🟢</span>
                            <input
                                type="text"
                                placeholder="Point de départ"
                                value={depart}
                                onChange={(e) => setDepart(e.target.value)}
                            />
                        </div>

                        <div className="itineraire-champ">
                            <span className="icone">🔴</span>
                            <input
                                type="text"
                                placeholder="Destination"
                                value={arrivee}
                                onChange={(e) => setArrivee(e.target.value)}
                            />
                        </div>

                        <div className="itineraire-actions">
                            <button type="submit" className="btn-calculer" disabled={chargement}>
                                {chargement ? 'Calcul...' : 'Calculer'}
                            </button>
                            <button type="button" className="btn-effacer" onClick={handleEffacer}>Effacer</button>
                        </div>
                    </form>

                    {infos && infos.distance && (
                        <div className="itineraire-infos">
                            <div className="info-ligne"><strong>Distance :</strong> {infos.distance}</div>
                            <div className="info-ligne"><strong>⏱Durée :</strong> {infos.duree}</div>
                        </div>
                    )}

                    {infos && infos.erreur && (
                        <div className="itineraire-erreur">{infos.erreur}</div>
                    )}

                    <div className="itineraire-credit">Itinéraire : OpenStreetMap</div>
                </div>
            )}
        </div>
    );
}

// COMPOSANT PRINCIPAL
function Carte() {
    const [pylones, setPylones] = useState([]);
    const [chargementPylones, setChargementPylones] = useState(true);
    const [pyloneSelectionne, setPyloneSelectionne] = useState(null);
    const [trace, setTrace] = useState(null);
    const [infosItineraire, setInfosItineraire] = useState(null);
    const [chargementItineraire, setChargementItineraire] = useState(false);
    const [dispositifsLora, setDispositifsLora] = useState([]);
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    // Connexion WebSocket : reçoit les positions LoRa mises à jour en temps réel
    useEffect(() => {
        const ws = new WebSocket(WS_URL);

        ws.onopen = () => console.log('WebSocket LoRa connecté');

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'lora_update') {
                setDispositifsLora(message.dispositifs);
            }
        };

        ws.onerror = (err) => console.warn('Erreur WebSocket LoRa :', err);
        ws.onclose = () => console.log('WebSocket LoRa déconnecté');

        // Fermeture propre quand le composant est démonté
        return () => ws.close();
    }, []);

    // Chargement des pylônes
    useEffect(() => {
        console.log('Chargement des pylônes depuis', API_URL);
        fetch(API_URL)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                console.log(`${data.length} pylônes reçus`);
                const valides = data.filter(p =>
                    p.lat != null && p.lon != null &&
                    !isNaN(parseFloat(p.lat)) && !isNaN(parseFloat(p.lon))
                );
                setPylones(valides);
            })
            .catch(err => {
                console.warn('API indisponible, fallback fictif :', err.message);
            })
            .finally(() => setChargementPylones(false));
    }, []);

    const handleCalculer = async (adresseDepart, adresseArrivee) => {
        setChargementItineraire(true);
        setInfosItineraire(null);
        setTrace(null);

        try {
            const depart = await geocoder(adresseDepart);
            const arrivee = await geocoder(adresseArrivee);
            const resultat = await calculerItineraire(depart, arrivee);
            setTrace(resultat.trace);
            setInfosItineraire({
                distance: resultat.distance,
                duree: resultat.duree
            });
        } catch (err) {
            console.error('Erreur itinéraire :', err);
            setInfosItineraire({ erreur: err.message });
        } finally {
            setChargementItineraire(false);
        }
    };

    const handleEffacer = () => {
        setTrace(null);
        setInfosItineraire(null);
    };

    // Clique sur la carte (pas sur un marqueur) → ferme la bulle
    const handleMapClick = () => {
        setPyloneSelectionne(null);
    };

    return (
        <div className="carte-wrapper">
            <APIProvider apiKey={apiKey}>
                <Map
                    defaultZoom={6}
                    defaultCenter={CENTRE}
                    mapId="DEMO_MAP_ID"
                    gestureHandling={'greedy'}
                    disableDefaultUI={true}
                    style={{ width: '100vw', height: '100vh' }}
                    onClick={handleMapClick}
                >
                    {/* Pylônes avec icône personnalisée */}
                    {pylones.map((pylone, i) => (
                        <AdvancedMarker
                            key={pylone.code_site || i}
                            position={{
                                lat: parseFloat(pylone.lat),
                                lng: parseFloat(pylone.lon)
                            }}
                            title={pylone.nom || 'Pylône'}
                            onClick={() => setPyloneSelectionne(pylone)}
                        >
                            <img
                                src="/pylone.png"
                                alt="Pylône"
                                style={{
                                    width: '40px',
                                    height: 'auto',
                                    cursor: 'pointer',
                                    filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))',
                                    transition: 'transform 0.15s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            />
                        </AdvancedMarker>
                    ))}

                    {/* Bulle d'info quand un pylône est sélectionné */}
                    {pyloneSelectionne && (
                        <BullePylone
                            pylone={pyloneSelectionne}
                            onClose={() => setPyloneSelectionne(null)}
                        />
                    )}

                    {/* Dispositifs LoRa simulés en temps réel */}
                    {dispositifsLora.map((d) => (
                        <MarqueurLora key={d.id} dispositif={d} />
                    ))}

                    {trace && <ItineraireAffiche trace={trace} />}
                    <ZoomControls />
                </Map>
            </APIProvider>

            <div className="compteur">
                <span>{pylones.length}</span> pylônes
                {chargementPylones && 'Chargement...'}
                {dispositifsLora.length > 0 && (
                    <> · <span style={{ color: '#27ae60' }}>{dispositifsLora.length}</span> LoRa</>
                )}
            </div>

            <PanneauItineraire
                onCalculer={handleCalculer}
                onEffacer={handleEffacer}
                infos={infosItineraire}
                chargement={chargementItineraire}
            />
        </div>
    );
}

export default Carte;