/**
 * Backend code for handling transport API requests (EFA).
 * Revised version:
 * - Includes robust time formatting (returns null on error).
 * - Calculates segment duration.
 * - Attempts to extract operator information.
 * - Keeps previous error handling improvements.
 */
const express = require('express');
const router = express.Router();
const axios = require('axios');
const redis = require('redis');
// Optional: You might consider a date library like Moment.js or Luxon
// for more robust timezone handling and date calculations if needed.
// const { DateTime } = require('luxon'); // Example

// --- Redis Setup ---
const redisClient = redis.createClient({
    // Ensure your Redis URL is correct (e.g., 'redis://localhost:6379' or from ENV)
    url: process.env.REDIS_URL || 'redis://redis:6379'
});
redisClient.on('error', err => console.error('Redis Client Error:', err));
(async () => {
    try {
        await redisClient.connect();
        console.log('Redis client connected successfully.');
    } catch (err) {
        console.error('Redis Connect Error:', err);
    }
})();

// --- Helper Functions ---

async function getFromCache(key) {
    if (!redisClient.isReady) {
        console.warn(`Redis client not ready, skipping cache GET for key: ${key}`);
        return null;
    }
    try {
        return await redisClient.get(key);
    } catch (cacheError) {
        console.error(`Redis GET error for key ${key}:`, cacheError);
        return null;
    }
}

async function setInCache(key, value, expirationSeconds) {
    if (!redisClient.isReady) {
        console.warn(`Redis client not ready, skipping cache SET for key: ${key}`);
        return;
    }
    try {
        await redisClient.set(key, value, { EX: expirationSeconds });
    } catch (cacheError) {
        console.error(`Redis SET error for key ${key}:`, cacheError);
    }
}

function logEfaMessages(messageData, context) {
    if (!messageData) return;
    let messageText = '';
    if (Array.isArray(messageData)) {
        messageText = messageData.map(m => m.text || JSON.stringify(m)).join('; ');
    } else if (typeof messageData === 'object' && messageData !== null) {
        messageText = messageData.text || JSON.stringify(messageData);
    } else {
        messageText = String(messageData);
    }
    if (messageText.trim().length > 0) {
        console.warn(`EFA Info/Warning [${context}]:`, messageText);
    }
}

/**
 * Safely parses an EFA dateTime object into a JavaScript Date object.
 * Returns null if the input is invalid or parsing fails.
 * Assumes the date/time is in the server's local timezone (likely correct for EFA Italy).
 * For production, consider timezone libraries if needed.
 */
function parseEfaDateTime(efaDateTime) {
    if (!efaDateTime || typeof efaDateTime.year !== 'string' || typeof efaDateTime.month !== 'string' || typeof efaDateTime.day !== 'string' || typeof efaDateTime.hour !== 'string' || typeof efaDateTime.minute !== 'string') {
        return null;
    }
    try {
        // EFA month is 1-based. Pad all values.
        const year = efaDateTime.year;
        const month = efaDateTime.month.padStart(2, '0');
        const day = efaDateTime.day.padStart(2, '0');
        const hour = efaDateTime.hour.padStart(2, '0');
        const minute = efaDateTime.minute.padStart(2, '0');

        const dateString = `${year}-${month}-${day}T${hour}:${minute}:00`;
        const parsedDate = new Date(dateString);

        // Check if parsing resulted in a valid date
        if (isNaN(parsedDate.getTime())) {
            console.warn("Invalid date created from EFA dateTime:", efaDateTime, dateString);
            return null;
        }
        return parsedDate;
    } catch (e) {
        console.error("Error parsing EFA dateTime:", efaDateTime, e);
        return null;
    }
}

/**
 * Formats a JavaScript Date object into "HH:MM" string.
 * Returns null if the input is not a valid Date object.
 */
