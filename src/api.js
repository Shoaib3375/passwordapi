import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8080',
    withCredentials: true,  // Usually false for JWT, true if cookies used
});

// Add JWT token from localStorage to every request if valid
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    console.log('Sending token:', token);
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;
