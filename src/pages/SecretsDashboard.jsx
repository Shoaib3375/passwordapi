import React, { useEffect, useState } from 'react'
import api from '../api'
import {useNavigate} from "react-router-dom";
import {clearAuthData} from "../utils/tokenUtils.jsx";

const SecretsDashboard = () => {
    const [secrets, setSecrets] = useState([])
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const navigate = useNavigate()


    useEffect(() => {
        let cancelled = false;
        let retryTimeout;

        const fetchSecrets = async () => {
            if (isLoading) return;

            setIsLoading(true);
            try {
                const res = await api.get('/secret/api/list');
                if (!cancelled) {
                    setSecrets(res.data.data.secrets);
                    setError('');
                }
            } catch (err) {
                if (cancelled) return;

                if (err === 'Token expired') {
                    clearAuthData();
                    navigate('/');
                    return;
                }

                if (err.response?.status === 429) {
                    setError('Too many requests. Please wait a moment...');
                    // Retry after 2 seconds
                    retryTimeout = setTimeout(fetchSecrets, 2000);
                    return;
                }

                const msg = err.response?.data?.message || err.message;
                setError(msg);
                if (err.response?.status === 401) {
                    clearAuthData();
                    navigate('/');
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        fetchSecrets();

        return () => {
            cancelled = true;
            if (retryTimeout) {
                clearTimeout(retryTimeout);
            }
        };
    }, [navigate]);


    return (
        <div>
            <h1 className="text-2xl font-bold mb-4">Your Secrets</h1>
            {error && <div className="bg-red-100 text-red-700 p-3 mb-4 rounded">{error}</div>}
            {!error && secrets.length === 0 && <div>No secrets found.</div>}
            <ul className="space-y-4">
                {secrets.map(secret => (
                    <li key={secret.id} className="bg-white p-4 rounded shadow">
                        <h2 className="font-semibold text-lg">{secret.title}</h2>
                        <p><strong>Username:</strong> {secret.username}</p>
                        <p><strong>Password:</strong> {secret.password}</p>
                        <p><strong>Note:</strong> {secret.note}</p>
                        <p><strong>Email:</strong> {secret.email}</p>
                        <p>
                            <strong>Website:</strong>{' '}
                            <a
                                href={secret.website}
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo-600 underline"
                            >
                                {secret.website}
                            </a>
                        </p>
                    </li>
                ))}
            </ul>
        </div>
    )
};

export default SecretsDashboard
