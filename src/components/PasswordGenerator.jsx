import React, { useState } from 'react';
import api from '../api';

const PasswordGenerator = () => {
    const [length, setLength] = useState(12);
    const [includeSpecial, setIncludeSpecial] = useState(true);
    const [generated, setGenerated] = useState('');
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    const generatePassword = async () => {
        setLoading(true);
        try {
            const res = await api.post('/secret/api/generatepassword', {
                length,
                include_special_symbol: includeSpecial,
            });
            setGenerated(res.data.password);
            setCopied(false);
        } catch (err) {
            console.error('Failed to generate password:', err);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generated).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <div className="p-6 bg-white rounded-xl shadow-lg max-w-lg w-full mx-auto mt-10">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">🔐 Password Generator</h2>
            <div className="space-y-4">
                <div>
                    <label className="block mb-1 font-medium text-sm text-gray-700">Password Length</label>
                    <input
                        type="number"
                        min={6}
                        max={64}
                        value={length}
                        onChange={(e) => setLength(Number(e.target.value))}
                        className="border border-gray-300 px-4 py-2 rounded-md w-full"
                    />
                </div>
                <div className="flex items-center space-x-2">
                    <input
                        type="checkbox"
                        checked={includeSpecial}
                        onChange={() => setIncludeSpecial(!includeSpecial)}
                        className="h-4 w-4 text-indigo-600"
                    />
                    <label className="text-sm text-gray-700">Include special symbols</label>
                </div>
                <button
                    onClick={generatePassword}
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2 rounded-md transition disabled:opacity-50"
                >
                    {loading ? 'Generating...' : 'Generate Password'}
                </button>
                {generated && (
                    <div className="mt-4">
                        <div className="bg-gray-100 border text-sm rounded flex items-center justify-between px-4 py-2">
                            <span className="break-all">{generated}</span>
                            <button
                                onClick={copyToClipboard}
                                className="text-indigo-600 text-xs ml-4 hover:underline"
                            >
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PasswordGenerator;
