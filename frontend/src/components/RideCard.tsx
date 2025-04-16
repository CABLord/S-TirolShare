import React from 'react';
import { formatDistance } from 'date-fns';
import { de } from 'date-fns/locale';
import { useThemeStore } from '../stores/themeStore';

interface RideProps {
  ride: {
    id: number;
    driverName: string;
    from: string;
    to: string;
    date: string;
    time: string;
    price: number;
    seats: number;
    availableSeats: number;
    createdAt: string;
  };
  onBookRequest: () => void; // Ensure this is correctly typed
}


const RideCard: React.FC<RideProps> = ({ ride, onBookRequest }) => {
  const { darkMode } = useThemeStore();
  
const formatDate = (dateStr: string): string => {

    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };
  
const formatTime = (timeStr: string): string => {

    return timeStr.substring(0, 5); // HH:MM format
  };
  
  const timeAgo = (dateStr: string): string => {

    return formatDistance(new Date(dateStr), new Date(), {
      addSuffix: true,
      locale: de,
    });
  };

  return (
    <div className={`${darkMode ? 'bg-gray-700' : 'bg-white'} rounded-lg p-4 shadow`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3">
        <div className="flex items-center mb-2 sm:mb-0">
          <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white mr-3">
            {ride.driverName.substring(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="font-medium">{ride.driverName}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {timeAgo(ride.createdAt)}
            </div>
          </div>
        </div>
        
        <div className="font-bold text-lg">{ride.price.toFixed(2)} €</div>
      </div>
      
      <div className="flex flex-col mb-4">
        <div className="flex items-center mb-2">
          <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs mr-2">A</div>
          <div>{ride.from}</div>
        </div>
        <div className="border-l-2 border-dotted border-gray-300 dark:border-gray-600 h-4 ml-3"></div>
        <div className="flex items-center">
          <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white text-xs mr-2">B</div>
          <div>{ride.to}</div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className={`p-2 rounded ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
          <div className="text-xs text-gray-500 dark:text-gray-400">Datum</div>
          <div>{formatDate(ride.date)}</div>
        </div>
        <div className={`p-2 rounded ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
          <div className="text-xs text-gray-500 dark:text-gray-400">Uhrzeit</div>
          <div>{formatTime(ride.time)}</div>
        </div>
      </div>
      
      <div className="flex justify-between items-center">
        <div>
          <span className={`${ride.availableSeats > 0 ? 'text-green-600' : 'text-red-600'} font-medium`}>
            {ride.availableSeats}
          </span> von {ride.seats} Plätzen verfügbar
        </div>
        
        <button
          onClick={onBookRequest}
          disabled={ride.availableSeats === 0}
          className="bg-green-600 hover:bg-green-700 text-white py-1 px-3 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Buchen
        </button>
      </div>
    </div>
  );
};

export default RideCard;
