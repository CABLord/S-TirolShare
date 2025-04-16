import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { weatherService } from '../services/api';
import WeatherWidget from '../components/WeatherWidget';
import { useThemeStore } from '../stores/themeStore';

const Home = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const { darkMode } = useThemeStore();
  
  useEffect(() => {
    const fetchDefaultWeather = async () => {
      try {
        setLoading(true);
        const data = await weatherService.getWeather('bozen');
        setWeather(data);
      } finally {
        setLoading(false);
      }
    };
    fetchDefaultWeather();
  }, []);

const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {

    e.preventDefault();
    if (!searchQuery) return;
    
    try {
      setLoading(true);
      const data = await weatherService.getWeather(searchQuery);
      setWeather(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <section className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg mb-8`}>
        <h1 className="text-3xl font-bold mb-4">Willkommen bei S-TirolShare</h1>
        <p className="mb-6">
          Entdecken Sie Südtirol durch Fahrgemeinschaften und öffentliche Verkehrsmittel.
        </p>
        
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="Zielort eingeben (z.B. Bozen)"
              className={`flex-grow p-2 rounded-l ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
              value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}

            />
            <button 
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white p-2 rounded-r"
            >
              Suchen
            </button>
          </div>
        </form>

        {loading ? (
          <div className="flex justify-center my-4">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-green-500"></div>
          </div>
        ) : weather ? (
          <WeatherWidget weather={weather} location={searchQuery || 'Bozen'} />
        ) : null}
        
        <h2 className="text-xl font-semibold mt-8 mb-3">Beliebte Ziele</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {['Bozen', 'Meran', 'Brixen', 'Bruneck'].map((city) => (
            <Link
              key={city}
              to={`/map?destination=${city.toLowerCase()}`}
              className={`p-4 rounded-lg text-center ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}
            >
              {city}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
          <h2 className="text-xl font-semibold mb-3">Fahrgemeinschaften</h2>
          <p className="mb-4">Teilen Sie Ihre Fahrt oder finden Sie eine passende Mitfahrgelegenheit.</p>
          <Link 
            to="/rideshare" 
            className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded inline-block"
          >
            Fahrgemeinschaften anzeigen
          </Link>
        </div>
        
        <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
          <h2 className="text-xl font-semibold mb-3">Transportkarte</h2>
          <p className="mb-4">Entdecken Sie Haltestellen und planen Sie Ihre Route durch Südtirol.</p>
          <Link 
            to="/map" 
            className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded inline-block"
          >
            Karte öffnen
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Home;
