import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import LogoutButton from '../components/LogoutButton';

const Layout = () => {
    return (
        <div className="min-h-screen flex">
            <aside className="w-60 bg-indigo-700 text-white p-4 space-y-4 flex flex-col">
                <h1 className="text-xl font-bold">🔐 Password Manager</h1>
                <nav className="space-y-2 flex-grow">
                    <Link to="/dashboard" className="block hover:underline">Secrets</Link>
                    <Link to="/generate" className="block hover:underline">Generate Password</Link>
                </nav>
                <LogoutButton />
            </aside>
            <main className="flex-1 p-6 bg-gray-100">
                <Outlet />
            </main>
        </div>
    );
};

export default Layout;
