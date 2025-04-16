import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Polyline } from 'react-leaflet';
import L, { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
// Stelle sicher, dass die Typen aus api.ts importiert werden und aktuell sind
import { transportService, Station, Route, RouteSegment } from '../services/api';
import { useThemeStore } from '../stores/themeStore';
import { debounce } from 'lodash';

// --- Leaflet Icon Fix --- (Wichtig für korrekte Marker-Anzeige)
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
    iconUrl: require('leaflet/dist/images/marker-icon.png'),
    shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});
// --- End Leaflet Icon Fix ---

// --- Mapbox Configuration ---
// ACHTUNG: API-Schlüssel im Frontend-Code ist UNSICHER! In Produktion über Umgebungsvariablen/Backend schützen!
const MAPBOX_API_KEY = 'pk.eyJ1IjoiYWZkc2dmZGgiLCJhIjoiY205ZzJhemlnMDhuaDJpc2g5dm5scm94aSJ9.H0oSlIsY31DgkBvqEbDNCw';
const MAPBOX_USERID = 'mapbox'; // Standard Mapbox-Benutzer-ID
const MAPBOX_STYLE_LIGHT = 'streets-v12'; // Standard Straßenkarte
const MAPBOX_STYLE_DARK = 'dark-v11';     // Standard dunkle Karte