const formatTime = (jsDate) => {
    if (!jsDate || !(jsDate instanceof Date) || isNaN(jsDate.getTime())) {
        return null; // Return null for invalid dates
    }
    try {
        const hours = String(jsDate.getHours()).padStart(2, '0');
        const minutes = String(jsDate.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    } catch (e) {
         console.error("Error formatting time from date:", jsDate, e);
         return null;
    }
};

/**
 * Calculates the duration between two JavaScript Date objects in minutes.
 * Returns null if inputs are invalid or end time is before start time.
 */
function calculateDurationMinutes(startDate, endDate) {
    if (!startDate || !endDate || !(startDate instanceof Date) || !(endDate instanceof Date) || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return null;
    }
    const diffMillis = endDate.getTime() - startDate.getTime();
    // Allow zero duration, but not negative
    if (diffMillis < 0) {
         console.warn("calculateDurationMinutes: endDate is before startDate", startDate, endDate);
         return null;
    }
    return Math.round(diffMillis / (1000 * 60));
}

/**
 * Extracts coordinates from an EFA point reference object.
 * Converts "lon,lat" string to [lat, lon] number array.
 * Returns null if extraction fails.
 */
const extractCoords = (pointRef) => {
    if (!pointRef?.coords) return null;
    const parts = pointRef.coords.split(',');
    if (parts.length === 2) {
        const lon = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lon)) {
            return [lat, lon]; // Return [lat, lon]
        }
    }
    console.warn("Could not parse coordinates:", pointRef.coords);
    return null;
}

