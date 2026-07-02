import { useContext, useState, useEffect } from 'react';
import { GameContext } from '../context/GameContext';
import { Crown, Play, CheckCircle, XCircle, LogOut } from 'lucide-react';

// All available token colors — matches the reference screenshot palette
const TOKEN_COLORS = [
    { id: 'lime',    hex: '#84cc16', label: 'Lime'    },
    { id: 'amber',   hex: '#f59e0b', label: 'Amber'   },
    { id: 'orange',  hex: '#f97316', label: 'Orange'  },
    { id: 'red',     hex: '#ef4444', label: 'Red'     },
    { id: 'blue',    hex: '#3b82f6', label: 'Blue'    },
    { id: 'cyan',    hex: '#06b6d4', label: 'Cyan'    },
    { id: 'teal',    hex: '#14b8a6', label: 'Teal'    },
    { id: 'green',   hex: '#22c55e', label: 'Green'   },
    { id: 'brown',   hex: '#92400e', label: 'Brown'   },
    { id: 'purple',  hex: '#a855f7', label: 'Purple'  },
    { id: 'pink',    hex: '#ec4899', label: 'Pink'    },
    { id: 'violet',  hex: '#7c3aed', label: 'Violet'  },
];

// Token circle with optional eyes when selected
function TokenCircle({ color, selected, onClick, size = 64 }) {
    return (
        <button
            onClick={onClick}
            className="relative flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer focus:outline-none"
            style={{
                width: size,
                height: size,
                backgroundColor: color.hex,
                boxShadow: selected
                    ? `0 0 0 3px #fff, 0 0 20px 4px ${color.hex}`
                    : `0 0 12px 2px ${color.hex}55`,
                transform: selected ? 'scale(1.15)' : 'scale(1)',
            }}
        >
            {/* Eyes when selected */}
            {selected && (
                <div className="flex gap-1.5 items-center justify-center">
                    {/* Left eye */}
                    <div className="relative bg-white rounded-full flex items-center justify-center"
                        style={{ width: 14, height: 14 }}>
                        <div className="bg-slate-900 rounded-full absolute"
                            style={{ width: 7, height: 7, bottom: 2, left: '50%', transform: 'translateX(-50%)' }} />
                    </div>
                    {/* Right eye */}
                    <div className="relative bg-white rounded-full flex items-center justify-center"
                        style={{ width: 14, height: 14 }}>
                        <div className="bg-slate-900 rounded-full absolute"
                            style={{ width: 7, height: 7, bottom: 2, left: '50%', transform: 'translateX(-50%)' }} />
                    </div>
                </div>
            )}
        </button>
    );
}

