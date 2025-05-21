import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import 'leaflet/dist/leaflet.css';

// Components
import Navbar from './components/Navbar';

// Pages
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Rideshare from './pages/Rideshare';
import Map from './pages/Map';

const App: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const { darkMode } = useThemeStore();

  // Remove the checkAuth call since you don't have it in your store
  // Your persist middleware will handle restoring the auth state

  // Protected route component
  const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
  };

  return (
    <Router>
      <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route 
              path="/rideshare" 
              element={
                <ProtectedRoute>
                  <Rideshare />
                </ProtectedRoute>
              } 
            />
            <Route path="/map" element={<Map />} />
          </Routes>
        </main>
        <footer className="text-center py-4 mt-8 border-t">
          <p>© 2025 S-TirolShare - Mobilität in Südtirol</p>
        </footer>
      </div>
    </Router>
  );
};

export default App;