// --- Hauptkomponente ---
const TransportMap = () => {
    // --- States ---
    const [nearbyStations, setNearbyStations] = useState<Station[]>([]);
    const [searchedStations, setSearchedStations] = useState<Station[]>([]); // Ausgewählte Stationen für Map-Marker
    const [stationSuggestions, setStationSuggestions] = useState<Station[]>([]); // Für Autocomplete-Liste
    const [allStations, setAllStations] = useState<Record<string, Station>>({}); // Kombinierte Stationen für Marker
    const [isLoadingNearby, setIsLoadingNearby] = useState(false);
    const [isLoadingSearch, setIsLoadingSearch] = useState(false);
    const [isLoadingRoute, setIsLoadingRoute] = useState(false);
    const [stationSearchQuery, setStationSearchQuery] = useState('');
    const [fromLocation, setFromLocation] = useState('');
    const [toLocation, setToLocation] = useState('');
    const [routes, setRoutes] = useState<Route[]>([]);
    const [mapCenter, setMapCenter] = useState<[number, number]>([46.49067, 11.33982]); // Bozen
    const [routePolyline, setRoutePolyline] = useState<LatLngExpression[]>([]);
    const [mapZoom, setMapZoom] = useState<number>(13);
    const { darkMode } = useThemeStore(); // Zustand für Theme
    const [error, setError] = useState<string | null>(null); // Fehlermeldungen
    const mapRef = useRef<L.Map>(null); // Referenz zur Karteninstanz
    const [isSuggestionListVisible, setIsSuggestionListVisible] = useState(false); // Sichtbarkeit der Vorschlagsliste

    // --- Callbacks & Effects ---

    // Lädt nahegelegene Stationen
    const fetchNearbyStations = useCallback(async (lat: number, lon: number, radius: number = 1000): Promise<void> => {
        // Validierung hinzufügen, bevor der Request gesendet wird
        if (isNaN(lat) || isNaN(lon) || lat > 90 || lat < -90 || lon > 180 || lon < -180) {
             console.error("fetchNearbyStations: Ungültige Koordinaten empfangen:", { lat, lon });
             // Optional: Fehler anzeigen oder einfach keinen Request senden
             // setError("Kartenfehler: Ungültige Koordinaten für Umkreissuche.");
             return;
        }
        setIsLoadingNearby(true);
        try {
            const data = await transportService.getNearbyStations(lat, lon, radius);
            setNearbyStations(data);
            setError(prevError => prevError?.includes('Nahe Stationen') ? null : prevError);
        } catch (err: any) {
            console.error('Fehler beim Laden nahegelegener Stationen:', err);
            // Zeige Fehler nur an, wenn nicht schon ein Routenfehler o.ä. angezeigt wird
            if (!error) setError(err.message || 'Nahe Stationen konnten nicht geladen werden.');
            setNearbyStations([]);
        } finally {
            setIsLoadingNearby(false);
        }
    }, [error]); // Füge error zur Dependency List hinzu, um ihn ggf. nicht zu überschreiben
    const debouncedFetchNearbyStations = useCallback(debounce(fetchNearbyStations, 800), [fetchNearbyStations]);


    // Sucht Stationen für Autocomplete
    const handleStationSearch = useCallback(async (query: string) => {
        if (!query || query.trim().length < 3) {
            setStationSuggestions([]);
            return;
        }
        setIsLoadingSearch(true);
        try {
            const data = await transportService.getStations(query.trim());
            setStationSuggestions(data);
            // Fehler nur löschen, wenn er von dieser Suche kam
            setError(prevError => prevError?.includes('Haltestellensuche') ? null : prevError);
        } catch (err: any) {
            console.error('Fehler bei der Haltestellensuche:', err);
            if (!error) setError(err.message || 'Haltestellensuche fehlgeschlagen.');
            setStationSuggestions([]);
        } finally {
            setIsLoadingSearch(false);
        }
    }, [error]); // Füge error zur Dependency List hinzu
    const debouncedStationSearch = useCallback(debounce(handleStationSearch, 400), [handleStationSearch]);

    // Handler für Änderungen im Suchfeld
    const handleStationQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setStationSearchQuery(query);
        setIsSuggestionListVisible(true);
        debouncedStationSearch(query);
    };

    // Handler für Klick auf einen Vorschlag
    const handleSuggestionClick = (station: Station) => {
        const stationIdentifier = station.name + (station.locality ? `, ${station.locality}` : '');
        setStationSearchQuery(stationIdentifier);
        setStationSuggestions([]);
        setIsSuggestionListVisible(false);
        setSearchedStations([station]); // Zeige nur diese Station auf der Karte
        if (station.coords && mapRef.current) {
            mapRef.current.flyTo(station.coords, 15);
        }
        // Optional: Felder für Routensuche füllen
        // if (!fromLocation) setFromLocation(stationIdentifier);
        // else if (!toLocation) setToLocation(stationIdentifier);
    };

    // Kombiniert Stationen für die Kartenanzeige
    useEffect(() => {
        const combined: Record<string, Station> = {};
        nearbyStations.forEach(s => { if (s.id && s.coords) combined[s.id] = s; }); // Nur mit Coords
        searchedStations.forEach(s => { if (s.id && s.coords) combined[s.id] = s; }); // Überschreibt ggf. Nearby
        setAllStations(combined);
    }, [nearbyStations, searchedStations]);

    // Initiales Laden naher Stationen
    useEffect(() => {
        // Nur laden, wenn Koordinaten plausibel sind
        if (mapCenter[0] >= -90 && mapCenter[0] <= 90 && mapCenter[1] >= -180 && mapCenter[1] <= 180) {
             fetchNearbyStations(mapCenter[0], mapCenter[1]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Nur beim Mount

    // --- Routensuche Handler ---
    const handleRouteSearch = async (e?: React.FormEvent<HTMLFormElement>): Promise<void> => {
        e?.preventDefault();
        if (!fromLocation || !toLocation) {
            setError('Bitte Start- und Zielort eingeben.');
            return;
        }
        setIsLoadingRoute(true); setError(null); setRoutes([]); setRoutePolyline([]);

        try {
            const data: Route[] = await transportService.getRoute(fromLocation.trim(), toLocation.trim());
            setRoutes(data);

            // --- Polyline Generierung (Start-/Endpunkte der Segmente) ---
            if (data && data.length > 0 && data[0].segments) {
                const polylinePoints: LatLngExpression[] = [];
                data[0].segments.forEach((segment: RouteSegment) => {
                    if (segment.fromCoords) polylinePoints.push(segment.fromCoords as LatLngExpression);
                    if (segment.toCoords) polylinePoints.push(segment.toCoords as LatLngExpression);
                });

                if (polylinePoints.length > 1) {
                    setRoutePolyline(polylinePoints);
                    if (mapRef.current) {
                        try { mapRef.current.fitBounds(polylinePoints as LatLngBoundsExpression); }
                        catch (fitBoundsError) { console.error("Fehler beim Anpassen der Kartengrenzen:", fitBoundsError); }
                    }
                } else { setRoutePolyline([]); }
            } else { setRoutePolyline([]); }
            // --- Ende Polyline ---

        } catch (err: any) { // --- Detaillierte Fehlerbehandlung ---
            console.error('Fehler bei der Routensuche:', err);
            setRoutes([]); setRoutePolyline([]); // Sicherstellen, dass alles leer ist bei Fehler

            if (err.response) {
                const status = err.response.status;
                const errorData = err.response.data; // Das JSON vom Backend
                if (status === 400 && errorData?.errorCode === 'AMBIGUOUS_LOCATION') {
                    let msg = errorData.message || 'Start- oder Zielort ist mehrdeutig.';
                    // Hier könnten die Vorschläge aus errorData angezeigt werden
                    setError(msg + " Bitte Eingabe präzisieren.");
                } else if (status === 404) {
                    setError(errorData?.message || 'Start- oder Zielhaltestelle nicht gefunden.');
                } else if (status === 502 || status === 503) {
                     setError(errorData?.message || 'Fahrplandienst nicht erreichbar. Bitte später erneut versuchen.');
                } else {
                    setError(`Routensuche fehlgeschlagen (Serverfehler ${status}: ${errorData?.message || 'Unbekannt'})`);
                }
            } else if (err.request) {
                setError('Netzwerkfehler. Verbindung zum Server konnte nicht hergestellt werden.');
            } else {
                setError(`Unerwarteter Fehler: ${err.message}`);
            }
            // --- Ende Fehlerbehandlung ---
        } finally {
            setIsLoadingRoute(false);
        }
    };

    // --- Karten-Event-Handler ---
    const MapEvents = () => {
        const map = useMapEvents({
            moveend: () => {
                const center = map.getCenter();
                const zoom = map.getZoom();
                 // --- KOORDINATEN DEBUGGING ---
                 console.log("Map Center (WGS84):", center); // Sollte { lat: ~46.*, lng: ~11.* } sein
                 // --- ENDE DEBUGGING ---
                // Sicherheitscheck für Koordinaten
                if (center.lat > 90 || center.lat < -90 || center.lng > 180 || center.lng < -180) {
                     console.error("Ungültige WGS84 Koordinaten von map.getCenter() erhalten:", center);
                     // Verhindere Fetch mit falschen Koordinaten
                     return;
                 }
                setMapCenter([center.lat, center.lng]);
                setMapZoom(zoom);
                debouncedFetchNearbyStations(center.lat, center.lng);
            },
            zoomend: () => { setMapZoom(map.getZoom()); },
        });
        return null;
    };

    // --- JSX Rendering ---
    return (
        // Verwende Tailwind Klassen für das Layout, ähnlich wie suedtirolmobil.info (aber vereinfacht)
        <div className="flex flex-col lg:flex-row h-screen max-h-screen overflow-hidden">

            {/* Linke Seitenleiste für Suche und Ergebnisse */}
            <div className={`w-full lg:w-1/3 xl:w-1/4 p-4 overflow-y-auto ${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'} shadow-lg lg:shadow-none`}>
                <h1 className="text-xl font-bold mb-4">Mobilitätsplaner</h1>

                {/* Fehleranzeige */}
                {error && (
                    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded" role="alert">
                        <p className="font-bold">Fehler</p>
                        <p>{error}</p>
                        <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 text-sm font-semibold mt-2">Ausblenden</button>
                    </div>
                )}

                {/* Routensuche Formular */}
                <form onSubmit={handleRouteSearch} className="mb-4">
                    <div className="space-y-3">
                        <div>
                            <label htmlFor="fromLocation" className="block text-sm font-medium mb-1">Von</label>
                            <input 
                                id="fromLocation" 
                                type="text" 
                                className={`w-full p-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}
                                value={fromLocation}
                                onChange={(e) => setFromLocation(e.target.value)}
                                placeholder="Startpunkt eingeben"
                            />
                        </div>
                        <div>
                             <label htmlFor="toLocation" className="block text-sm font-medium mb-1">Nach</label>
                            <input 
                                id="toLocation" 
                                type="text" 
                                className={`w-full p-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}
                                value={toLocation}
                                onChange={(e) => setToLocation(e.target.value)}
                                placeholder="Ziel eingeben"
                            />
                        </div>
                        <button 
                            type="submit" 
                            className={`w-full py-2 px-4 rounded font-medium ${isLoadingRoute ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                            disabled={isLoadingRoute || !fromLocation || !toLocation}
                        >
                            {isLoadingRoute ? 'Suche...' : 'Verbindung suchen'}
                        </button>
                    </div>
                </form>

                 {/* Haltestellensuche mit Autocomplete */}
                <div className="mb-4 relative">
                   <label htmlFor="stationSearch" className="block text-sm font-medium mb-1">Haltestelle finden</label>
                   <div className="relative">
                       <input
                           id="stationSearch" type="text" autoComplete="off"
                           className={`w-full p-2 rounded border pr-10 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} placeholder-gray-400`}
                           placeholder="Haltestelle eingeben..."
                           value={stationSearchQuery}
                           onChange={handleStationQueryChange}
                           onFocus={() => setIsSuggestionListVisible(true)}
                           onBlur={() => setTimeout(() => setIsSuggestionListVisible(false), 150)}
                        />
                        {isLoadingSearch && (
                            <div className="absolute right-2 top-2">
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                            </div>
                        )}
                   </div>
                   {/* Autocomplete Liste */}
                    {isSuggestionListVisible && stationSuggestions.length > 0 && stationSearchQuery.length >= 3 && (
                        <ul className={`absolute z-20 w-full mt-1 rounded-md shadow-lg ${darkMode ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-300'} border max-h-60 overflow-auto`}>
                           {stationSuggestions.map((station) => (
                                <li 
                                    key={station.id} 
                                    className={`px-3 py-2 text-sm cursor-pointer ${darkMode ? 'hover:bg-gray-500' : 'hover:bg-gray-100'}`}
                                    onMouseDown={() => handleSuggestionClick(station)}
                                >
                                    <strong>{station.name}</strong>
                                    {station.locality && <span className="ml-1 text-gray-500">{station.locality}</span>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                 {/* Routenergebnisse */}
                 {isLoadingRoute && <div className="text-center p-4">Routen werden gesucht...</div>}
                 {!isLoadingRoute && !error && routes.length === 0 && fromLocation && toLocation && <div className="text-center p-4 text-gray-500">Keine Routen gefunden.</div>}
                 {routes.length > 0 && (
                     <div className="space-y-4">
                         <h2 className="text-lg font-semibold">Gefundene Routen</h2>
                         {routes.map((route, index) => (
                             <div key={index} className={`p-3 rounded ${darkMode ? 'bg-gray-700' : 'bg-white'} shadow`}>
                                 {/* Route summary */}
                                 <div className="flex justify-between items-center mb-2 text-sm font-medium">
                                     <span>Route {index + 1}</span>
                                     <span>Dauer: {typeof route.duration === 'number' ? `${route.duration} min` : route.duration || 'N/A'}</span>
                                 </div>
                                 {/* Segments */}
                                 <div className="space-y-1.5 text-sm border-t pt-2 mt-2 border-gray-300 dark:border-gray-500">
                                     {route.segments.map((segment, idx) => (
                                         <div key={idx} className="flex items-start space-x-2 p-1 rounded">
                                             {/* Segment Badge */}
                                             <span className={`flex-shrink-0 inline-block mt-0.5 px-2 py-0.5 text-xs font-semibold rounded whitespace-nowrap ${
                                                 segment.type === 'Fußweg' ? (darkMode ? 'bg-gray-500' : 'bg-gray-300 text-gray-800') :
                                                 segment.type?.toLowerCase().includes('bus') ? 'bg-blue-500 text-white' :
                                                 segment.type?.toLowerCase().includes('bahn') || segment.type?.toLowerCase().includes('zug') || segment.type?.toLowerCase().includes('reg') ? 'bg-red-500 text-white' :
                                                 'bg-purple-500 text-white' // Fallback
                                             }`}>
                                                 {segment.line ? `${segment.line}` : segment.type} {/* Zeige Linie oder Typ */}
                                             </span>
                                             {/* Segment Details */}
                                             <div className="flex-grow text-xs leading-relaxed">
                                                 {/* Zeiten nur anzeigen, wenn vorhanden */}
                                                 {segment.departureTime && segment.arrivalTime ? (
                                                     <>
                                                         <span className="font-semibold">{segment.departureTime}</span> Ab: {segment.from}<br />
                                                         <span className="font-semibold">{segment.arrivalTime}</span> An: {segment.to}
                                                     </>
                                                 ) : (
                                                     <>Ab: {segment.from} <br />An: {segment.to}</>
                                                 )}
                                                  {/* Segmentdauer */}
                                                  {segment.segmentDuration !== null && segment.segmentDuration !== undefined && ` (${segment.segmentDuration} min)`}
                                                  {/* Richtung */}
                                                 {segment.direction && <div className="text-[11px] text-gray-500 dark:text-gray-400">Richtung: {segment.direction}</div>}
                                                  {/* Betreiber */}
                                                 {segment.operator && <div className="text-[11px] text-gray-500 dark:text-gray-400">Betreiber: {segment.operator}</div>}
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                             </div>
                         ))}
                     </div>
                 )}


            </div> {/* Ende Seitenleiste */}

            {/* Rechte Seite: Karte */}
            <div className="flex-grow h-full w-full lg:w-2/3 xl:w-3/4 relative">
                {/* Ladeanzeige für nahe Stationen über der Karte */}
                {isLoadingNearby && (
                    <div className="absolute top-2 right-2 z-[1000] bg-white dark:bg-gray-700 p-2 rounded shadow text-xs">Lade nahe Stationen...</div>
                )}
                <MapContainer
                    ref={mapRef}
                    center={mapCenter}
                    zoom={mapZoom}
                    style={{ height: '100%', width: '100%' }} // Wichtig: Höhe 100% des Elternelements
                    scrollWheelZoom={true}
                    className={darkMode ? 'map-dark' : ''}
                >
                    <MapEvents />
                    <TileLayer
                        attribution='&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener noreferrer">Mapbox</a> &copy; <a href="http://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
                        url={`https://api.mapbox.com/styles/v1/${MAPBOX_USERID}/${darkMode ? MAPBOX_STYLE_DARK : MAPBOX_STYLE_LIGHT}/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_API_KEY}`}
                        tileSize={256} zoomOffset={-1} minZoom={1} maxZoom={19}
                    />
                    {/* Marker */}
                    {Object.values(allStations).map((station) =>
                         station.coords ? (
                            <Marker key={station.id} position={station.coords}>
                                <Popup>
                                    <div className="font-semibold">{station.name}</div>
                                    {station.locality && <div className="text-sm">{station.locality}</div>}
                                    {station.type && <div className="text-xs text-gray-500">Typ: {station.type}</div>}
                                </Popup>
                            </Marker>
                         ) : null
                     )}
                    {/* Polyline */}
                    {routePolyline.length > 0 && <Polyline positions={routePolyline} pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.8 }} />}
                </MapContainer>
            </div> {/* Ende Karte */}

        </div> // Ende Hauptcontainer
    );
};

export default TransportMap;