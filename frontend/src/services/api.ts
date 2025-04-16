/**
 * api.ts
 *
 * Definiert Typen und Service-Funktionen für die Kommunikation
 * mit dem Backend API (Authentifizierung, Wetter, ÖPNV, Mitfahrgelegenheiten).
 * Enthält die notwendigen Anpassungen für die überarbeiteten Backend-Antworten.
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore'; // Annahme: Zustand-Store für Auth existiert

// API Basis-URL aus Umgebungsvariable oder Fallback
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Axios-Instanz erstellen und konfigurieren
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Axios Request Interceptor: Fügt Auth-Token hinzu
api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const token = useAuthStore.getState().token;
        if (token && config.headers) {
            config.headers.set('Authorization', `Bearer ${token}`);
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// --- Interface Definitions ---

/**
 * Definiert ein Segment einer ÖPNV-Route.
 * Enthält alle Felder, die das Backend jetzt liefern sollte.
 */
export interface RouteSegment {
    type: string;           // Typ des Segments, z.B. "ÖPNV", "Fußweg", "Bus", "REG"
    from: string;           // Name des Startpunkts
    to: string;             // Name des Endpunkts
    departureTime?: string | null; // Geplante Abfahrtszeit "HH:MM" oder null
    arrivalTime?: string | null;   // Geplante Ankunftszeit "HH:MM" oder null
    /** Berechnete Dauer des Segments in Minuten (oder EFA-Angabe für Fußwege), oder null */
    segmentDuration?: number | null;
    line?: string;          // Linienbezeichnung (z.B. "401", "B400")
    direction?: string | null;     // Fahrtrichtung (optional)
    fromCoords?: [number, number] | null; // [latitude, longitude] Start (optional)
    toCoords?: [number, number] | null;   // [latitude, longitude] Ende (optional)
    /** Betreiber des Verkehrsmittels (optional) */
    operator?: string | null;
}

/**
 * Definiert eine komplette Routenoption.
 */
export interface Route {
    /** Gesamtdauer in Minuten (berechnet) oder null/String von EFA */
    duration: number | string | null;
    distance?: number;         // Gesamtdistanz (optional)
    interchanges?: number;     // Anzahl Umstiege (optional)
    segments: RouteSegment[];  // Array der Segmente
}

/**
 * Definiert eine Haltestelle oder Station.
 */
export interface Station {
    id: string;                // Eindeutiger Identifier
    name: string;              // Name
    locality: string;          // Ort/Gemeinde
    coords: [number, number] | null; // [latitude, longitude] oder null
    type?: string;             // Typ (optional, z.B. 'stop')
    distance?: number;         // Distanz (optional, für Umkreissuche)
}

/**
 * Datenstruktur für Mitfahrgelegenheiten (Beispiel).
 */
interface RideDataType {
    from: string;
    to: string;
    date: Date;
    time: string;
    price: number;
    seats: number;
    duration?: number;
    distance?: number;
}

// --- Service Definitions ---

// Service für Authentifizierung
export const authService = {
    login: async (email: string, password: string) => {
        try {
            const response = await api.post('/auth/login', { email, password });
            return response.data;
        } catch (error) {
            const axiosError = error as AxiosError;
            console.error('Login error:', axiosError.response?.data || error);
            const message = (axiosError.response?.data as { message?: string })?.message || 'Login fehlgeschlagen.';
            throw new Error(message);
        }
    },
    register: async (name: string, email: string, password: string) => {
        try {
            const response = await api.post('/auth/register', { name, email, password });
            return response.data;
        } catch (error) {
            const axiosError = error as AxiosError;
            console.error('Register error:', axiosError.response?.data || error);
            const message = (axiosError.response?.data as { message?: string })?.message || 'Registrierung fehlgeschlagen.';
            throw new Error(message);
        }
    }
};