// --- Route: Trip/Route Search (/route) ---
router.get('/route', async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, message: 'Start- und Zielort benötigt.' });
    const cacheKey = `transport:route:${from}:${to}`;

    try {
        const cachedData = await getFromCache(cacheKey);
        if (cachedData) {
            console.log(`Cache hit for route: ${from} -> ${to}`);
            return res.json(JSON.parse(cachedData));
        }
        console.log(`Cache miss for route: ${from} -> ${to}`);

        const response = await axios.get('https://efa.sta.bz.it/apb/XML_TRIP_REQUEST2', {
            params: {
                language: 'de',
                type_origin: 'any',
                name_origin: from,
                type_destination: 'any',
                name_destination: to,
                outputFormat: 'JSON',
                coordOutputFormat: 'WGS84', // Request WGS84 coordinates
                stateless: 1,
                calcNumberOfTrips: 5,
                useRealtime: 1
            },
            headers: { 'Accept': 'application/json' }
        });

        const efaData = response.data;
        logEfaMessages(efaData.itdMessageList, 'TripRequest');

        if (efaData.error) {
            console.error('EFA Trip API Technical Error:', efaData.error, efaData);
            throw new Error(`EFA API Error: ${efaData.error}`); // Let catch block handle status code
        }

        // --- Ambiguity Check ---
        const originMsg = efaData.origin?.message;
        const destMsg = efaData.destination?.message;
        const originAmbiguous = Array.isArray(originMsg) && originMsg.some(m => m.name === 'code' && m.value === '-8011');
        const destAmbiguous = Array.isArray(destMsg) && destMsg.some(m => m.name === 'code' && m.value === '-8011');

        if ((originAmbiguous || destAmbiguous) && !efaData.trips) {
            console.warn(`Route calculation failed due to ambiguous location(s): From: ${from}, To: ${to}`);
            // ... (process suggestions - code omitted for brevity, see previous examples) ...
            return res.status(400).json({
                success: false,
                message: 'Start- oder Zielort ist mehrdeutig.',
                errorCode: 'AMBIGUOUS_LOCATION',
                // originSuggestions: ...,
                // destinationSuggestions: ...,
                routes: []
            });
        }
        // --- End Ambiguity Check ---

        const routes = [];
        if (efaData.trips) {
            const tripsArray = Array.isArray(efaData.trips) ? efaData.trips : [efaData.trips];

            tripsArray.forEach(trip => {
                let route = {
                    duration: trip.duration || null, // EFA duration string (HHMM or MMMM) - might need parsing
                    interchanges: trip.interchanges || 0,
                    segments: []
                };
                let calculatedTotalDuration = 0; // Sum of calculated segment durations + wait times
                let previousLegArrivalDateTime = null; // To calculate waiting time

                const legsArray = Array.isArray(trip.legs) ? trip.legs : (trip.legs ? [trip.legs] : []);

                legsArray.forEach(leg => {
                    const originPoint = leg.points?.[0];
                    const destinationPoint = leg.points?.[leg.points.length - 1];

                    // Parse dates for reliable calculations
                    const departureDateTime = parseEfaDateTime(originPoint?.dateTime);
                    const arrivalDateTime = parseEfaDateTime(destinationPoint?.dateTime);

                    // Calculate segment duration
                    const segmentDuration = calculateDurationMinutes(departureDateTime, arrivalDateTime);

                    // Calculate waiting time since previous leg (if applicable)
                    let waitingTime = null;
                    if (previousLegArrivalDateTime && departureDateTime) {
                        waitingTime = calculateDurationMinutes(previousLegArrivalDateTime, departureDateTime);
                    }

                    // Add to total duration
                    if (segmentDuration !== null) {
                        calculatedTotalDuration += segmentDuration;
                        if (waitingTime !== null && waitingTime > 0) {
                            calculatedTotalDuration += waitingTime; // Add waiting time between legs
                        }
                    }

                    // Attempt to extract operator info
                    // Check common fields; might need adjustment based on actual EFA responses
                    const operatorInfo = leg.servingLine?.operator || leg.mode?.operator;
                    const operatorName = operatorInfo?.name || leg.servingLine?.name || null; // Prefer specific operator name, fallback to line name


                    // Determine segment type
                    let segmentType = 'ÖPNV'; // Default
                    let walkDuration = null;
                    if (leg.type === 'WALK' || leg.mode?.type === 'FOOTPATH') {
                        segmentType = 'Fußweg';
                        // EFA often provides duration directly for walks
                        walkDuration = leg.duration || segmentDuration; // Use EFA's if available, else calculated
                    } else if (leg.mode?.name) {
                        segmentType = leg.mode.name; // e.g., "Bus", "Stadtbus", "REG"
                    }

                    route.segments.push({
                        type: segmentType,
                        from: originPoint?.name || 'N/A',
                        to: destinationPoint?.name || 'N/A',
                        fromCoords: extractCoords(originPoint?.ref),
                        toCoords: extractCoords(destinationPoint?.ref),
                        departureTime: formatTime(departureDateTime), // Format "HH:MM" or null
                        arrivalTime: formatTime(arrivalDateTime),   // Format "HH:MM" or null
                        // Use specific walk duration if available, otherwise calculated duration
                        segmentDuration: (segmentType === 'Fußweg' && walkDuration !== null) ? walkDuration : segmentDuration,
                        line: leg.mode?.number || leg.mode?.destination || '',
                        direction: leg.mode?.direction || null,
                        operator: operatorName
                    });

                    // Store arrival time for next leg's waiting time calculation
                    previousLegArrivalDateTime = arrivalDateTime;

                }); // end legsArray.forEach

                // Override EFA's duration with calculated one if calculation was successful
                if (calculatedTotalDuration > 0) {
                    route.duration = calculatedTotalDuration;
                }

                if (route.segments.length > 0) {
                    routes.push(route);
                }
            }); // end tripsArray.forEach
        } else {
            console.log(`No trips found for route: ${from} -> ${to} (but not ambiguous).`);
        }

        await setInCache(cacheKey, JSON.stringify(routes), 300); // Cache for 5 minutes
        res.json(routes);

    } catch (error) {
        console.error('Route processing error:', error.message);
        const isEfaApiError = error.message?.startsWith('EFA API Error:');
        // Use error.response for Axios errors to get status and data
        const statusCode = error.response?.status === 400 ? 400 : (isEfaApiError ? 502 : (error.response?.status || 500));
        // Get message from backend error structure if available
        const responseMessage = error.response?.data?.message || (isEfaApiError ? 'Fehler bei der Kommunikation mit dem Fahrplandienst.' : 'Route konnte nicht berechnet werden.');

        res.status(statusCode).json({
            success: false,
            message: responseMessage,
            // Include detailed error only in non-production
            error: process.env.NODE_ENV !== 'production' ? (error.response?.data || error.message) : undefined
        });
    }
});


