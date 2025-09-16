import React, { useEffect, useState, useRef } from 'react'
import api from '../api'
import { useNavigate } from "react-router-dom"
import { clearAuthData } from "../utils/tokenUtils.jsx"

// Dev-only guard to avoid double effect run in React 18 StrictMode
let shouldSkipNextEffectInDev = true

const SecretsDashboard = () => {
    const [secrets, setSecrets] = useState([])
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [editSecret, setEditSecret] = useState(null)
    const [editForm, setEditForm] = useState({ title: '', username: '', password: '', email: '', website: '', note: '' })

    const navigate = useNavigate()

    // Throttling and retry guards to avoid rate limiting
    const inFlightRef = useRef(false)
    const lastFetchAtRef = useRef(0)
    const retryCountRef = useRef(0)
    const retryTimeoutRef = useRef(null)

    useEffect(() => {
        // In React 18 StrictMode (dev), effects run twice. Skip the first run to avoid duplicate loads.
        if (import.meta?.env?.MODE !== 'production' && shouldSkipNextEffectInDev) {
            shouldSkipNextEffectInDev = false
            return
        }

        let cancelled = false
        const MIN_FETCH_INTERVAL_MS = 800
        const inFlightRefLocal = inFlightRef
        const lastFetchAtRefLocal = lastFetchAtRef
        const retryCountRefLocal = retryCountRef
        const retryTimeoutRefLocal = retryTimeoutRef

        const scheduleRetry = (delayMs) => {
            if (retryTimeoutRefLocal.current) clearTimeout(retryTimeoutRefLocal.current)
            retryTimeoutRefLocal.current = setTimeout(() => {
                if (!cancelled) fetchSecrets()
            }, delayMs)
        }

        const fetchSecrets = async () => {
            const now = Date.now()
            if (inFlightRefLocal.current) return
            if (now - lastFetchAtRefLocal.current < MIN_FETCH_INTERVAL_MS) return

            inFlightRefLocal.current = true
            lastFetchAtRefLocal.current = now
            setIsLoading(true)
            let willRetry = false
            try {
                const res = await api.get('/secret/api/list')
                if (!cancelled) {
                    setSecrets(res.data.data.secrets)
                    setError('')
                    retryCountRefLocal.current = 0
                }
            } catch (err) {
                if (cancelled) return
                if (err === 'Token expired') {
                    clearAuthData()
                    navigate('/')
                    return
                }
                const status = err.response?.status
                if (status === 429) {
                    // Use Retry-After if provided or exponential backoff
                    const retryAfter = err.response?.headers?.['retry-after']
                    let delay = 1500 * Math.pow(2, retryCountRefLocal.current)
                    const parsed = Number(retryAfter)
                    if (!Number.isNaN(parsed) && parsed > 0) {
                        delay = Math.max(delay, parsed * 1000)
                    }
                    if (retryCountRefLocal.current < 3) {
                        retryCountRefLocal.current += 1
                        setError('Too many requests. Retrying...')
                        willRetry = true
                        scheduleRetry(delay)
                        return
                    } else {
                        setError('Too many requests. Please try again later.')
                        return
                    }
                }
                const msg = err.response?.data?.message || err.message
                setError(msg)
                if (status === 401) {
                    clearAuthData()
                    navigate('/')
                }
            } finally {
                if (!cancelled && !willRetry) setIsLoading(false)
                inFlightRefLocal.current = false
            }
        }

        fetchSecrets()
        return () => {
            cancelled = true
            if (retryTimeoutRefLocal.current) clearTimeout(retryTimeoutRefLocal.current)
            // Reset dev guard after a real effect run so future mounts still skip the first dev run
            if (import.meta?.env?.MODE !== 'production') {
                shouldSkipNextEffectInDev = true
            }
        }
    }, [navigate])

    const handleDelete = async (id) => {
        try {
            await api.delete(`/secret/api/delete/${id}`)
            setSecrets(prev => prev.filter(s => s.id !== id))
        } catch (err) {
            const msg = err.response?.data?.message || err.message
            setError(msg)
        }
    }

    const openEditForm = (secret) => {
        setEditSecret(secret)
        setEditForm({ ...secret })
    }

    const handleEditChange = (e) => {
        setEditForm({ ...editForm, [e.target.name]: e.target.value })
    }

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        try {
            const { id, ...updatedData } = editForm;
            const res = await api.put(`/secret/api/update/${id}`, updatedData);
            setSecrets(prev =>
                prev.map(secret => (secret.id === id ? res.data.data.secret : secret))
            );
            setEditSecret(null);
            setError(''); // clear any previous error
            alert('Secret updated successfully');
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            setError(msg);
        }
    };


    return (
        <div className="p-4 max-w-4xl mx-auto">
            <h1 className="text-xl font-semibold mb-4">Your Secrets</h1>
            {error && <div className="bg-red-100 text-red-700 p-2 rounded mb-3">{error}</div>}
            {isLoading && <div>Loading...</div>}
            {!error && !isLoading && secrets.length === 0 && <div>No secrets found.</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {secrets.map(secret => (
                    <div key={secret.id} className="bg-white border p-3 rounded-md shadow-sm text-sm space-y-1">
                        <div className="font-medium text-base truncate">{secret.title}</div>
                        <div><span className="font-semibold">User:</span> {secret.username}</div>
                        <div><span className="font-semibold">Pass:</span> {secret.password}</div>
                        <div><span className="font-semibold">Email:</span> {secret.email}</div>
                        <div><span className="font-semibold">Note:</span> {secret.note}</div>
                        {secret.website && (
                            <div>
                                <span className="font-semibold">Site:</span>{' '}
                                <a href={secret.website} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                                    {secret.website}
                                </a>
                            </div>
                        )}
                        <div className="pt-2 flex justify-end gap-2">
                            <button onClick={() => openEditForm(secret)} className="bg-yellow-400 text-white text-xs px-2 py-1 rounded">
                                Edit
                            </button>
                            <button onClick={() => handleDelete(secret.id)} className="bg-red-500 text-white text-xs px-2 py-1 rounded">
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {editSecret && (
                <div className="fixed inset-0 bg-transparent bg-opacity-50 flex items-center justify-center z-50">
                    <form onSubmit={handleEditSubmit} className="bg-white p-6 rounded shadow w-full max-w-sm space-y-4">
                        <h2 className="text-lg font-bold">Edit Secret</h2>
                        {['title', 'username', 'password', 'email', 'website', 'note'].map(field => (
                            <div key={field}>
                                <label className="block text-sm font-medium capitalize">{field}</label>
                                <input
                                    name={field}
                                    value={editForm[field]}
                                    onChange={handleEditChange}
                                    className="w-full border border-gray-300 p-2 rounded text-sm"
                                />
                            </div>
                        ))}
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setEditSecret(null)} className="bg-gray-500 text-white px-4 py-2 text-sm rounded">
                                Cancel
                            </button>
                            <button type="submit" className="bg-blue-600 text-white px-4 py-2 text-sm rounded">
                                Save
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    )
}

export default SecretsDashboard
