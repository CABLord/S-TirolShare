import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuthStore();
  const { darkMode } = useThemeStore();
  const navigate = useNavigate();

const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {

    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {

    e.preventDefault();
    setError('');
    
    if (formData.password !== formData.confirmPassword) {
      return setError('Die Passwörter stimmen nicht überein');
    }
    
    try {
      setLoading(true);
      const { token, user } = await authService.register(
        formData.name,
        formData.email,
        formData.password
      );
      
      login(token, user);
      navigate('/');
    } catch (err: any) {

      setError(err.response?.data?.message || 'Registrierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10">
      <div className={`p-6 rounded-lg shadow-lg ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
        <h1 className="text-2xl font-bold mb-6 text-center">Registrieren</h1>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded border border-red-200">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-1">Name</label>
            <input
              type="text"
              name="name"
              required
              className={`w-full p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
              value={formData.name}
              onChange={handleChange}
            />
          </div>
          
          <div className="mb-4">
            <label className="block mb-1">E-Mail</label>
            <input
              type="email"
              name="email"
              required
              className={`w-full p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
              value={formData.email}
              onChange={handleChange}
            />
          </div>
          
          <div className="mb-4">
            <label className="block mb-1">Passwort</label>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              className={`w-full p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
              value={formData.password}
              onChange={handleChange}
            />
          </div>
          
          <div className="mb-6">
            <label className="block mb-1">Passwort bestätigen</label>
            <input
              type="password"
              name="confirmPassword"
              required
              minLength={6}
              className={`w-full p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
              value={formData.confirmPassword}
              onChange={handleChange}
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded disabled:opacity-50"
          >
            {loading ? 'Wird registriert...' : 'Registrieren'}
          </button>
        </form>
        
        <div className="mt-4 text-center">
          <span>Bereits registriert? </span>
          <Link to="/login" className="text-green-600 hover:underline">
            Hier anmelden
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