// --- Route: Station Search by Name (/stations) ---
router.get('/stations', async (req, res) => {
    const { query } = req.query;
    if (!query || query.trim().length < 3) {
        return res.status(400).json({ success: false, message: 'Suchbegriff fehlt oder ist zu kurz (mind. 3 Zeichen).' });
    }
    const trimmedQuery = query.trim();
    const cacheKey = `transport:stations:${trimmedQuery}`;

    try {
        const cachedData = await getFromCache(cacheKey);
        if (cachedData) { /* Return cached data */ return res.json(JSON.parse(cachedData)); }
        console.log(`Cache miss for stations: ${trimmedQuery}`);

        const response = await axios.get('https://efa.sta.bz.it/apb/XML_STOPFINDER_REQUEST', {
            params: {
                language: 'de',
                outputFormat: 'JSON',
                type_sf: 'any',
                name_sf: trimmedQuery,
                coordOutputFormat: 'WGS84',
                stateless: 1,
                 // Maybe limit results if needed: TBD based on API docs/testing
                 // maxList: 10,
            },
            headers: { 'Accept': 'application/json' }
        });
        const efaData = response.data;
        logEfaMessages(efaData.stopFinder?.message, `StopFinder Name [${trimmedQuery}]`);

        if (efaData.error) { throw new Error(`EFA API Error: ${efaData.error}`); }

        const stations = [];
        let pointsData = efaData.stopFinder?.points;
        if (pointsData) {
            let pointsArray = [];
            if (Array.isArray(pointsData)) pointsArray = pointsData;
            else if (pointsData.point) pointsArray = Array.isArray(pointsData.point) ? pointsData.point : [pointsData.point];
            else if (typeof pointsData === 'object' && pointsData !== null) pointsArray = [pointsData];

            pointsArray.forEach(point => {
                const coords = extractCoords(point.ref);
                const id = point.ref?.id || point.stateless || `gen_${point.name}_${point.locality || point.ref?.place}`;
                stations.push({
                    id: id,
                    name: point.name || 'Unbekannter Name',
                    locality: point.locality || point.ref?.place || 'Unbekannter Ort',
                    coords: coords,
                    type: point.anyType || 'unknown'
                });
            });
        } else {
            console.log(`No points found by EFA StopFinder for query: "${trimmedQuery}"`);
        }
        await setInCache(cacheKey, JSON.stringify(stations), 3600); // Cache for 1 hour
        res.json(stations);
    } catch (error) {
        console.error(`Stations processing error for query "${trimmedQuery}":`, error.message);
        const isEfaApiError = error.message?.startsWith('EFA API Error:');
        const statusCode = isEfaApiError ? 502 : (error.response?.status || 500);
        const responseMessage = error.response?.data?.message || (isEfaApiError ? 'Fehler bei Kommunikation mit EFA.' : 'Haltestellen konnten nicht abgerufen werden.');
        res.status(statusCode).json({
            success: false, message: responseMessage,
            error: process.env.NODE_ENV !== 'production' ? (error.response?.data || error.message) : undefined
        });
    }
});

