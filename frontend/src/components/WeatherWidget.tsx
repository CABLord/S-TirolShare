import React from 'react';
import { useThemeStore } from '../stores/themeStore';

// Aktualisierte Wetterbedingungen basierend auf der neuen API
type WeatherCondition = 'sunny' | 'partly-cloudy' | 'cloudy' | 'rain' | 'snow' | 'windy';

interface WeatherProps {
  weather: {
    temperature: number;
    condition: WeatherCondition;
    recommendation: string;
    humidity?: number;
    windSpeed?: number;
  };
  location: string;
}

const WeatherWidget: React.FC<WeatherProps> = ({ weather, location }) => {
  const { darkMode } = useThemeStore();
  
  // Icons dynamisch basierend auf der Bedingung laden
  const getIconPath = (condition: WeatherCondition) => {
    const iconMap = {
      'sunny': '/weather-icons/sun.svg',
      'partly-cloudy': '/weather-icons/cloud-sun.svg',
      'cloudy': '/weather-icons/cloud.svg',
      'rain': '/weather-icons/cloud-rain.svg',
      'snow': '/weather-icons/snow.svg',
      'windy': '/weather-icons/wind.svg'
    };
    return iconMap[condition] || '/weather-icons/sun.svg';
  };

  const getConditionText = (condition: WeatherCondition): string => {
    const translations: Record<WeatherCondition, string> = {
      'sunny': 'Sonnig',
      'partly-cloudy': 'Teilweise bewölkt',
      'cloudy': 'Bewölkt',
      'rain': 'Regen',
      'snow': 'Schnee',
      'windy': 'Windig'
    };
    return translations[condition];
  };

  return (
    <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg p-4 flex flex-col sm:flex-row items-center`}>
      <div className="flex items-center mb-3 sm:mb-0 sm:mr-6">
        <img 
          src={getIconPath(weather.condition)} 
          alt={weather.condition} 
          className="w-16 h-16 mr-3"
        />
        <div>
          <div className="text-2xl font-bold">{weather.temperature}°C</div>
          <div>{getConditionText(weather.condition)}</div>
        </div>
      </div>

      <div className="flex-grow">
        <div className="font-medium mb-1">Wetter in {location}</div>
        <div className="text-sm">{weather.recommendation}</div>
        {weather.humidity && (
          <div className="text-xs mt-1">Luftfeuchtigkeit: {weather.humidity}%</div>
        )}
        {weather.windSpeed && (
          <div className="text-xs">Wind: {weather.windSpeed} km/h</div>
        )}
      </div>
    </div>
  );
};

export default WeatherWidget;