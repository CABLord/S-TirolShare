import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Polyline } from 'react-leaflet';
import L, { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
// Stelle sicher, dass die Typen aus api.ts importiert werden und aktuell sind
import { transportService, Station, Route, RouteSegment } from '../services/api'; // Annahme: api.ts ist im richtigen Pfad
import { useThemeStore } from '../stores/themeStore'; // Annahme: themeStore ist im richtigen Pfad
import { debounce } from 'lodash';

// --- Leaflet Icon Fix ---
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
    iconUrl: require('leaflet/dist/images/marker-icon.png'),
    shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});
// --- End Leaflet Icon Fix ---

// --- Mapbox Configuration ---
const MAPBOX_API_KEY = 'pk.eyJ1IjoiYWZkc2dmZGgiLCJhIjoiY205ZzJhemlnMDhuaDJpc2g5dm5scm94aSJ9.H0oSlIsY31DgkBvqEbDNCw'; // Dein API Key
const MAPBOX_USERID = 'mapbox';
const MAPBOX_STYLE_LIGHT = 'streets-v12';
const MAPBOX_STYLE_DARK = 'dark-v11';

// --- Hauptkomponente ---
const TransportMap = () => {
    // --- States ---
    const [nearbyStations, setNearbyStations] = useState<Station[]>([]);
    const [stationsForMap, setStationsForMap] = useState<Record<string, Station>>({}); // Nur für Marker auf der Karte

    const [fromLocation, setFromLocation] = useState('');
    const [toLocation, setToLocation] = useState('');
    const [fromSuggestions, setFromSuggestions] = useState<Station[]>([]);
    const [toSuggestions, setToSuggestions] = useState<Station[]>([]);

    const [activeInputField, setActiveInputField] = useState<'from' | 'to' | null>(null);

    const [isLoadingNearby, setIsLoadingNearby] = useState(false);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false); // Für beide Autocomplete-Felder
    const [isLoadingRoute, setIsLoadingRoute] = useState(false);

    const [routes, setRoutes] = useState<Route[]>([]);
    const [mapCenter, setMapCenter] = useState<[number, number]>([46.49067, 11.33982]); // Bozen
    const [routePolyline, setRoutePolyline] = useState<LatLngExpression[]>([]);
    const [mapZoom, setMapZoom] = useState<number>(13);
    const { darkMode } = useThemeStore();
    const [error, setError] = useState<string | null>(null);
    const mapRef = useRef<L.Map>(null);

    const fromInputRef = useRef<HTMLInputElement>(null);
    const toInputRef = useRef<HTMLInputElement>(null);


    // Lädt nahegelegene Stationen
    const fetchNearbyStations = useCallback(async (lat: number, lon: number, radius: number = 1000): Promise<void> => {
        if (isNaN(lat) || isNaN(lon) || lat > 90 || lat < -90 || lon > 180 || lon < -180) {
            console.error("fetchNearbyStations: Ungültige Koordinaten empfangen:", { lat, lon });
            return;
        }
        setIsLoadingNearby(true);
        try {
            const data = await transportService.getNearbyStations(lat, lon, radius);
            setNearbyStations(data);
            setError(prevError => prevError?.includes('Nahe Stationen') ? null : prevError);
        } catch (err: any) {
            console.error('Fehler beim Laden nahegelegener Stationen:', err);
            if (!error) setError(err.message || 'Nahe Stationen konnten nicht geladen werden.');
            setNearbyStations([]);
        } finally {
            setIsLoadingNearby(false);
        }
    }, [error]);
    const debouncedFetchNearbyStations = useCallback(debounce(fetchNearbyStations, 800), [fetchNearbyStations]);


    // Sucht Stationen für Autocomplete (allgemein)
    const handleAutocompleteSearch = useCallback(async (query: string, inputType: 'from' | 'to') => {
        if (!query || query.trim().length < 2) { // Schwelle auf 2 Zeichen für schnellere Vorschläge
            if (inputType === 'from') setFromSuggestions([]);
            else setToSuggestions([]);
            return;
        }
        setIsLoadingSuggestions(true);
        try {
            const data = await transportService.getStations(query.trim());
            if (inputType === 'from') setFromSuggestions(data);
            else setToSuggestions(data);
            setError(prevError => prevError?.includes('Haltestellensuche') ? null : prevError);
        } catch (err: any) {
            console.error(`Fehler bei der Haltestellensuche für ${inputType}:`, err);
            if (!error) setError(err.message || `Haltestellensuche für ${inputType} fehlgeschlagen.`);
            if (inputType === 'from') setFromSuggestions([]);
            else setToSuggestions([]);
        } finally {
            setIsLoadingSuggestions(false);
        }
    }, [error]); // Füge error zur Dependency List hinzu

    const debouncedAutocompleteSearch = useCallback(debounce(handleAutocompleteSearch, 300), [handleAutocompleteSearch]);

    // Handler für Änderungen im "Von"-Feld
    const handleFromQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setFromLocation(query);
        setActiveInputField('from');
        if (query.trim().length === 0) {
            setFromSuggestions([]);
        } else {
            debouncedAutocompleteSearch(query, 'from');
        }
    };

    // Handler für Änderungen im "Nach"-Feld
    const handleToQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setToLocation(query);
        setActiveInputField('to');
        if (query.trim().length === 0) {
            setToSuggestions([]);
        } else {
            debouncedAutocompleteSearch(query, 'to');
        }
    };

    // Handler für Klick auf einen Vorschlag
    const handleSuggestionClick = (station: Station, inputType: 'from' | 'to') => {
        const stationIdentifier = station.name + (station.locality ? `, ${station.locality}` : '');
        if (inputType === 'from') {
            setFromLocation(stationIdentifier);
            setFromSuggestions([]);
        } else {
            setToLocation(stationIdentifier);
            setToSuggestions([]);
        }
        setActiveInputField(null); // Vorschlagsliste schließen

        // Ausgewählte Station zur Karte hinzufügen und fokussieren
        if (station.id && station.coords) {
            setStationsForMap(prev => ({ ...prev, [station.id!]: station }));
            if (mapRef.current) {
                mapRef.current.flyTo(station.coords!, 15);
            }
        }
    };


    // Kombiniert nahegelegene und spezifisch ausgewählte Stationen für die Kartenanzeige
    useEffect(() => {
        const combined: Record<string, Station> = {};
        nearbyStations.forEach(s => { if (s.id && s.coords) combined[s.id] = s; });
        // stationsForMap (die durch Klick auf Vorschläge gesetzt wurden) werden hier nicht mehr benötigt,
        // da sie direkt in stationsForMap bleiben sollen.
        // Wenn man die nearbystations nicht überschreiben will, kann man die Logik anpassen.
        // Aktuell: `nearbyStations` werden angezeigt, plus die Stationen, die man explizit auswählt.
        setStationsForMap(prevMapStations => {
            const updatedStations = { ...prevMapStations }; // Behalte bereits ausgewählte Stationen
            nearbyStations.forEach(s => {
                if (s.id && s.coords && !updatedStations[s.id]) { // Füge nahegelegene hinzu, wenn nicht schon als spezifisch ausgewählt
                    updatedStations[s.id] = s;
                } else if (s.id && s.coords && updatedStations[s.id] && !updatedStations[s.id].locality && s.locality){
                    // Update if nearby has more info (e.g. locality) and current map one doesn't
                    updatedStations[s.id] = s;
                }
            });
            return updatedStations;
        });

    }, [nearbyStations]);


    // Initiales Laden naher Stationen und wenn sich mapCenter programmatisch ändert
    useEffect(() => {
        if (mapCenter[0] >= -90 && mapCenter[0] <= 90 && mapCenter[1] >= -180 && mapCenter[1] <= 180) {
            fetchNearbyStations(mapCenter[0], mapCenter[1]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Nur beim Mount (oder wenn mapCenter explizit geändert wird, aber nicht durch Kartenbewegung hier)

    // --- Routensuche Handler ---
    const handleRouteSearch = async (e?: React.FormEvent<HTMLFormElement>): Promise<void> => {
        e?.preventDefault();
        if (!fromLocation || !toLocation) {
            setError('Bitte Start- und Zielort eingeben.');
            return;
        }
        setIsLoadingRoute(true); setError(null); setRoutes([]); setRoutePolyline([]);
        // Lösche alte Stationen von der Karte, außer denen die explizit ausgewählt wurden und Teil der Route sein könnten.
        // Fürs Erste: Alle nicht-nearby Stations löschen, die nicht from/to sind. Besser: Nur Nearby + Start/Ziel
        // setStationsForMap({}); // Oder selektiver

        try {
            const data: Route[] = await transportService.getRoute(fromLocation.trim(), toLocation.trim());
            setRoutes(data);
            const routeStations: Record<string, Station> = {};

            if (data && data.length > 0 && data[0].segments) {
                const polylinePoints: LatLngExpression[] = [];
                data[0].segments.forEach((segment: RouteSegment) => {
                    if (segment.fromCoords) {
                        polylinePoints.push(segment.fromCoords as LatLngExpression);
                        // Annahme: segment.from ist der Name, segment.fromCoords die Koordinaten
                        // Wir brauchen eine ID für die Stationen um sie in stationsForMap zu speichern.
                        // Wenn die API keine IDs für Zwischenstationen liefert, müssen wir ggf. welche generieren oder anders behandeln.
                        // Für dieses Beispiel nehmen wir an, dass Start-/Endpunkte der Segmente auf der Karte angezeigt werden sollen.
                        // Hier wäre es gut, wenn `getRoute` auch die Station-Objekte zurückgibt.
                        // Temporäre Lösung: Wenn Koordinaten da sind, erstelle ein einfaches Station-Objekt
                        if (segment.from && typeof segment.from === 'string' && segment.fromCoords) {
                           const stationId = `route_from_${segment.from.replace(/\s+/g, '_')}`; // einfache ID
                           routeStations[stationId] = { id: stationId, name: segment.from, coords: segment.fromCoords, type: segment.type };
                        }
                    }
                    if (segment.toCoords) {
                        polylinePoints.push(segment.toCoords as LatLngExpression);
                         if (segment.to && typeof segment.to === 'string' && segment.toCoords) {
                           const stationId = `route_to_${segment.to.replace(/\s+/g, '_')}`;
                           routeStations[stationId] = { id: stationId, name: segment.to, coords: segment.toCoords, type: segment.type };
                        }
                    }
                });

                if (polylinePoints.length > 1) {
                    setRoutePolyline(polylinePoints);
                    setStationsForMap(prev => ({...prev, ...routeStations})); // Füge Routenstationen zu den Kartenmarkern hinzu
                    if (mapRef.current) {
                        try { mapRef.current.fitBounds(polylinePoints as LatLngBoundsExpression); }
                        catch (fitBoundsError) { console.error("Fehler beim Anpassen der Kartengrenzen:", fitBoundsError); }
                    }
                } else { setRoutePolyline([]); }
            } else { setRoutePolyline([]); }
        } catch (err: any) {
            console.error('Fehler bei der Routensuche:', err);
            setRoutes([]); setRoutePolyline([]);
            if (err.response) {
                const status = err.response.status;
                const errorData = err.response.data;
                if (status === 400 && errorData?.errorCode === 'AMBIGUOUS_LOCATION') {
                    let msg = errorData.message || 'Start- oder Zielort ist mehrdeutig.';
                    setError(msg + " Bitte Eingabe präzisieren oder Vorschlag wählen.");
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
                console.log("Map Center (WGS84):", center);
                if (center.lat > 90 || center.lat < -90 || center.lng > 180 || center.lng < -180) {
                    console.error("Ungültige WGS84 Koordinaten von map.getCenter() erhalten:", center);
                    return;
                }
                setMapCenter([center.lat, center.lng]); // Dies sollte NICHT direkt fetchNearbyStations triggern, da es im useEffect oben ist
                setMapZoom(zoom);
                debouncedFetchNearbyStations(center.lat, center.lng); // Expliziter Aufruf
            },
            zoomend: () => { setMapZoom(map.getZoom()); },
            click: () => { // Schließe Vorschlagslisten bei Klick auf die Karte
                setActiveInputField(null);
                setFromSuggestions([]);
                setToSuggestions([]);
            }
        });
        return null;
    };

    // Schließen der Vorschlagslisten, wenn außerhalb geklickt wird
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Prüfen ob der Klick außerhalb der Input-Felder und deren Suggestion-Listen war
            if (
                activeInputField &&
                fromInputRef.current && !fromInputRef.current.contains(event.target as Node) &&
                toInputRef.current && !toInputRef.current.contains(event.target as Node) &&
                // Zusätzliche Überprüfung für die Suggestion-Listen selbst (ggf. Refs dafür hinzufügen)
                !(event.target as HTMLElement).closest('.suggestion-list-from') &&
                !(event.target as HTMLElement).closest('.suggestion-list-to')
            ) {
                setActiveInputField(null);
                setFromSuggestions([]);
                setToSuggestions([]);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [activeInputField]);


    // --- JSX Rendering ---
    return (
        <div className="flex flex-col lg:flex-row h-screen max-h-screen overflow-hidden">
            {/* Linke Seitenleiste */}
            <div className={`w-full lg:w-1/3 xl:w-1/4 p-4 overflow-y-auto ${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'} shadow-lg lg:shadow-none`}>
                <h1 className="text-xl font-bold mb-4">Mobilitätsplaner</h1>

                {error && (
                    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded" role="alert">
                        <p className="font-bold">Fehler</p>
                        <p>{error}</p>
                        <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 text-sm font-semibold mt-2">Ausblenden</button>
                    </div>
                )}

                <form onSubmit={handleRouteSearch} className="mb-4">
                    <div className="space-y-3">
                        {/* VON FELD MIT AUTOCOMPLETE */}
                        <div className="relative">
                            <label htmlFor="fromLocation" className="block text-sm font-medium mb-1">Von</label>
                            <input
                                ref={fromInputRef}
                                id="fromLocation"
                                type="text"
                                autoComplete="off"
                                className={`w-full p-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}
                                value={fromLocation}
                                onChange={handleFromQueryChange}
                                onFocus={() => setActiveInputField('from')}
                                // onBlur via useEffect handleClickOutside oder spezifischer
                                placeholder="Startpunkt eingeben"
                            />
                            {isLoadingSuggestions && activeInputField === 'from' && (
                                <div className="absolute right-2 top-9"> {/* Position anpassen */}
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                                </div>
                            )}
                            {activeInputField === 'from' && fromSuggestions.length > 0 && fromLocation.length >=2 && (
                                <ul className={`suggestion-list-from absolute z-20 w-full mt-1 rounded-md shadow-lg ${darkMode ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-300'} border max-h-60 overflow-auto`}>
                                    {fromSuggestions.map((station) => (
                                        <li
                                            key={station.id || station.name} // Fallback, falls ID fehlt
                                            className={`px-3 py-2 text-sm cursor-pointer ${darkMode ? 'hover:bg-gray-500' : 'hover:bg-gray-100'}`}
                                            onMouseDown={() => handleSuggestionClick(station, 'from')} // Wichtig: onMouseDown statt onClick wegen onBlur
                                        >
                                            <strong>{station.name}</strong>
                                            {station.locality && <span className="ml-1 text-xs text-gray-400 dark:text-gray-300">{station.locality}</span>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* NACH FELD MIT AUTOCOMPLETE */}
                        <div className="relative">
                            <label htmlFor="toLocation" className="block text-sm font-medium mb-1">Nach</label>
                            <input
                                ref={toInputRef}
                                id="toLocation"
                                type="text"
                                autoComplete="off"
                                className={`w-full p-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}
                                value={toLocation}
                                onChange={handleToQueryChange}
                                onFocus={() => setActiveInputField('to')}
                                placeholder="Ziel eingeben"
                            />
                            {isLoadingSuggestions && activeInputField === 'to' && (
                                <div className="absolute right-2 top-9"> {/* Position anpassen */}
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                                </div>
                            )}
                            {activeInputField === 'to' && toSuggestions.length > 0 && toLocation.length >=2 &&(
                                <ul className={`suggestion-list-to absolute z-20 w-full mt-1 rounded-md shadow-lg ${darkMode ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-300'} border max-h-60 overflow-auto`}>
                                    {toSuggestions.map((station) => (
                                        <li
                                            key={station.id || station.name}
                                            className={`px-3 py-2 text-sm cursor-pointer ${darkMode ? 'hover:bg-gray-500' : 'hover:bg-gray-100'}`}
                                            onMouseDown={() => handleSuggestionClick(station, 'to')}
                                        >
                                            <strong>{station.name}</strong>
                                            {station.locality && <span className="ml-1 text-xs text-gray-400 dark:text-gray-300">{station.locality}</span>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <button
                            type="submit"
                            className={`w-full py-2 px-4 rounded font-medium ${isLoadingRoute || !fromLocation || !toLocation ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                            disabled={isLoadingRoute || !fromLocation || !toLocation}
                        >
                            {isLoadingRoute ? 'Suche...' : 'Verbindung suchen'}
                        </button>
                    </div>
                </form>

                {/* Das separate "Haltestelle finden" Feld wird entfernt, da die Funktionalität in "Von" und "Nach" integriert ist */}

                {/* Routenergebnisse */}
                {isLoadingRoute && <div className="text-center p-4">Routen werden gesucht...</div>}
                {!isLoadingRoute && !error && routes.length === 0 && fromLocation && toLocation && <div className="text-center p-4 text-gray-500">Keine Routen gefunden.</div>}
                {routes.length > 0 && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold">Gefundene Routen</h2>
                        {routes.map((route, index) => (
                            <div key={index} className={`p-3 rounded ${darkMode ? 'bg-gray-700' : 'bg-white'} shadow`}>
                                <div className="flex justify-between items-center mb-2 text-sm font-medium">
                                    <span>Route {index + 1}</span>
                                    <span>Dauer: {typeof route.duration === 'number' ? `${route.duration} min` : route.duration || 'N/A'}</span>
                                </div>
                                <div className="space-y-1.5 text-sm border-t pt-2 mt-2 border-gray-300 dark:border-gray-500">
                                    {route.segments.map((segment, idx) => (
                                        <div key={idx} className="flex items-start space-x-2 p-1 rounded">
                                            <span className={`flex-shrink-0 inline-block mt-0.5 px-2 py-0.5 text-xs font-semibold rounded whitespace-nowrap ${
                                                segment.type === 'Fußweg' ? (darkMode ? 'bg-gray-500' : 'bg-gray-300 text-gray-800') :
                                                segment.type?.toLowerCase().includes('bus') ? 'bg-blue-500 text-white' :
                                                segment.type?.toLowerCase().includes('bahn') || segment.type?.toLowerCase().includes('zug') || segment.type?.toLowerCase().includes('reg') ? 'bg-red-500 text-white' :
                                                'bg-purple-500 text-white'
                                            }`}>
                                                {segment.line ? `${segment.line}` : segment.type}
                                            </span>
                                            <div className="flex-grow text-xs leading-relaxed">
                                                {segment.departureTime && segment.arrivalTime ? (
                                                    <>
                                                        <span className="font-semibold">{segment.departureTime}</span> Ab: {segment.from}<br />
                                                        <span className="font-semibold">{segment.arrivalTime}</span> An: {segment.to}
                                                    </>
                                                ) : (
                                                    <>Ab: {segment.from} <br />An: {segment.to}</>
                                                )}
                                                {segment.segmentDuration !== null && segment.segmentDuration !== undefined && ` (${segment.segmentDuration} min)`}
                                                {segment.direction && <div className="text-[11px] text-gray-500 dark:text-gray-400">Richtung: {segment.direction}</div>}
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
                {isLoadingNearby && (
                    <div className="absolute top-2 right-2 z-[1000] bg-white dark:bg-gray-700 p-2 rounded shadow text-xs">Lade nahe Stationen...</div>
                )}
                <MapContainer
                    ref={mapRef}
                    center={mapCenter}
                    zoom={mapZoom}
                    style={{ height: '100%', width: '100%' }} // Diese Styles sind kritisch!
                    scrollWheelZoom={true}
                    className={darkMode ? 'map-dark' : ''} // Für ggf. spezifische Dark-Mode Kartenstyles
                >
                    <MapEvents />
                    <TileLayer
                        attribution='&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener noreferrer">Mapbox</a> &copy; <a href="http://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
                        url={`https://api.mapbox.com/styles/v1/${MAPBOX_USERID}/${darkMode ? MAPBOX_STYLE_DARK : MAPBOX_STYLE_LIGHT}/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_API_KEY}`}
                        tileSize={256} zoomOffset={-1} minZoom={1} maxZoom={19}
                    />
                    {Object.values(stationsForMap).map((station) =>
                        station.coords ? ( // Stelle sicher, dass Coords vorhanden und gültig sind
                            <Marker key={station.id || station.name} position={station.coords as LatLngExpression}>
                                <Popup>
                                    <div className="font-semibold">{station.name}</div>
                                    {station.locality && <div className="text-sm">{station.locality}</div>}
                                    {station.type && <div className="text-xs text-gray-500">Typ: {station.type}</div>}
                                </Popup>
                            </Marker>
                        ) : null
                    )}
                    {routePolyline.length > 0 && <Polyline positions={routePolyline} pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.8 }} />}
                </MapContainer>
            </div>
        </div>
    );
};

export default TransportMap;