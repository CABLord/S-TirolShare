import { useNavigate } from 'react-router-dom';
import { rideshareService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import RideCard from '../components/RideCard';
import React, { useState, useEffect, useCallback } from 'react';

interface Ride {
  id: number;
  driverName: string;
  from: string;
  to: string;
  date: string;
  time: string;
  price: number;
  seats: number;               // Changed from seatsAvailable
  availableSeats: number;      // Changed from seatsAvailable
  createdAt: string;
}

const Rideshare = () => {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filters, setFilters] = useState({ from: '', to: '', date: '' });
  const [newRide, setNewRide] = useState({
    from: '', to: '', date: '', time: '', price: '', seats: ''
  });

  const { isAuthenticated } = useAuthStore();
  const { darkMode } = useThemeStore();
  const navigate = useNavigate();

  const fetchRides = useCallback(async () => {
    try {
      setLoading(true);
      const data = await rideshareService.getRides(filters);
      setRides(data);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateRide = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
  
    try {
      const rideData = {
        ...newRide,
        date: new Date(`${newRide.date}T${newRide.time}`), // Kombiniere Datum und Zeit
        price: parseFloat(newRide.price),
        seats: parseInt(newRide.seats),
      };
      await rideshareService.createRide(rideData);
      setShowCreateModal(false);
      setNewRide({ from: '', to: '', date: '', time: '', price: '', seats: '' });
      fetchRides();
    } catch (error) {
      console.error('Error creating ride:', error);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Fahrgemeinschaften</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded"
          >
            Fahrgemeinschaft anbieten
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); fetchRides(); }} className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block mb-1">Von</label>
              <input
                type="text"
                name="from"
                className={`w-full p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
                placeholder="Startort"
                value={filters.from}
                onChange={handleFilterChange}
              />
            </div>
            <div>
              <label className="block mb-1">Nach</label>
              <input
                type="text"
                name="to"
                className={`w-full p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
                placeholder="Zielort"
                value={filters.to}
                onChange={handleFilterChange}
              />
            </div>
            <div>
              <label className="block mb-1">Datum</label>
              <input
                type="date"
                name="date"
                className={`w-full p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
                value={filters.date}
                onChange={handleFilterChange}
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded w-full"
              >
                Suchen
              </button>
            </div>
          </div>
        </form>

        {loading ? (
          <div className="flex justify-center my-8">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
          </div>
        ) : rides.length === 0 ? (
          <div className={`p-8 text-center rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <p className="text-lg">Keine Fahrgemeinschaften gefunden.</p>
            <p className="mt-2">Versuchen Sie es mit anderen Filtern oder bieten Sie selbst eine Fahrt an.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {rides.map((ride) => (
              <RideCard 
                key={ride.id} 
                ride={ride} 
                onBookRequest={() => navigate(isAuthenticated ? `/rideshare/${ride.id}` : '/login')}
              />
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-md p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-xl`}>
            <h2 className="text-xl font-bold mb-4">Neue Fahrgemeinschaft anbieten</h2>
            <form onSubmit={handleCreateRide}>
              <div className="mb-4">
                <label className="block mb-1">Von</label>
                <input
                  type="text"
                  name="from"
                  required
                  className={`w-full p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
                  value={newRide.from}
                  onChange={(e) => setNewRide({...newRide, from: e.target.value})}
                />
              </div>
              <div className="mb-4">
                <label className="block mb-1">Nach</label>
                <input
                  type="text"
                  name="to"
                  required
                  className={`w-full p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
                  value={newRide.to}
                  onChange={(e) => setNewRide({...newRide, to: e.target.value})}
                />
              </div>
              <div className="mb-4">
                <label className="block mb-1">Datum</label>
                <input
                  type="date"
                  name="date"
                  required
                  className={`w-full p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
                  value={newRide.date}
                  onChange={(e) => setNewRide({...newRide, date: e.target.value})}
                />
              </div>
              <div className="mb-4">
                <label className="block mb-1">Uhrzeit</label>
                <input
                  type="time"
                  name="time"
                  required
                  className={`w-full p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
                  value={newRide.time}
                  onChange={(e) => setNewRide({...newRide, time: e.target.value})}
                />
              </div>
              <div className="mb-4">
                <label className="block mb-1">Preis</label>
                <input
                  type="number"
                  name="price"
                  required
                  className={`w-full p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
                  value={newRide.price}
                  onChange={(e) => setNewRide({...newRide, price: e.target.value})}
                />
              </div>
              <div className="mb-4">
                <label className="block mb-1">Sitzplätze</label>
                <input
                  type="number"
                  name="seats"
                  required
                  className={`w-full p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
                  value={newRide.seats}
                  onChange={(e) => setNewRide({...newRide, seats: e.target.value})}
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className={`py-2 px-4 rounded ${darkMode ? 'bg-gray-600' : 'bg-gray-300'}`}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded"
                >
                  Erstellen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Rideshare;