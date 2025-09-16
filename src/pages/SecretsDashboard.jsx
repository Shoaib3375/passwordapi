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

    // Create panel state
    const [showCreate, setShowCreate] = useState(false)
    const [createForm, setCreateForm] = useState({ title: '', username: '', password: '', email: '', website: '', note: '' })
    const [createLoading, setCreateLoading] = useState(false)
    const [createError, setCreateError] = useState('')


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

    // Create form handlers
    const handleCreateChange = (e) => {
        setCreateForm({ ...createForm, [e.target.name]: e.target.value })
    }

    const resetCreateForm = () => {
        setCreateForm({ title: '', username: '', password: '', email: '', website: '', note: '' })
        setCreateError('')
        setCreateLoading(false)
    }

    const closeCreatePanel = () => {
        setShowCreate(false)
        resetCreateForm()
    }

    const refreshSecretsAfterCreate = async () => {
        // After creating, avoid hammering the list endpoint which may be rate limited.
        // Respect Retry-After when present and use a short capped exponential backoff.
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
        let attempt = 0
        let delay = 600 // start with a short delay so the server can settle
        const MAX_RETRIES = 3
        while (attempt <= MAX_RETRIES) {
            try {
                if (attempt > 0) {
                    await sleep(delay)
                } else {
                    // tiny initial delay even before first attempt to reduce immediate 429 after POST
                    await sleep(300)
                }
                const res = await api.get('/secret/api/list')
                setSecrets(res.data?.data?.secrets || [])
                setError('')
                return
            } catch (err) {
                const status = err?.response?.status
                if (status === 429 && attempt < MAX_RETRIES) {
                    const retryAfter = err.response?.headers?.['retry-after']
                    const parsed = Number(retryAfter)
                    // if server suggests a wait, honor it (seconds)
                    if (!Number.isNaN(parsed) && parsed > 0) {
                        delay = Math.max(delay * 2, parsed * 1000)
                    } else {
                        delay = Math.min(delay * 2, 4000)
                    }
                    attempt += 1
                    continue
                }
                // Don't override a visible createError, but show a general error if needed
                const msg = err?.response?.data?.message || err.message
                setError(msg)
                return
            }
        }
    }

    const handleCreateSubmit = async (e) => {
        e.preventDefault()
        if (createLoading) return
        setCreateLoading(true)
        setCreateError('')
        try {
            await api.post('/secret/api/create', {
                title: createForm.title,
                username: createForm.username,
                password: createForm.password,
                note: createForm.note,
                email: createForm.email,
                website: createForm.website,
            })
            await refreshSecretsAfterCreate()
            closeCreatePanel()
        } catch (err) {
            const status = err?.response?.status
            if (status === 429) {
                const retryAfter = err.response?.headers?.['retry-after']
                let msg = 'Too many requests. Please wait a moment and try again.'
                if (retryAfter) msg += ` Retry after ${retryAfter} seconds.`
                setCreateError(msg)
            } else if (status === 401) {
                setCreateError('Your session expired. Please log in again.')
                clearAuthData()
                navigate('/')
                return
            } else {
                const msg = err.response?.data?.message || err.message
                setCreateError(msg)
            }
        } finally {
            setCreateLoading(false)
        }
    }


    return (
        <div className="p-4 max-w-4xl mx-auto">
            <div className="flex items-center justify-start gap-3 mb-4">
                <button
                    onClick={() => { setShowCreate(true); setCreateError(''); }}
                    className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-2 rounded"
                >
                    + Add Secret
                </button>
                <h1 className="text-xl font-semibold">Your Secrets</h1>
            </div>
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

            {showCreate && (
                <div className="fixed inset-0 z-40 flex">
                    {/* overlay */}
                    <div className="flex-1 bg-transparent bg-opacity-30" onClick={closeCreatePanel} />
                    {/* right panel */}
                    <div className="w-full max-w-md h-full bg-white shadow-xl border-l p-5 overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold">Create Secret</h2>
                            <button onClick={closeCreatePanel} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>
                        {createError && (
                            <div className="bg-red-100 text-red-700 p-2 rounded mb-3 text-sm">{createError}</div>
                        )}
                        <form onSubmit={handleCreateSubmit} className="space-y-3 text-sm">
                            {['title','username','password','email','website'].map((field) => (
                                <div key={field}>
                                    <label className="block font-medium capitalize mb-1">{field}</label>
                                    <input
                                        type={field === 'password' ? 'password' : 'text'}
                                        name={field}
                                        value={createForm[field]}
                                        onChange={handleCreateChange}
                                        required={field === 'title'}
                                        className="w-full border border-gray-300 p-2 rounded"
                                    />
                                </div>
                            ))}
                            <div>
                                <label className="block font-medium mb-1">Note</label>
                                <textarea
                                    name="note"
                                    value={createForm.note}
                                    onChange={handleCreateChange}
                                    className="w-full border border-gray-300 p-2 rounded min-h-[80px]"
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={closeCreatePanel} className="bg-gray-500 text-white px-4 py-2 rounded">
                                    Cancel
                                </button>
                                <button type="submit" disabled={createLoading} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded">
                                    {createLoading ? 'Creating...' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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