// --- Route: Station Search by Coordinates (/stations/nearby) ---
router.get('/stations/nearby', async (req, res) => {
    const { lat, lon, radius = 1000 } = req.query;
    if (!lat || !lon) { /* Handle missing params */ return res.status(400).json({/*...*/});}

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    const searchRadius = parseInt(radius, 10);
    if (isNaN(latitude) || isNaN(longitude) || isNaN(searchRadius) || searchRadius <= 0 || latitude > 90 || latitude < -90 || longitude > 180 || longitude < -180) {
         console.error("Invalid coordinates or radius received for nearby search:", {lat, lon, radius});
        return res.status(400).json({ success: false, message: 'Ungültige Koordinaten oder Radius.' });
    }

    const cacheLat = latitude.toFixed(4);
    const cacheLon = longitude.toFixed(4);
    const cacheKey = `transport:stations:nearby:${cacheLat}:${cacheLon}:${searchRadius}`;

    try {
        const cachedData = await getFromCache(cacheKey);
        if (cachedData) { /* Return cached data */ return res.json(JSON.parse(cachedData));}
        console.log(`Cache miss for nearby stations: lat=${cacheLat}, lon=${cacheLon}, r=${searchRadius}`);

        // EFA format: lon,lat:radius:epsg (WGS84 = 4326)
        const coordString = `${longitude},${latitude}:${searchRadius}:4326`;

        const response = await axios.get('https://efa.sta.bz.it/apb/XML_STOPFINDER_REQUEST', {
            params: {
                language: 'de',
                outputFormat: 'JSON',
                type_sf: 'coord',
                name_sf: coordString,
                coordOutputFormat: 'WGS84',
                stateless: 1,
                psOption_stopType: 'stop' // Prioritize stops
            },
            headers: { 'Accept': 'application/json' }
        });
        const efaData = response.data;
        logEfaMessages(efaData.stopFinder?.message, `StopFinder Nearby [${coordString}]`);

        if (efaData.error) { throw new Error(`EFA API Error: ${efaData.error}`); }

        const stations = [];
        let pointsData = efaData.stopFinder?.points;
        if (pointsData) {
            let pointsArray = [];
            if (Array.isArray(pointsData)) pointsArray = pointsData;
            else if (pointsData.point) pointsArray = Array.isArray(pointsData.point) ? pointsData.point : [pointsData.point];
            else if (typeof pointsData === 'object' && pointsData !== null) pointsArray = [pointsData];

            pointsArray.forEach(point => {
                const coords = extractCoords(point.ref);
                const id = point.ref?.id || point.stateless || `gen_${point.name}_${point.locality || point.ref?.place}`;
                stations.push({
                    id: id,
                    name: point.name || 'Unbekannter Name',
                    locality: point.locality || point.ref?.place || 'Unbekannter Ort',
                    coords: coords,
                    type: point.anyType || 'unknown',
                    distance: point.ref?.distance // Include distance if provided
                });
            });
            // Sort by distance
            if (stations.length > 0 && stations[0].distance !== undefined) {
                stations.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
            }
        } else {
            console.log(`No nearby points found by EFA StopFinder for coords: ${coordString}`);
        }
        await setInCache(cacheKey, JSON.stringify(stations), 3600);
        res.json(stations);
    } catch (error) {
        console.error(`Nearby Stations processing error for lat=${latitude}, lon=${longitude}:`, error.message);
        const isEfaApiError = error.message?.startsWith('EFA API Error:');
        const statusCode = isEfaApiError ? 502 : (error.response?.status || 500);
        const responseMessage = error.response?.data?.message || (isEfaApiError ? 'Fehler bei Kommunikation mit EFA.' : 'Nahegelegene Haltestellen konnten nicht abgerufen werden.');
        res.status(statusCode).json({
            success: false, message: responseMessage,
            error: process.env.NODE_ENV !== 'production' ? (error.response?.data || error.message) : undefined
        });
    }
});