// Service für Wetterdaten
export const weatherService = {
    getWeather: async (location: string) => {
        try {
            const response = await api.get(`/weather/${encodeURIComponent(location)}`);
            return response.data;
        } catch (error) {
            console.error('Weather API error:', error);
            if (axios.isAxiosError(error)) {
                throw new Error(
                    (error.response?.data as { message?: string })?.message || 'Wetterdaten konnten nicht geladen werden.'
                );
            }
            throw new Error('Unbekannter Fehler beim Abrufen der Wetterdaten.');
        }
    }
};

// Service für ÖPNV-Informationen
export const transportService = {
    /**
     * Suche Haltestellen anhand eines Suchbegriffs.
     */
    getStations: async (query: string): Promise<Station[]> => {
        if (!query || query.trim().length < 3) {
            return Promise.resolve([]);
        }
        try {
            const response = await api.get('/transport/stations', {
                params: { query: query.trim() }
            });
            return Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            const axiosError = error as AxiosError;
            console.error('Stations search error:', axiosError.response?.status, axiosError.response?.data || axiosError.message);
            const errorMessage = (axiosError.response?.data as { message?: string })?.message || 'Fehler bei der Haltestellensuche.';
            throw new Error(errorMessage);
        }
    },

    /**
     * Finde Haltestellen in der Nähe von Koordinaten.
     */
    getNearbyStations: async (lat: number, lon: number, radius: number = 1000): Promise<Station[]> => {
        // Validierung im Frontend kann sinnvoll sein, bevor der Request gesendet wird
        if (isNaN(lat) || isNaN(lon) || lat > 90 || lat < -90 || lon > 180 || lon < -180 || radius <= 0) {
             console.error("getNearbyStations: Ungültige Parameter:", { lat, lon, radius });
             // Werfe einen Fehler oder gib leeres Array zurück, um ungültigen Request zu vermeiden
             throw new Error("Ungültige Koordinaten oder Radius für Umkreissuche.");
             // return Promise.resolve([]);
        }
        try {
            const response = await api.get('/transport/stations/nearby', {
                params: { lat, lon, radius }
            });
            return Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            const axiosError = error as AxiosError;
            console.error('Nearby stations error:', axiosError.response?.status, axiosError.response?.data || axiosError.message);
            const errorMessage = (axiosError.response?.data as { message?: string })?.message || 'Fehler beim Laden nahegelegener Haltestellen.';
            throw new Error(errorMessage);
        }
    },

    /**
     * Ruft Routenoptionen zwischen zwei Orten ab.
     * Leitet bei Fehlern den originalen Axios-Fehler weiter, damit die
     * aufrufende Komponente Details wie Statuscode und Body auswerten kann.
     */
    getRoute: async (from: string, to: string): Promise<Route[]> => {
        try {
            const response = await api.get('/transport/route', {
                params: { from, to }
            });
            // Prüfe defensiv, ob das Ergebnis ein Array ist.
            return Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            const axiosError = error as AxiosError;
            console.error(
                'Route API error:',
                axiosError.response?.status,
                axiosError.response?.data || axiosError.message
            );
            // Wirf den originalen Fehler weiter für detaillierte Behandlung in der Komponente.
            throw error;
        }
    }
};

// Service für Mitfahrgelegenheiten (Beispiel)
export const rideshareService = {
    getRides: async (filters = {}) => {
        try {
            const response = await api.get('/rideshare', { params: filters });
            return response.data;
        } catch (error) {
            const axiosError = error as AxiosError;
            console.error('Get rides error:', axiosError.response?.data || error);
            const message = (axiosError.response?.data as { message?: string })?.message || 'Fahrten konnten nicht geladen werden.';
            throw new Error(message);
        }
    },
    createRide: async (rideData: RideDataType) => {
        try {
            const payload = {
                ...rideData,
                date: rideData.date.toISOString().split('T')[0] // Format YYYY-MM-DD
            };
            const response = await api.post('/rideshare', payload);
            return response.data;
        } catch (error) {
            const axiosError = error as AxiosError;
            console.error('Create ride error:', axiosError.response?.data || error);
            const message = (axiosError.response?.data as { message?: string })?.message || 'Fahrt konnte nicht erstellt werden.';
            throw new Error(message);
        }
    }
};

// Exportiere die Axios-Instanz, falls sie direkt benötigt wird
export default api;