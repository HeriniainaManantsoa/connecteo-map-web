import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Carte.css';

// ⚠️ Correction importante : Leaflet ne trouve pas ses icônes par défaut avec Vite
// On les importe manuellement
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl,
    iconUrl,
    shadowUrl
});

// Centre de la carte (Antananarivo)
const CENTRE = [-18.8792, 47.5079];

// Quelques points d'exemple à Madagascar
const POINTS_EXEMPLE = [
    { id: 1, nom: 'Antananarivo', lat: -18.8792, lng: 47.5079, type: 'Capitale' },
    { id: 2, nom: 'Toamasina', lat: -18.1499, lng: 49.4023, type: 'Port' },
    { id: 3, nom: 'Mahajanga', lat: -15.7167, lng: 46.3167, type: 'Ville' },
    { id: 4, nom: 'Fianarantsoa', lat: -21.4527, lng: 47.0857, type: 'Ville' },
    { id: 5, nom: 'Toliara', lat: -23.3568, lng: 43.6667, type: 'Ville' },
    { id: 6, nom: 'Antsiranana', lat: -12.2795, lng: 49.2913, type: 'Ville' }
];

// Composant pour recentrer la carte (bouton "Recentrer")
function RecentrerBouton({ centre }) {
    const map = useMap();
    return (
        <button
            className="recentrer-btn"
            onClick={() => map.flyTo(centre, 6, { duration: 1.2 })}
        >
            🇲🇬 Recentrer
        </button>
    );
}

function Carte() {
    const [points] = useState(POINTS_EXEMPLE);

    return (
        <div className="carte-wrapper">
            <MapContainer
                center={CENTRE}
                zoom={6}
                scrollWheelZoom={true}
                className="carte"
            >
                {/* Fond de carte OpenStreetMap (raster, sans WebGL) */}
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxZoom={19}
                />

                {/* Marqueurs */}
                {points.map((point) => (
                    <Marker key={point.id} position={[point.lat, point.lng]}>
                        <Popup>
                            <div className="popup">
                                <h3>{point.nom}</h3>
                                <p><strong>Type :</strong> {point.type}</p>
                                <p className="coords">
                                    📍 {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                                </p>
                            </div>
                        </Popup>
                    </Marker>
                ))}

                {/* Bouton de recentrage */}
                <RecentrerBouton centre={CENTRE} />
            </MapContainer>

            {/* Compteur */}
            <div className="compteur">
                📍 <span>{points.length}</span> points affichés
            </div>
        </div>
    );
}

export default Carte;