export default function Lobby() {
    const { user, room, leaveRoom, toggleReady, startGame } = useContext(GameContext);

    // Token picker state — persisted per username
    const storageKey = `vyapar_token_${user?.username}`;
    const [selectedToken, setSelectedToken] = useState(() => {
        const saved = localStorage.getItem(storageKey);
        return TOKEN_COLORS.find(t => t.id === saved) || TOKEN_COLORS[0];
    });
    const [tokenPicked, setTokenPicked] = useState(() => !!localStorage.getItem(storageKey));

    // Save chosen token to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem(storageKey, selectedToken.id);
        // Also save the hex so GameBoard can read it
        localStorage.setItem(`vyapar_token_hex_${user?.username}`, selectedToken.hex);
    }, [selectedToken, storageKey, user?.username]);

    if (!room) return null;

    const isHost = room.players.find(p => p.host)?.username === user.username;
    const allPlayersReady = room.players.filter(p => !p.host).every(p => p.ready);
    const canStart = room.players.length >= 2 && allPlayersReady;
    const currentPlayer = room.players.find(p => p.username === user.username);

    // ── TOKEN PICKER SCREEN ──────────────────────────────────────────────
    if (!tokenPicked) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-radial from-[#1e1b4b] to-[#09090b] px-4 py-12 w-full">
                <div className="flex flex-col items-center gap-8 w-full max-w-sm">
                    {/* Preview of selected token (big, centered, with eyes) */}
                    <div className="flex flex-col items-center gap-4">
                        <TokenCircle color={selectedToken} selected size={96} onClick={() => {}} />
                        <p className="text-white/60 text-sm font-semibold tracking-wide">{selectedToken.label}</p>
                    </div>

                    <p className="text-white text-xl font-bold tracking-wide">Select your player appearance:</p>

                    {/* Token grid — 4 columns */}
                    <div className="grid grid-cols-4 gap-5">
                        {TOKEN_COLORS.map(color => (
                            <TokenCircle
                                key={color.id}
                                color={color}
                                selected={selectedToken.id === color.id}
                                size={60}
                                onClick={() => setSelectedToken(color)}
                            />
                        ))}
                    </div>

                    {/* Join game button */}
                    <button
                        onClick={() => setTokenPicked(true)}
                        className="w-full flex items-center justify-center gap-3 rounded-xl bg-purple-600 hover:bg-purple-500 px-8 py-4 text-white font-bold text-base tracking-wide transition-all cursor-pointer shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                    >
                        Enter Lobby →
                    </button>
                </div>
            </div>
        );
    }

    // ── MAIN LOBBY SCREEN ────────────────────────────────────────────────
    return (
        <div className="flex min-height-screen items-center justify-center bg-radial from-[#1e1b4b] to-[#09090b] px-4 py-12 w-full min-h-screen">
            <div className="w-full max-w-xl">
                <div className="glass-premium rounded-2xl p-8">
                    {/* Header */}
                    <div className="mb-8 flex items-center justify-between border-b border-slate-700/50 pb-6">
                        <div className="text-left">
                            <p className="text-xs font-semibold uppercase tracking-wider text-purple-400">Waiting Lobby</p>
                            <h2 className="text-3xl font-extrabold text-white m-0">Lobby Code</h2>
                        </div>
                        <div className="rounded-xl bg-purple-500/10 border border-purple-500/30 px-6 py-2 text-2xl font-black tracking-widest text-purple-400 glow-primary select-all">
                            {room.roomCode}
                        </div>
                    </div>

                    {/* Player Cards List */}
                    <div className="space-y-4 mb-8">
                        <p className="text-left text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Players Joined ({room.players.length})</p>
                        {room.players.map((player) => {
                            const savedHex = localStorage.getItem(`vyapar_token_hex_${player.username}`);
                            const tokenColor = savedHex || '#a855f7';
                            return (
                                <div key={player.playerId} className="glass flex items-center justify-between rounded-xl p-4 transition-all hover:border-slate-600/50">
                                    <div className="flex items-center gap-4">
                                        {/* Token circle instead of dicebear avatar */}
                                        <div
                                            className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0"
                                            style={{
                                                backgroundColor: tokenColor,
                                                boxShadow: `0 0 10px 2px ${tokenColor}66`,
                                            }}
                                        >
                                            {/* Eyes */}
                                            <div className="flex gap-1 items-center">
                                                <div className="bg-white rounded-full relative" style={{ width: 9, height: 9 }}>
                                                    <div className="bg-slate-900 rounded-full absolute" style={{ width: 5, height: 5, bottom: 1, left: '50%', transform: 'translateX(-50%)' }} />
                                                </div>
                                                <div className="bg-white rounded-full relative" style={{ width: 9, height: 9 }}>
                                                    <div className="bg-slate-900 rounded-full absolute" style={{ width: 5, height: 5, bottom: 1, left: '50%', transform: 'translateX(-50%)' }} />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-white text-sm">{player.username}</span>
                                            {player.host && (
                                                <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                    <Crown className="h-3 w-3" />
                                                </span>
                                            )}
                                            {player.username === user.username && (
                                                <span className="rounded bg-slate-700/50 px-2 py-0.5 text-[10px] uppercase font-semibold text-slate-300">You</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {player.host ? (
                                            <span className="rounded bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 text-xs font-bold text-purple-400">Host</span>
                                        ) : (
                                            player.ready ? (
                                                <div className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                                                    <CheckCircle className="h-4 w-4" /> Ready
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1 text-xs font-bold text-slate-500">
                                                    <XCircle className="h-4 w-4" /> Waiting
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Change token button */}
                    <div className="flex items-center gap-3 mb-4">
                        <button
                            onClick={() => setTokenPicked(false)}
                            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                            <div className="h-5 w-5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedToken.hex, boxShadow: `0 0 6px ${selectedToken.hex}88` }} />
                            Change token
                        </button>
                    </div>

                    {/* Actions Panel */}
                    <div className="flex flex-col sm:flex-row gap-4 border-t border-slate-700/50 pt-6">
                        <button
                            onClick={leaveRoom}
                            className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-5 py-3.5 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-all cursor-pointer w-full sm:w-auto"
                        >
                            <LogOut className="h-4 w-4" />
                            Leave Room
                        </button>

                        <div className="flex-1 flex gap-4">
                            {!isHost && (
                                <button
                                    onClick={toggleReady}
                                    className={`flex-1 rounded-lg px-6 py-3.5 text-sm font-semibold text-white transition-all cursor-pointer ${
                                        currentPlayer?.ready
                                            ? 'bg-emerald-600 hover:bg-emerald-500 glow-success'
                                            : 'bg-purple-600 hover:bg-purple-500 glow-primary'
                                    }`}
                                >
                                    {currentPlayer?.ready ? 'Ready!' : 'Mark Ready'}
                                </button>
                            )}

                            {isHost && (
                                <button
                                    onClick={startGame}
                                    disabled={!canStart}
                                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-semibold text-white transition-all ${
                                        canStart
                                            ? 'bg-purple-600 hover:bg-purple-500 glow-primary cursor-pointer'
                                            : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
                                    }`}
                                >
                                    <Play className="h-4 w-4" />
                                    Start Match
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
