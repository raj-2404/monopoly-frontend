import { useState, useContext } from 'react';
import { GameContext } from '../context/GameContext';
import { LogIn, Sparkles } from 'lucide-react';

export default function Login() {
    const { login } = useContext(GameContext);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username.trim() || !password.trim() || loading) return;
        setLoading(true);
        try {
            await login(username, password);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-height-screen items-center justify-center bg-radial from-[#1e1b4b] to-[#09090b] px-4 py-12 select-none w-full min-h-screen">
            <div className="relative w-full max-w-md">
                {/* Decorative glow elements */}
                <div className="absolute -top-12 -left-12 h-64 w-64 rounded-full bg-purple-600/20 blur-3xl"></div>
                <div className="absolute -bottom-12 -right-12 h-64 w-64 rounded-full bg-indigo-600/20 blur-3xl"></div>

                <div className="glass-premium relative overflow-hidden rounded-2xl p-8 text-center">
                    {/* Header */}
                    <div className="mb-8 flex flex-col items-center">
                        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 glow-primary">
                            <Sparkles className="h-8 w-8" />
                        </div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-white m-0">VYAPAR</h1>
                        <p className="mt-2 text-sm text-slate-400">The Ultimate Indian Monopoly Real-time Board Game</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="text-left">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Username</label>
                            <input
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Enter username"
                                className="mt-2 w-full rounded-lg bg-slate-900/50 border border-slate-700/50 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none transition-colors"
                            />
                        </div>

                        <div className="text-left">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Password</label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter password"
                                className="mt-2 w-full rounded-lg bg-slate-900/50 border border-slate-700/50 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none transition-colors"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className={`flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-purple-500 transition-colors focus:outline-none glow-primary cursor-pointer ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <LogIn className="h-4 w-4" />
                            {loading ? 'Signing In...' : 'Sign In / Register'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