// --- Route: Departures (/departures) ---
router.get('/departures', async (req, res) => {
    // Code logic mostly unchanged from previous robust version.
    // Ensure it handles "stop not found" (404) and other errors correctly.
    /* ... */
    const { stationId, stationName } = req.query;
    if (!stationId && !stationName) { /*...*/ }
    const identifier = stationId || stationName;
    const nameParamValue = stationId ? `stopID:${stationId}` : stationName;
    const cacheKey = `transport:departures:${identifier}`;
    try {
        const cachedData = await getFromCache(cacheKey);
        if (cachedData) { /*...*/ }
        const response = await axios.get('https://efa.sta.bz.it/apb/XML_DM_REQUEST', { /* ... params ... */ });
        const efaData = response.data;
        logEfaMessages(efaData.message || efaData.departureMonitor?.message, `Departures [${identifier}]`);

         // Check for specific functional errors like "Stop not found" (-3010, -3011)
         const dmMessage = efaData.departureMonitor?.message;
         let stopNotFound = false;
         if (Array.isArray(dmMessage)) {
             stopNotFound = dmMessage.some(m => m.name === 'code' && (m.value === '-3010' || m.value === '-3011'));
         } else if (typeof dmMessage === 'object' && dmMessage !== null) {
             stopNotFound = (dmMessage.code === -3010 || dmMessage.code === -3011);
         }
         if (stopNotFound) {
             console.warn(`Departure monitor: Stop not found for identifier: ${identifier}`);
             return res.status(404).json({ success: false, message: 'Haltestelle nicht gefunden.' });
         }

        if (efaData.error) { throw new Error(`EFA API Error: ${efaData.error}`); }

        const departures = [];
        if (efaData.departureList) {
            const departureListArray = Array.isArray(efaData.departureList) ? efaData.departureList : [efaData.departureList];
            departureListArray.forEach(dep => {
                // Safely format times using the helper
                const scheduledDateTime = parseEfaDateTime(dep.dateTime);
                const realDateTime = parseEfaDateTime(dep.realDateTime); // Might be null
                const scheduledTime = formatTime(scheduledDateTime);
                const realTime = formatTime(realDateTime);

                // Calculate delay more reliably if possible
                let delayMinutes = dep.delay || 0; // Use provided delay first
                 if (realDateTime && scheduledDateTime && delayMinutes === 0) { // Calculate if not provided
                      const calculatedDelay = calculateDurationMinutes(scheduledDateTime, realDateTime);
                      if (calculatedDelay !== null && calculatedDelay > 0) {
                           delayMinutes = calculatedDelay;
                      }
                 }

                departures.push({
                    line: dep.servingLine?.number || '?',
                    direction: dep.servingLine?.direction || dep.servingLine?.directionFrom || 'N/A',
                    platform: dep.servingLine?.platformName || dep.platformName || dep.servingLine?.platform || 'N/A',
                    time: scheduledTime || 'N/A', // Use 'N/A' if time is null
                    realTime: (realTime && realTime !== scheduledTime) ? realTime : null,
                    delay: delayMinutes,
                    type: dep.servingLine?.name || 'Unknown'
                });
            });
        } else {
            console.log(`No departures found for identifier: ${identifier}`);
        }
        await setInCache(cacheKey, JSON.stringify(departures), 60); // Short cache
        res.json(departures);
    } catch (error) {
         // Ensure 404 isn't overwritten by generic 500/502
         if (res.statusCode === 404) return; // Already handled stop not found

        console.error(`Departures processing error for identifier ${identifier}:`, error.message);
        const isEfaApiError = error.message?.startsWith('EFA API Error:');
        const statusCode = isEfaApiError ? 502 : (error.response?.status || 500);
        const responseMessage = error.response?.data?.message || (isEfaApiError ? 'Fehler bei Kommunikation mit EFA.' : 'Abfahrtszeiten konnten nicht abgerufen werden.');
        res.status(statusCode).json({
            success: false, message: responseMessage,
            error: process.env.NODE_ENV !== 'production' ? (error.response?.data || error.message) : undefined
        });
    }
});

module.exports = router;