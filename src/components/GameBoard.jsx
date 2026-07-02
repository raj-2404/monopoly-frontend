import { useContext, useState, useEffect } from 'react';
import { GameContext } from '../context/GameContext';
import { boardData, propertyCatalogById } from '../utils/boardData';
import gameRules from '../config/game-rules.json';
import { 
    Dice5, 
    Home as HomeIcon, 
    DollarSign, 
    ShieldAlert, 
    LogOut,
    Building2,
    Lock,
    Unlock,
    UserCheck
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Board token — the cute circle-with-eyes badge that moves on the board ────
function BoardToken({ username, size = 22 }) {
    const tokenHex = localStorage.getItem(`vyapar_token_hex_${username}`) || '#a855f7';
    const eyeOuter = Math.round(size * 0.32);
    const eyeInner = Math.round(size * 0.18);
    return (
        <div
            title={username}
            style={{
                width: size,
                height: size,
                backgroundColor: tokenHex,
                borderRadius: '50%',
                boxShadow: `0 0 8px 2px ${tokenHex}99, 0 0 0 1.5px rgba(0,0,0,0.8)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                position: 'relative',
            }}
        >
            {/* Eyes */}
            <div style={{ display: 'flex', gap: Math.round(size * 0.08), alignItems: 'center', marginTop: Math.round(size * 0.05) }}>
                {[0, 1].map(i => (
                    <div key={i} style={{
                        width: eyeOuter, height: eyeOuter,
                        backgroundColor: '#fff',
                        borderRadius: '50%',
                        position: 'relative',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            width: eyeInner, height: eyeInner,
                            backgroundColor: '#111',
                            borderRadius: '50%',
                            position: 'absolute',
                            bottom: 1,
                            left: '50%',
                            transform: 'translateX(-50%)',
                        }} />
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Dot positions for each dice face ─────────────────────────────────────────
// Each entry is an array of [cx, cy] percentage positions within the die face
const DICE_DOTS = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
};

function DiceFace({ value, isDouble }) {
    const dots = DICE_DOTS[value] || [];
    const size = 52;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
            style={{
                filter: isDouble
                    ? 'drop-shadow(0 0 10px rgba(250,204,21,0.8))'
                    : 'drop-shadow(0 0 8px rgba(168,85,247,0.5))',
                borderRadius: '18px',
            }}
        >
            {/* Dice body */}
            <rect
                x="2" y="2" width="96" height="96" rx="18" ry="18"
                fill="url(#diceGrad)"
                stroke={isDouble ? 'rgba(250,204,21,0.7)' : 'rgba(168,85,247,0.5)'}
                strokeWidth="2.5"
            />
            {/* Gradient fill */}
            <defs>
                <linearGradient id="diceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1e1b4b" />
                    <stop offset="100%" stopColor="#0f0a23" />
                </linearGradient>
                {/* Inner gloss */}
                <radialGradient id="diceGloss" cx="30%" cy="25%" r="50%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </radialGradient>
            </defs>
            {/* Gloss layer */}
            <rect x="2" y="2" width="96" height="96" rx="18" ry="18" fill="url(#diceGloss)" />
            {/* Dots */}
            {dots.map(([cx, cy], i) => (
                <circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r="9"
                    fill={isDouble ? '#fde047' : '#a855f7'}
                    style={{ filter: `drop-shadow(0 0 3px ${isDouble ? '#fde047' : '#a855f7'})` }}
                />
            ))}
        </svg>
    );
}

export default function GameBoard() {
    const { 
        user, 
        game, 
        dice, 
        logs, 
        leaveRoom, 
        sendGameAction,
        proposeTrade,
        fetchPendingTrades,
        acceptTrade,
        rejectTrade,
        cancelTrade
    } = useContext(GameContext);

    const [activeTab, setActiveTab] = useState('actions'); // 'actions' | 'assets' | 'logs'
    const [selectedProperty, setSelectedProperty] = useState(null);

    // Trade states
    const [pendingTrades, setPendingTrades] = useState([]);
    const [showTradeModal, setShowTradeModal] = useState(false);
    const [tradePartner, setTradePartner] = useState(null);
    const [offeredCash, setOfferedCash] = useState(0);
    const [requestedCash, setRequestedCash] = useState(0);
    const [offeredProperties, setOfferedProperties] = useState([]);
    const [requestedProperties, setRequestedProperties] = useState([]);
    const [selectedPlayerForMenu, setSelectedPlayerForMenu] = useState(null);
    const [actionPending, setActionPending] = useState(false);

    useEffect(() => {
        setActionPending(false);
    }, [game]);

    // Safety timeout to clear pending actions in case of network issues
    useEffect(() => {
        if (actionPending) {
            const timer = setTimeout(() => {
                setActionPending(false);
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [actionPending]);

    // Fetch pending trades when game changes
    useEffect(() => {
        if (game) {
            fetchPendingTrades().then(trades => {
                setPendingTrades(trades || []);
            });
        }
    }, [game]);

    const isColorGroupImproved = (group) => {
        if (!group) return false;
        const groupProperties = game.properties.filter(p => {
            const cat = propertyCatalogById[p.propertyId];
            return cat && cat.group === group;
        });
        return groupProperties.some(p => p.developmentLevel > 0);
    };

    const getPropertyImagePath = (name, type) => {
        const value = name || type;
        if (!value) return '';
        let cleanName = value.toLowerCase().replace(/\s+/g, '_');
        if (cleanName === 'bangalore') cleanName = 'bengaluru';
        return `/images/${cleanName}.png`;
    };

    const getPropertyImageKey = (property) => (
        property?.propertyId ?? property?.propertyName ?? property?.name ?? ''
    );

    if (!game) return null;

    const me = game.players.find(p => p.username?.toLowerCase() === user?.username?.toLowerCase());
    if (!me) {
        console.error('Logged in user not found in game players list:', user?.username, game?.players);
        return (
            <div className="min-h-screen bg-[#06080f] text-slate-100 flex flex-col items-center justify-center p-4 text-center">
                <p className="text-red-400 font-bold text-lg">Error: Player "{user?.username || 'Unknown'}" not found in this match.</p>
                <p className="text-slate-400 text-xs mt-1">Available players: {game.players.map(p => p.username).join(', ')}</p>
                <button 
                    onClick={leaveRoom} 
                    className="mt-6 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-white font-semibold cursor-pointer"
                >
                    Return to Home
                </button>
            </div>
        );
    }

    const isMyTurn = game.currentTurnPlayerId === me.playerId;
    const isJailed = me.status === 'IN_JAIL';
    const isRecovering = me.status === 'RECOVERY';
    const currentTile = boardData[Number(me.position)];
    const currentProperty = currentTile?.propertyId
        ? {
            ...propertyCatalogById[currentTile.propertyId],
            ...game.properties.find(p => p.propertyId === currentTile.propertyId)
        }
        : null;
    const pendingAction = (game.pendingAction || 'NONE').toUpperCase();
    const hasRolled = Boolean(
        game.hasRolled ??
        game.rolled ??
        game.diceRolled ??
        dice ??
        (pendingAction !== 'NONE' && pendingAction !== 'ROLL_DICE')
    );
    const canBuyCurrentProperty = Boolean(
        currentProperty &&
        !currentProperty.ownerId &&
        ['BUY_PROPERTY', 'PURCHASE_PROPERTY', 'BUY_ESTATE', 'PROPERTY_PURCHASE'].includes(pendingAction)
    );

    const turnPlayer = game.players.find(p => p.playerId === game.currentTurnPlayerId);
    const turnPlayerTile = turnPlayer ? boardData[Number(turnPlayer.position)] : null;
    const turnPlayerProperty = turnPlayerTile?.propertyId
        ? {
            ...propertyCatalogById[turnPlayerTile.propertyId],
            ...game.properties.find(p => p.propertyId === turnPlayerTile.propertyId)
        }
        : null;
    const showUnownedCard = Boolean(
        turnPlayerProperty &&
        !turnPlayerProperty.ownerId
    );
    // Color mapper for board properties
    const groupColors = {
        'DARK_BLUE': 'bg-blue-600',
        'GREEN': 'bg-emerald-600',
        'RED': 'bg-rose-600',
        'YELLOW': 'bg-amber-500',
        'RAIL_ELECTRIC': 'bg-white',
        'AIR_WATER': 'bg-cyan-600',
        'ROAD_BUS': 'bg-slate-500'
    };

    // Color indicators for player ownership borders
    const playerColors = [
        'border-red-700 shadow-[inset_0_0_16px_rgba(185,28,28,0.7)]', 
        'border-blue-700 shadow-[inset_0_0_16px_rgba(29,78,216,0.7)]',   
        'border-green-700 shadow-[inset_0_0_16px_rgba(21,128,61,0.7)]', 
        'border-orange-700 shadow-[inset_0_0_16px_rgba(194,65,12,0.7)]',  
        'border-purple-800 shadow-[inset_0_0_16px_rgba(107,33,168,0.7)]',    
        'border-[#4e342e] shadow-[inset_0_0_16px_rgba(78,52,46,0.7)]'    
    ];

    const getOwnerColorClass = (ownerId) => {
        if (!ownerId) return '';
        const idx = game.players.findIndex(p => p.playerId === ownerId);
        return idx !== -1 ? playerColors[idx % playerColors.length] : '';
    };

    const playerTextColors = [
        'text-red-400 fill-red-400',
        'text-blue-400 fill-blue-400',
        'text-green-400 fill-green-400',
        'text-orange-400 fill-orange-400',
        'text-purple-400 fill-purple-400',
        'text-[#d7ccc8] fill-[#d7ccc8]'
    ];

    const getPlayerColorClass = (ownerId) => {
        if (!ownerId) return 'text-emerald-400 fill-emerald-400';
        const idx = game.players.findIndex(p => p.playerId === ownerId);
        return idx !== -1 ? playerTextColors[idx % playerTextColors.length] : 'text-emerald-400 fill-emerald-400';
    };

    const playerBgColors = [
        'bg-red-800/70', 
        'bg-blue-800/70',   
        'bg-green-800/70', 
        'bg-orange-800/70',  
        'bg-purple-900/70',    
        'bg-[#3e2723]/70'    
    ];

    const getPlayerBgColorClass = (ownerId) => {
        if (!ownerId) return '';
        const idx = game.players.findIndex(p => p.playerId === ownerId);
        return idx !== -1 ? playerBgColors[idx % playerBgColors.length] : '';
    };

    // Raw solid hex colors per player — prefer localStorage token choice, fallback to defaults
    const playerRawColors = ['#b91c1c', '#1d4ed8', '#15803d', '#c2410c', '#6b21a8', '#4e342e'];
    const getPlayerRawColor = (ownerId) => {
        if (!ownerId) return null;
        const ownerPlayer = game.players.find(p => p.playerId === ownerId);
        if (ownerPlayer?.username) {
            const saved = localStorage.getItem(`vyapar_token_hex_${ownerPlayer.username}`);
            if (saved) return saved;
        }
        const idx = game.players.findIndex(p => p.playerId === ownerId);
        return idx !== -1 ? playerRawColors[idx % playerRawColors.length] : null;
    };

    const getPlayerBadgeClass = (playerId) => {
        const idx = game.players.findIndex(p => p.playerId === playerId);
        const badgeColors = [
            'bg-red-800 text-white shadow-[0_0_8px_rgba(185,28,28,0.6)] border-red-600/50',
            'bg-blue-800 text-white shadow-[0_0_8px_rgba(29,78,216,0.6)] border-blue-600/50',
            'bg-green-800 text-white shadow-[0_0_8px_rgba(21,128,61,0.6)] border-green-600/50',
            'bg-orange-700 text-white shadow-[0_0_8px_rgba(234,88,12,0.6)] border-orange-500/50',
            'bg-purple-900 text-white shadow-[0_0_8px_rgba(107,33,168,0.6)] border-purple-700/50',
            'bg-[#3e2723] text-white shadow-[0_0_8px_rgba(62,39,35,0.6)] border-[#4e342e]/50'
        ];
        return idx !== -1 ? badgeColors[idx % badgeColors.length] : 'bg-slate-600 border-slate-400';
    };

    const getOwnerName = (ownerId) => {
        if (!ownerId) return '';
        const p = game.players.find(pl => pl.playerId === ownerId);
        return p ? p.username : '';
    };

    const liveSelectedProperty = selectedProperty
        ? {
            ...selectedProperty,
            ...game.properties.find(p => p.propertyId === selectedProperty.propertyId)
          }
        : null;

    const ownedInGroup = liveSelectedProperty
        ? game.properties.filter(p => 
            p.group === liveSelectedProperty.group && 
            p.ownerId === me.playerId && 
            !p.mortgaged
          ).length
        : 0;

    const isStandingOnSelected = Boolean(
        currentProperty &&
        liveSelectedProperty &&
        currentProperty.propertyId === liveSelectedProperty.propertyId
    );

    const canBuildOnSelected = Boolean(
        isMyTurn &&
        hasRolled &&
        !me.hasBuiltHouseThisTurn &&
        isStandingOnSelected &&
        ownedInGroup >= 3
    );

    const formatMoney = (value) => {
        if (value === undefined || value === null) return '';
        return `₹${Number(value).toLocaleString('en-IN')}`;
    };

    const getTileName = (tile, propState) => {
        if (propState) return propState.propertyName || propState.name;
        return tile?.name || tile?.type?.replaceAll('_', ' ') || '';
    };

    const getTileMeta = (tile, propState) => {
        if (propState?.price) return formatMoney(propState.price);
        if (!tile) return '';
        if (tile.type === 'CHANCE') return 'Card';
        if (tile.type === 'COMMUNITY_CHEST') return 'Card';
        if (tile.type === 'INCOME_TAX' || tile.type === 'WEALTH_TAX') return 'Tax';
        if (tile.type === 'CLUB') return 'Penalty';
        if (tile.type === 'START') return 'Collect';
        return '';
    };

    // ── Tile position helpers ──────────────────────────────────────────────
    // bottom row  : pos  0-9   → row 10, col 10-pos
    // left col    : pos 10-17  → row 9-(pos-9), col 1
    // top row     : pos 18-27  → row 1, col pos-17
    // right col   : pos 28-35  → row pos-26, col 10
    const getGridArea = (pos) => {
        if (pos >= 0 && pos <= 9)   return { gridRow: 10, gridColumn: 10 - pos };
        if (pos > 9  && pos <= 17)  return { gridRow: 19 - pos, gridColumn: 1 };
        if (pos > 17 && pos <= 27)  return { gridRow: 1, gridColumn: pos - 17 };
        return { gridRow: pos - 26, gridColumn: 10 };
    };

    // Which side is this tile on? Used for color-strip direction + text rotation
    const getTileSide = (pos) => {
        if (pos === 0 || pos === 9 || pos === 18 || pos === 27) return 'corner';
        if (pos >= 1  && pos <= 8)  return 'bottom';
        if (pos >= 10 && pos <= 17) return 'left';
        if (pos >= 19 && pos <= 26) return 'top';
        if (pos >= 28 && pos <= 35) return 'right';
        return 'bottom';
    };

    // ── Emoji map ─────────────────────────────────────────────────────────
    const tileEmoji = {
        // Cities
        'Mumbai':      '🏙️', 'Kolkata':     '🌉', 'Pune':        '🏛️',
        'Delhi':       '🕌', 'Ahmedabad':   '🏺', 'Agra':        '🕍',
        'Kanpur':      '🏭', 'Patna':       '🛕', 'Jaipur':      '🏰',
        'Indore':      '🌆', 'Cochin':      '⚓', 'Chandigarh':  '🌸',
        'Darjeeling':  '🍃', 'Ladakh':      '🏔️', 'Shimla':      '❄️',
        'Chennai':     '🌊', 'Bangalore':   '💻', 'Hyderabad':   '💎',
        'Amritsar':    '🛕', 'Goa':         '🏖️',
        // Transport / Utility
        'Railway':     '🚂', 'Electricity': '⚡', 'Airway':      '✈️',
        'Waterway':    '🚢', 'Roadway':     '🛣️', 'Bus Bay':     '🚌',
        // Special
        'CHANCE':           '❓', 'COMMUNITY_CHEST': '🎁',
        'INCOME_TAX':       '💸', 'WEALTH_TAX':      '💰',
    };

    const getTileEmoji = (tileInfo, tileName) => {
        return tileEmoji[tileName] || tileEmoji[tileInfo?.type] || '🏠';
    };

    // ── Group color system (raw hex for inline styles) ────────────────────
    const groupRawColor = {
        'DARK_BLUE':    '#2563eb',
        'GREEN':        '#059669',
        'RED':          '#e11d48',
        'YELLOW':       '#d97706',
        'RAIL_ELECTRIC':'#e2e8f0',
        'AIR_WATER':    '#0891b2',
        'ROAD_BUS':     '#64748b',
    };

    const specialTileColor = {
        'CHANCE':          '#7c3aed',
        'COMMUNITY_CHEST': '#16a34a',
        'INCOME_TAX':      '#dc2626',
        'WEALTH_TAX':      '#b45309',
    };

    const getTileAccentColor = (propState, tileInfo) => {
        if (propState?.group) return groupRawColor[propState.group] || '#475569';
        // Special non-property tiles get no color accent
        const noColorTypes = ['CHANCE', 'COMMUNITY_CHEST', 'INCOME_TAX', 'WEALTH_TAX'];
        if (noColorTypes.includes(tileInfo?.type)) return 'transparent';
        return specialTileColor[tileInfo?.type] || '#475569';
    };

    // ── Glass style per group ─────────────────────────────────────────────
    const getGroupGlassStyle = (group) => {
        const colorMap = {
            'DARK_BLUE':    'rgba(37,99,235,0.22)',
            'GREEN':        'rgba(5,150,105,0.22)',
            'RED':          'rgba(225,29,72,0.22)',
            'YELLOW':       'rgba(217,119,6,0.22)',
            'RAIL_ELECTRIC':'rgba(226,232,240,0.14)',
            'AIR_WATER':    'rgba(8,145,178,0.22)',
            'ROAD_BUS':     'rgba(100,116,139,0.22)',
        };
        const base = colorMap[group] || 'rgba(30,41,59,0.22)';
        return `linear-gradient(145deg, ${base} 0%, rgba(10,15,35,0.75) 100%)`;
    };

    const getNonPropGlassStyle = (type) => {
        // CHANCE, COMMUNITY_CHEST, INCOME_TAX, WEALTH_TAX → pure dark glass, no color tint
        return `linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(8,10,24,0.88) 100%)`;
    };

    // Handler helpers for actions
    const handleRoll = () => {
        if (actionPending) return;
        setActionPending(true);
        sendGameAction('ROLL_DICE');
    };
    const handleBuy = (propId) => {
        if (actionPending) return;
        if (!propId) {
            toast.error('No estate found on your current tile');
            return;
        }
        setActionPending(true);
        sendGameAction('BUY_PROPERTY', propId);
    };
    const handleSkip = () => {
        if (actionPending) return;
        setActionPending(true);
        sendGameAction('SKIP_PROPERTY', currentProperty?.propertyId ?? null, { endTurnAfter: true });
    };
    const handlePayBail = () => {
        if (actionPending) return;
        setActionPending(true);
        sendGameAction('PAY_BAIL');
    };
    const handleEndTurn = () => {
        if (actionPending) return;
        setActionPending(true);
        sendGameAction('END_TURN');
    };

    // Build/upgrade/mortgage
    const handleBuildHouse = (propId) => {
        if (actionPending) return;
        setActionPending(true);
        sendGameAction('BUILD_HOUSE', propId);
    };
    const handleBuildHotel = (propId) => {
        if (actionPending) return;
        setActionPending(true);
        sendGameAction('BUILD_HOTEL', propId);
    };
    const handleSellHouse = (propId) => {
        if (actionPending) return;
        setActionPending(true);
        sendGameAction('SELL_HOUSE', propId);
    };
    const handleSellHotel = (propId) => {
        if (actionPending) return;
        setActionPending(true);
        sendGameAction('SELL_HOTEL', propId);
    };
    const handleMortgage = (propId) => {
        if (actionPending) return;
        setActionPending(true);
        sendGameAction('MORTGAGE', propId);
    };
    const handleUnmortgage = (propId) => {
        if (actionPending) return;
        setActionPending(true);
        sendGameAction('UNMORTGAGE', propId);
    };

    // Get current tile client-side description
    const getTileDesc = (tile) => {
        if (tile.propertyId) {
            const prop = game.properties.find(p => p.propertyId === tile.propertyId);
            return { ...tile.property, ...prop };
        }
        return null;
    };

    // Find players currently on a tile position
    const getPlayersOnTile = (pos) => {
        return game.players.filter(p => p.position === pos && p.status !== 'BANKRUPT');
    };

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-6 flex flex-col items-center justify-center w-full">
            {/* Top Info Bar */}
            <div className="w-full max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-4">
                    {(() => {
                        const myToken = localStorage.getItem(`vyapar_token_hex_${me.username}`);
                        return myToken ? (
                            <div className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: myToken, boxShadow: `0 0 10px 2px ${myToken}88` }}>
                                <div className="flex gap-1 items-center">
                                    <div className="bg-white rounded-full relative" style={{ width: 9, height: 9 }}>
                                        <div className="bg-slate-900 rounded-full absolute" style={{ width: 5, height: 5, bottom: 1, left: '50%', transform: 'translateX(-50%)' }} />
                                    </div>
                                    <div className="bg-white rounded-full relative" style={{ width: 9, height: 9 }}>
                                        <div className="bg-slate-900 rounded-full absolute" style={{ width: 5, height: 5, bottom: 1, left: '50%', transform: 'translateX(-50%)' }} />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <img src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${me.username}`} alt="Me"
                                className="h-10 w-10 rounded-lg bg-slate-900 border border-purple-500/20" />
                        );
                    })()}
                    <div className="text-left">
                        <h4 className="text-sm font-extrabold text-white m-0">{me.username} (You)</h4>
                        <p className="text-xs text-purple-400 font-bold m-0">Balance: ₹{me.balance}</p>
                    </div>
                </div>

                {/* Status message */}
                <div className="glass px-6 py-2 rounded-full text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    {isMyTurn ? (
                        <span className="flex h-2.5 w-2.5 rounded-full bg-purple-500 glow-primary animate-pulse"></span>
                    ) : (
                        <span className="flex h-2.5 w-2.5 rounded-full bg-slate-600"></span>
                    )}
                    {isMyTurn ? "Your Turn" : `${game.players.find(p => p.playerId === game.currentTurnPlayerId)?.username || 'Someone'}'s Turn`}
                </div>

                <button 
                    onClick={leaveRoom}
                    className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-700 transition-all cursor-pointer"
                >
                    <LogOut className="h-4.5 w-4.5" />
                    Forfeit Match
                </button>
            </div>

            {/* Main Game Container */}
            <div className="w-full max-w-7xl grid md:grid-cols-3 gap-6 items-start">
                
                {/* 1. Player HUD (Left Panel) */}
                <div className="flex flex-col gap-4">
                    {/* Players Status list */}
                    <div className="glass-premium rounded-2xl p-6 flex flex-col gap-4">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 text-left mb-2">Players Status</h3>
                        {game.players.map(p => {
                            const isCurrentTurn = game.currentTurnPlayerId === p.playerId;
                            const isMe = p.playerId === me.playerId;
                            const isBankrupt = p.status === 'BANKRUPT';
                            const isSelected = selectedPlayerForMenu?.playerId === p.playerId;

                            return (
                                <div 
                                    key={p.playerId} 
                                    onClick={() => {
                                        if (!isMe && !isBankrupt) {
                                            setSelectedPlayerForMenu(isSelected ? null : p);
                                        }
                                    }}
                                    className={`flex flex-col rounded-xl p-3.5 border transition-all ${
                                        !isMe && !isBankrupt ? 'cursor-pointer hover:border-slate-700' : ''
                                    } ${
                                        isCurrentTurn 
                                            ? 'bg-purple-950/20 border-purple-500/50 glow-primary' 
                                            : p.status === 'BANKRUPT'
                                                ? 'border-red-950 bg-red-950/5 opacity-50'
                                                : 'border-slate-800 bg-slate-900/30'
                                    }`}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                {(() => {
                                                    const tokenHex = localStorage.getItem(`vyapar_token_hex_${p.username}`);
                                                    return tokenHex ? (
                                                        <div
                                                            className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0"
                                                            style={{ backgroundColor: tokenHex, boxShadow: `0 0 8px 2px ${tokenHex}66` }}
                                                        >
                                                            <div className="flex gap-1 items-center">
                                                                <div className="bg-white rounded-full relative" style={{ width: 8, height: 8 }}>
                                                                    <div className="bg-slate-900 rounded-full absolute" style={{ width: 4, height: 4, bottom: 1, left: '50%', transform: 'translateX(-50%)' }} />
                                                                </div>
                                                                <div className="bg-white rounded-full relative" style={{ width: 8, height: 8 }}>
                                                                    <div className="bg-slate-900 rounded-full absolute" style={{ width: 4, height: 4, bottom: 1, left: '50%', transform: 'translateX(-50%)' }} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <img
                                                            src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`}
                                                            alt={p.username}
                                                            className="h-9 w-9 rounded-lg bg-slate-950/50 border border-slate-800 p-0.5"
                                                        />
                                                    );
                                                })()}
                                                {p.status === 'IN_JAIL' && (
                                                    <span className="absolute -bottom-1 -right-1 rounded-full bg-red-500 px-1 py-0.5 text-[8px] font-bold text-white uppercase">Jail</span>
                                                )}
                                                {p.status === 'RECOVERY' && (
                                                    <span className="absolute -bottom-1 -right-1 rounded-full bg-yellow-500 px-1 py-0.5 text-[8px] font-bold text-black uppercase">Liqu</span>
                                                )}
                                            </div>
                                            <div className="text-left">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-sm font-semibold ${p.connected === false ? 'text-slate-500' : 'text-white'}`}>{p.username}</span>
                                                    {p.connected === false && (
                                                        <span className="rounded bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 text-[8px] font-medium text-red-400 uppercase">Offline</span>
                                                    )}
                                                    {isCurrentTurn && p.connected !== false && <span className="flex h-1.5 w-1.5 rounded-full bg-purple-500 animate-ping"></span>}
                                                </div>
                                                <p className="text-xs text-slate-400">Pos: Tile #{p.position}</p>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            {p.status === 'BANKRUPT' ? (
                                                <span className="text-xs font-bold text-red-500 uppercase tracking-widest">Bankrupt</span>
                                            ) : (
                                                <span className="text-sm font-bold text-purple-400">₹{(p.balance ?? 0).toLocaleString()}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Inline options for trading */}
                                    {isSelected && (
                                        <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex justify-end gap-2 w-full">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setTradePartner(p);
                                                    setOfferedCash(0);
                                                    setRequestedCash(0);
                                                    setOfferedProperties([]);
                                                    setRequestedProperties([]);
                                                    setShowTradeModal(true);
                                                    setSelectedPlayerForMenu(null);
                                                }}
                                                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-[10px] font-bold text-white transition-all cursor-pointer"
                                            >
                                                Trade
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedPlayerForMenu(null);
                                                }}
                                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 transition-all cursor-pointer"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Pending Trade Proposals Section */}
                    {pendingTrades.length > 0 && (
                        <div className="glass-premium rounded-2xl p-6 flex flex-col gap-4">
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 text-left mb-2 flex items-center gap-1.5">
                                <span>🤝 Trade Proposals</span>
                                <span className="bg-purple-500/20 text-purple-400 border border-purple-500/20 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                    {pendingTrades.length}
                                </span>
                            </h3>
                            <div className="space-y-3.5 max-h-72 overflow-y-auto pr-1">
                                {pendingTrades.map(trade => {
                                    const isIncoming = trade.receiverId === me.playerId;
                                    const proposerName = trade.proposerName;
                                    const receiverName = trade.receiverName;

                                    return (
                                        <div key={trade.tradeId} className="border border-slate-800 bg-slate-950/20 rounded-xl p-3.5 space-y-3 text-left">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                                                    {isIncoming ? "Incoming Offer" : "Outgoing Proposal"}
                                                </span>
                                                <span className="text-[9px] text-slate-500 font-mono">
                                                    {new Date(trade.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>

                                            <div className="text-xs text-slate-350 space-y-1.5">
                                                {isIncoming ? (
                                                    <p className="font-semibold text-white">{proposerName} offers:</p>
                                                ) : (
                                                    <p className="font-semibold text-white">You offered to {receiverName}:</p>
                                                )}

                                                <div className="bg-slate-950/40 p-2 rounded-lg space-y-1 text-slate-300 font-medium">
                                                    {trade.offeredCash > 0 && (
                                                        <div className="flex justify-between">
                                                            <span>• Cash:</span>
                                                            <span className="font-bold text-emerald-400">₹{(trade.offeredCash ?? 0).toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                    {trade.offeredProperties.length > 0 && (
                                                        <div className="space-y-1">
                                                            <div className="text-[9px] text-slate-500 uppercase tracking-widest font-black mt-0.5">Properties:</div>
                                                            {trade.offeredProperties.map(id => (
                                                                <div key={id} className="flex items-center gap-1.5 pl-1 text-white">
                                                                    <div className={`w-2 h-2 rounded-full ${groupColors[propertyCatalogById[id]?.group] || 'bg-slate-750'}`} />
                                                                    <span>{propertyCatalogById[id]?.name}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {trade.offeredCash === 0 && trade.offeredProperties.length === 0 && (
                                                        <span className="italic text-slate-500">• Nothing offered</span>
                                                    )}
                                                </div>

                                                <p className="font-semibold text-white mt-2">In exchange for:</p>

                                                <div className="bg-slate-950/40 p-2 rounded-lg space-y-1 text-slate-300 font-medium">
                                                    {trade.requestedCash > 0 && (
                                                        <div className="flex justify-between">
                                                            <span>• Cash:</span>
                                                            <span className="font-bold text-amber-400">₹{(trade.requestedCash ?? 0).toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                    {trade.requestedProperties.length > 0 && (
                                                        <div className="space-y-1">
                                                            <div className="text-[9px] text-slate-500 uppercase tracking-widest font-black mt-0.5">Properties:</div>
                                                            {trade.requestedProperties.map(id => (
                                                                <div key={id} className="flex items-center gap-1.5 pl-1 text-white">
                                                                    <div className={`w-2 h-2 rounded-full ${groupColors[propertyCatalogById[id]?.group] || 'bg-slate-750'}`} />
                                                                    <span>{propertyCatalogById[id]?.name}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {trade.requestedCash === 0 && trade.requestedProperties.length === 0 && (
                                                        <span className="italic text-slate-500">• Nothing requested</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex gap-2 pt-1">
                                                {isIncoming ? (
                                                    <>
                                                        <button
                                                            onClick={() => acceptTrade(trade.tradeId)}
                                                            className="flex-1 bg-emerald-650 hover:bg-emerald-600 text-white font-bold text-[10px] py-1.5 rounded-lg transition-colors cursor-pointer"
                                                        >
                                                            Accept
                                                        </button>
                                                        <button
                                                            onClick={() => rejectTrade(trade.tradeId)}
                                                            className="flex-1 bg-red-950/30 border border-red-500/30 hover:bg-red-500 hover:text-white text-red-450 font-bold text-[10px] py-1.5 rounded-lg transition-all cursor-pointer"
                                                        >
                                                            Reject
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        onClick={() => cancelTrade(trade.tradeId)}
                                                        className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] py-1.5 rounded-lg transition-colors cursor-pointer"
                                                    >
                                                        Cancel Offer
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Unowned Property Details Card */}
                    {showUnownedCard && (
                        <div className="glass-premium rounded-2xl overflow-hidden border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)] animate-fade-in flex flex-col">
                            {/* Top bar with Name, Price, and background color */}
                            <div className={`px-4 py-2.5 flex justify-between items-center ${groupColors[turnPlayerProperty.group] || 'bg-slate-700'} text-slate-950 font-black uppercase text-xs tracking-wide`}>
                                <span>{turnPlayerProperty.name || turnPlayerProperty.propertyName}</span>
                                <span className="bg-slate-950/20 px-1.5 py-0.5 rounded text-[10px]">
                                    {formatMoney(turnPlayerProperty.price)}
                                </span>
                            </div>

                            {/* Glass body with emoji */}
                            <div className="w-full h-20 flex flex-col items-center justify-center gap-1 border-b border-slate-800/60"
                                style={{ background: getGroupGlassStyle(turnPlayerProperty.group) }}
                            >
                                <span className="text-3xl leading-none">{getTileEmoji({type: turnPlayerProperty.type}, turnPlayerProperty.name || turnPlayerProperty.propertyName)}</span>
                                <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                                    {(turnPlayerProperty.name || turnPlayerProperty.propertyName || '?')}
                                </span>
                            </div>
                            <div className="p-4 space-y-3.5 text-left">
                                <div className="space-y-1.5 text-[11px] text-slate-300">
                                    {turnPlayerProperty.rent ? (
                                        <>
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Base Rent:</span>
                                                <span className="font-semibold text-white">{formatMoney(turnPlayerProperty.rent[0])}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Rent 1 House:</span>
                                                <span className="font-semibold text-white">{formatMoney(turnPlayerProperty.rent[1])}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Rent 2 Houses:</span>
                                                <span className="font-semibold text-white">{formatMoney(turnPlayerProperty.rent[2])}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Rent 3 Houses:</span>
                                                <span className="font-semibold text-white">{formatMoney(turnPlayerProperty.rent[3])}</span>
                                            </div>
                                            <div className="flex justify-between text-emerald-400 font-medium">
                                                <span>Rent Hotel:</span>
                                                <span className="font-bold">{formatMoney(turnPlayerProperty.rent[4])}</span>
                                            </div>
                                            <div className="border-t border-slate-800/40 pt-1.5 mt-2 flex justify-between">
                                                <span className="text-slate-500">Build House:</span>
                                                <span className="font-semibold text-white">{formatMoney(turnPlayerProperty.housePrice)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Build Hotel:</span>
                                                <span className="font-semibold text-white">{formatMoney(turnPlayerProperty.hotelPrice)}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            {turnPlayerProperty.type === 'UTILITY' && (
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500">Utility Rent:</span>
                                                    <span className="font-semibold text-white">{turnPlayerProperty.diceMultiplier}x Dice Roll</span>
                                                </div>
                                            )}
                                            {turnPlayerProperty.type === 'TRANSPORT' && (
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500">Transport Rent:</span>
                                                    <span className="font-semibold text-white">{formatMoney(turnPlayerProperty.baseRent)}</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    <div className="flex justify-between border-t border-slate-800/40 pt-1.5">
                                        <span className="text-slate-500">Mortgage Value:</span>
                                        <span className="font-semibold text-white">{formatMoney(turnPlayerProperty.price / 2)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. Board Grid & Center Hub (Center & Right Panel span 2 cols) */}
                <div className="md:col-span-2 relative bg-[#080a14] border border-white/5 rounded-2xl overflow-hidden p-1.5 shadow-[0_0_80px_rgba(0,0,0,0.9)]">
                    <div className="board-grid relative">

                        {/* Render 36 Tiles */}
                        {Array.from({ length: 36 }).map((_, idx) => {
                            const side = getTileSide(idx);
                            const isCorner = side === 'corner';
                            const tileInfo = boardData[idx];
                            if (!tileInfo) return null;
                            const propState   = getTileDesc(tileInfo);
                            const playersHere = getPlayersOnTile(idx);
                            const tileName    = getTileName(tileInfo, propState);
                            const tileMeta    = getTileMeta(tileInfo, propState);
                            const accentColor = getTileAccentColor(propState, tileInfo);
                            const ownerColor  = propState?.ownerId ? getPlayerRawColor(propState.ownerId) : null;

                            // ── glass bg: faint color + dark overlay ─────────────────
                            const glassStyle = propState
                                ? getGroupGlassStyle(propState.group)
                                : getNonPropGlassStyle(tileInfo.type);

                            // ── layout per side ───────────────────────────────────────
                            // bottom tiles (pos 1-8): name at top-left, price badge bottom-right
                            // top tiles (pos 19-26) : name at bottom-left, price badge top-right
                            // left tiles (pos 10-17): text rotated 180°, name at bottom, price at top
                            // right tiles (pos 28-35): text rotated 0° (vertical-rl), name at top, price at bottom
                            const isVertical = side === 'left' || side === 'right';

                            // Corner positions use getGridArea, non-corners use custom board-grid class
                            const gridStyle = getGridArea(idx);

                            return (
                                <div
                                    key={idx}
                                    style={{
                                        ...gridStyle,
                                        borderRadius: isCorner ? '0px' : '6px',
                                    }}
                                    className={`relative overflow-hidden select-none cursor-pointer transition-all duration-150
                                        hover:brightness-125 hover:z-20
                                        ${isCorner
                                            ? 'bg-[#0d1020] border border-white/10'
                                            : 'border border-white/[0.07]'
                                        }`}
                                    onClick={() => { if (propState) setSelectedProperty(propState); }}
                                >
                                    {/* ══ CORNER TILES ══ */}
                                    {isCorner ? (
                                        <>
                                            <img
                                                src={getPropertyImagePath(tileInfo.name || tileName, tileInfo.type)}
                                                className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0"
                                                onError={e => { e.target.style.display = 'none'; }}
                                                alt=""
                                            />
                                            {(tileInfo.type === 'REST_ROOM' || tileInfo.type === 'CLUB') && (
                                                <div className="absolute inset-x-0 bottom-2.5 flex justify-center z-10 pointer-events-none">
                                                    <span className="text-[9px] font-black uppercase text-white bg-slate-950/80 px-2 py-0.5 rounded-full border border-white/10 tracking-widest shadow-md">
                                                        {tileInfo.type === 'REST_ROOM' 
                                                            ? `Rest Room (₹${(game.restRoomPool ?? 0).toLocaleString()})` 
                                                            : `Club (₹${(gameRules?.clubFee ?? 200).toLocaleString()})`}
                                                    </span>
                                                </div>
                                            )}
                                            {playersHere.length > 0 && (
                                                <div className="absolute inset-0 flex items-center justify-center z-20">
                                                    <div className="flex -space-x-2">
                                                        {playersHere.map(p => (
                                                            <BoardToken key={p.playerId} username={p.username} size={39} />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        /* ══ NON-CORNER TILES ══ */
                                        <>
                                            {/* Layer 1 – faint solid color fill (the "color strip behind glass") */}
                                            <div
                                                className="absolute inset-0"
                                                style={{ backgroundColor: accentColor, opacity: 0.38 }}
                                            />

                                            {/* Layer 2 – glass morphism overlay */}
                                            <div
                                                className="absolute inset-0"
                                                style={{
                                                    background: 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(10,12,28,0.58) 100%)',
                                                    backdropFilter: 'blur(6px)',
                                                    WebkitBackdropFilter: 'blur(6px)',
                                                    border: 'none',
                                                }}
                                            />

                                            {/* Layer 3 – ownership fill: 20% of card area on OPPOSITE edge from color strip */}
                                            {ownerColor && (
                                                <div
                                                    className="absolute z-[5]"
                                                    style={{
                                                        backgroundColor: ownerColor,
                                                        opacity: 0.82,
                                                        // opposite edge from the accent strip, fills 20% of the card
                                                        ...(side === 'bottom' ? { top: 0,    left: 0, right: 0, height: '20%', borderRadius: '6px 6px 0 0' } : {}),
                                                        ...(side === 'top'    ? { bottom: 0, left: 0, right: 0, height: '20%', borderRadius: '0 0 6px 6px' } : {}),
                                                        ...(side === 'left'   ? { right: 0,  top: 0,  bottom: 0, width: '20%', borderRadius: '0 6px 6px 0' } : {}),
                                                        ...(side === 'right'  ? { left: 0,   top: 0,  bottom: 0, width: '20%', borderRadius: '6px 0 0 6px' } : {}),
                                                    }}
                                                />
                                            )}

                                            {/* ── HORIZONTAL TILES (bottom row pos 1-8, top row pos 19-26) ── */}
                                            {!isVertical && (
                                                <div className="absolute inset-0 z-10 flex flex-col justify-between p-1">
                                                    {/* Name at the top for bottom-row, bottom for top-row */}
                                                    {side === 'bottom' && (
                                                        <>
                                                            <span
                                                                className="text-white leading-tight w-full text-center"
                                                                style={{
                                                                    fontFamily: "'Oswald', sans-serif",
                                                                    fontSize: 'clamp(7px, 1.1vw, 13px)',
                                                                    textShadow: '0 1px 5px rgba(0,0,0,1)',
                                                                    display: '-webkit-box',
                                                                    WebkitLineClamp: 2,
                                                                    WebkitBoxOrient: 'vertical',
                                                                    overflow: 'hidden',
                                                                    letterSpacing: '0.01em',
                                                                    fontWeight: '600',
                                                                    lineHeight: 1.1,
                                                                }}
                                                            >
                                                                {tileName}
                                                            </span>
                                                            {/* dev level */}
                                                            {propState?.developmentLevel > 0 && (
                                                                <span className="text-center leading-none" style={{ fontSize: '10px' }}>
                                                                    {propState.developmentLevel === 4 ? '🏨' : '🏠'.repeat(propState.developmentLevel)}
                                                                </span>
                                                            )}
                                                            {tileMeta && (
                                                                <span
                                                                    className="self-center text-white leading-none rounded-sm px-1 py-0.5"
                                                                    style={{
                                                                        fontFamily: "'Oswald', sans-serif",
                                                                        fontSize: 'clamp(6px, 0.9vw, 11px)',
                                                                        fontWeight: '600',
                                                                        background: 'rgba(0,0,0,0.60)',
                                                                        border: `1px solid ${accentColor}66`,
                                                                        boxShadow: `0 0 6px ${accentColor}55`,
                                                                        letterSpacing: '0.02em',
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                >
                                                                    {tileMeta}
                                                                </span>
                                                            )}
                                                        </>
                                                    )}
                                                    {side === 'top' && (
                                                        <>
                                                            {tileMeta && (
                                                                <span
                                                                    className="self-center text-white leading-none rounded-sm px-1 py-0.5"
                                                                    style={{
                                                                        fontFamily: "'Oswald', sans-serif",
                                                                        fontSize: 'clamp(6px, 0.9vw, 11px)',
                                                                        fontWeight: '600',
                                                                        background: 'rgba(0,0,0,0.60)',
                                                                        border: `1px solid ${accentColor}66`,
                                                                        boxShadow: `0 0 6px ${accentColor}55`,
                                                                        letterSpacing: '0.02em',
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                >
                                                                    {tileMeta}
                                                                </span>
                                                            )}
                                                            {propState?.developmentLevel > 0 && (
                                                                <span className="text-center leading-none" style={{ fontSize: '10px' }}>
                                                                    {propState.developmentLevel === 4 ? '🏨' : '🏠'.repeat(propState.developmentLevel)}
                                                                </span>
                                                            )}
                                                            <span
                                                                className="text-white leading-tight w-full text-center"
                                                                style={{
                                                                    fontFamily: "'Oswald', sans-serif",
                                                                    fontSize: 'clamp(7px, 1.1vw, 13px)',
                                                                    fontWeight: '600',
                                                                    textShadow: '0 1px 5px rgba(0,0,0,1)',
                                                                    display: '-webkit-box',
                                                                    WebkitLineClamp: 2,
                                                                    WebkitBoxOrient: 'vertical',
                                                                    overflow: 'hidden',
                                                                    letterSpacing: '0.01em',
                                                                    lineHeight: 1.1,
                                                                }}
                                                            >
                                                                {tileName}
                                                            </span>
                                                        </>
                                                    )}
                                                    {/* owner badge */}
                                                    {propState?.ownerId && (
                                                        <span
                                                            className="absolute top-0.5 right-0.5 rounded text-purple-300 font-black border border-purple-500/30 leading-none"
                                                            style={{ fontSize: '5px', padding: '1px 2px', background: 'rgba(0,0,0,0.7)' }}
                                                        >
                                                            {getOwnerName(propState.ownerId)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* ── VERTICAL TILES (left col pos 10-17, right col pos 28-35) ── */}
                                            {isVertical && (
                                                <div className="absolute inset-0 z-10">
                                                    {/* Name — on the LEFT edge, rotated */}
                                                    <span
                                                        className="absolute text-white leading-none tracking-wide"
                                                        style={{
                                                            fontFamily: "'Oswald', sans-serif",
                                                            fontSize: 'clamp(7px, 1vw, 12px)',
                                                            fontWeight: '600',
                                                            textShadow: '0 1px 4px rgba(0,0,0,1)',
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            maxWidth: '88%',
                                                            left: '4px',
                                                            top: '50%',
                                                            transform: 'translateY(-50%) rotate(-90deg)',
                                                            transformOrigin: 'center center',
                                                            letterSpacing: '0.01em',
                                                        }}
                                                    >
                                                        {tileName}
                                                    </span>

                                                    {/* Price pill — on the RIGHT edge */}
                                                    {tileMeta && (
                                                        <span
                                                            className="absolute text-white leading-none rounded-sm"
                                                            style={{
                                                                fontFamily: "'Oswald', sans-serif",
                                                                fontSize: 'clamp(6px, 0.85vw, 10px)',
                                                                fontWeight: '600',
                                                                padding: '2px 3px',
                                                                background: 'rgba(0,0,0,0.60)',
                                                                border: `1px solid ${accentColor}66`,
                                                                boxShadow: `0 0 6px ${accentColor}55`,
                                                                whiteSpace: 'nowrap',
                                                                right: '4px',
                                                                top: '50%',
                                                                transform: 'translateY(-50%) rotate(90deg)',
                                                                transformOrigin: 'center center',
                                                            }}
                                                        >
                                                            {tileMeta}
                                                        </span>
                                                    )}

                                                    {/* Dev level — centered */}
                                                    {propState?.developmentLevel > 0 && (
                                                        <span
                                                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                                                            style={{ fontSize: '10px', lineHeight: 1 }}
                                                        >
                                                            {propState.developmentLevel === 4 ? '🏨' : '🏠'.repeat(propState.developmentLevel)}
                                                        </span>
                                                    )}

                                                    {/* Owner badge — top center */}
                                                    {propState?.ownerId && (
                                                        <span
                                                            className="absolute top-0.5 left-1/2 -translate-x-1/2 rounded text-purple-300 font-black border border-purple-500/30 leading-none whitespace-nowrap"
                                                            style={{ fontSize: '5px', padding: '1px 2px', background: 'rgba(0,0,0,0.7)', fontFamily: "'Oswald', sans-serif" }}
                                                        >
                                                            {getOwnerName(propState.ownerId)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Glowing edge strip — the group color accent line */}
                                            <div
                                                className="absolute z-20"
                                                style={{
                                                    backgroundColor: accentColor,
                                                    boxShadow: `0 0 10px 2px ${accentColor}88`,
                                                    ...(side === 'bottom' ? { bottom: 0, left: 0, right: 0, height: '6px' } : {}),
                                                    ...(side === 'top'    ? { top: 0,    left: 0, right: 0, height: '6px' } : {}),
                                                    ...(side === 'left'   ? { left: 0,   top: 0,  bottom: 0, width: '6px' } : {}),
                                                    ...(side === 'right'  ? { right: 0,  top: 0,  bottom: 0, width: '6px' } : {}),
                                                }}
                                            />

                                            {/* Player tokens */}
                                            {playersHere.length > 0 && (
                                                <div className="absolute inset-0 flex items-center justify-center z-30">
                                                    <div className="flex -space-x-1.5">
                                                        {playersHere.map(p => (
                                                            <BoardToken key={p.playerId} username={p.username} size={30} />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}

                        {/* 3. Center Control Hub (Col 2-9, Row 2-9) */}
                        <div className="grid-in-center border border-slate-800/50 rounded-2xl p-4 flex flex-col justify-between shadow-inner" style={{ gridArea: "2 / 2 / 10 / 10", background: 'rgba(8,10,22,0.92)' }}>
                            
                            {/* Inner Header Tabs */}
                            <div className="flex border-b border-slate-800 pb-2 mb-2 justify-between">
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setActiveTab('actions')}
                                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                                            activeTab === 'actions' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                        }`}
                                    >
                                        Control Hub
                                    </button>
                                    <button 
                                        onClick={() => setActiveTab('assets')}
                                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                                            activeTab === 'assets' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                        }`}
                                    >
                                        My Estates
                                    </button>
                                </div>
                                <button 
                                    onClick={() => setActiveTab('logs')}
                                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                                        activeTab === 'logs' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                    }`}
                                >
                                    Game Logs
                                </button>
                            </div>

                            {/* Panel Body */}
                            <div className="flex-1 overflow-y-auto mb-2 pr-1 custom-scrollbar">
                                {activeTab === 'actions' && (
                                    <div className="h-full flex flex-col justify-center items-center gap-4 text-center">
                                        {/* Render Dice Results */}
                                        {dice && (
                                            <div className="flex flex-col items-center animate-roll">
                                                <div className="flex gap-4 items-center">
                                                    <DiceFace value={dice.diceOne} isDouble={dice.isDouble} />
                                                    <DiceFace value={dice.diceTwo} isDouble={dice.isDouble} />
                                                </div>
                                                <p className="text-xs text-purple-300 font-bold mt-2">
                                                    Total: {dice.total} {dice.isDouble && <span className="text-yellow-400 ml-1">Double!</span>}
                                                </p>
                                            </div>
                                        )}

                                        {/* Contextual Options */}
                                        <div className="w-full space-y-4">
                                            {isMyTurn && !isRecovering && (
                                                <div className="flex flex-col gap-2.5">
                                                    {/* Dice Roll */}
                                                    {!hasRolled && !isJailed && (
                                                        <button 
                                                            onClick={handleRoll}
                                                            disabled={actionPending}
                                                            className={`w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 text-sm font-bold text-white hover:bg-purple-500 glow-primary cursor-pointer transition-transform duration-200 active:scale-95 shadow-md ${actionPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        >
                                                            <Dice5 className="h-5 w-5" />
                                                            {actionPending ? 'Rolling...' : 'Roll Dice'}
                                                        </button>
                                                    )}

                                                    {/* Bail Options */}
                                                    {isJailed && (
                                                        <div className="flex gap-2">
                                                            <button 
                                                                onClick={handlePayBail}
                                                                disabled={actionPending}
                                                                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 py-2.5 text-xs font-bold text-white hover:bg-amber-500 transition-all cursor-pointer shadow-sm ${actionPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            >
                                                                <DollarSign className="h-4 w-4" />
                                                                Pay ₹500 Bail
                                                            </button>
                                                            <button 
                                                                onClick={handleEndTurn}
                                                                disabled={actionPending}
                                                                className={`flex-1 rounded-lg border border-slate-700 bg-slate-800 text-xs font-bold text-slate-200 hover:bg-slate-700 transition-all cursor-pointer shadow-xs ${actionPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            >
                                                                Skip & Stay Jailed
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* Purchase property decisions */}
                                                    {canBuyCurrentProperty && (
                                                        <div className="flex flex-col gap-2 bg-slate-900/85 p-3 rounded-xl border border-slate-850">
                                                            <p className="text-xs text-slate-200 font-bold m-0">
                                                                {currentProperty?.name || currentProperty?.propertyName || 'Property'} is unowned. Purchase?
                                                            </p>
                                                            <div className="flex gap-2 mt-1">
                                                                <button 
                                                                    onClick={() => handleBuy(currentProperty?.propertyId)}
                                                                    disabled={actionPending}
                                                                    className={`flex-1 rounded-lg bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 glow-success cursor-pointer shadow-sm ${actionPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                >
                                                                    Buy Estate
                                                                </button>
                                                                <button 
                                                                    onClick={handleSkip}
                                                                    disabled={actionPending}
                                                                    className={`flex-1 rounded-lg border border-slate-700 bg-slate-800 text-xs font-bold text-slate-200 hover:bg-slate-700 cursor-pointer shadow-xs ${actionPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                >
                                                                    Skip & End Turn
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* End Turn option */}
                                                    {hasRolled && pendingAction === 'NONE' && (
                                                        <button 
                                                            onClick={handleEndTurn}
                                                            disabled={actionPending}
                                                            className={`w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-500 transition-colors cursor-pointer shadow-md ${actionPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        >
                                                            <UserCheck className="h-5 w-5" />
                                                            {actionPending ? 'Ending Turn...' : 'End Turn'}
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {!isMyTurn && (
                                                <p className="text-xs text-slate-400 font-semibold animate-pulse">Waiting for other players to take action...</p>
                                            )}
                                        </div>

                                        {/* Latest Log Display */}
                                        {logs.length > 0 && (
                                            <div className="w-full mt-2 p-2.5 rounded-lg border border-purple-500/20 bg-purple-950/20 text-left text-[10px] font-mono text-purple-300 shadow-sm shrink-0">
                                                <span className="text-purple-400 font-black mr-1.5">Latest Action:</span>
                                                {logs[logs.length - 1].replace(/^\[.*?\]\s*/, '')}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'assets' && (
                                    <div className="space-y-2">
                                        <p className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Click on an estate to manage upgrades/mortgages</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {game.properties.filter(p => p.ownerId === me.playerId).map(prop => (
                                                <button 
                                                    key={prop.propertyId}
                                                    onClick={() => setSelectedProperty(prop)}
                                                    className="bg-slate-900/60 p-2.5 rounded-lg text-left flex flex-col justify-between border border-slate-800 hover:border-purple-500/50 hover:bg-slate-900/90 hover:shadow-md cursor-pointer transition-all"
                                                >
                                                    <div className="flex gap-1.5 items-center">
                                                        <div className={`h-2 w-2 rounded-full ${groupColors[prop.group] || 'bg-slate-500'}`}></div>
                                                        <span className="text-xs font-bold text-slate-200 truncate">{prop.propertyName}</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 mt-1 flex justify-between items-center w-full">
                                                        <span>Lv: {prop.developmentLevel === 4 ? 'Hotel' : prop.developmentLevel + ' H'}</span>
                                                        {prop.mortgaged && <span className="text-red-500 text-[8px] font-black uppercase">Mort</span>}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'logs' && (
                                    <div className="space-y-1.5 text-left font-mono text-[10px]">
                                        {[...logs].reverse().map((log, i) => (
                                            <div key={i} className="text-slate-300 border-l-2 border-purple-500/40 pl-2 leading-relaxed font-medium">
                                                {log}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </div>
            {/* 4. Property Detail Dialog Modal */}
            {selectedProperty && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4" onClick={() => setSelectedProperty(null)}>
                    <div 
                        className="glass-premium rounded-2xl overflow-hidden w-full max-w-sm text-left shadow-2xl animate-scale-up"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header Color band with name and price */}
                        <div className={`p-4 flex justify-between items-center ${groupColors[selectedProperty.group] || 'bg-slate-700'} text-slate-950 font-black uppercase tracking-tight`}>
                            <h3 className="text-lg font-black uppercase m-0 leading-none">
                                {selectedProperty.propertyName || selectedProperty.name}
                            </h3>
                            <span className="text-xs font-black bg-slate-950/20 px-2 py-0.5 rounded">
                                {formatMoney(selectedProperty.price)}
                            </span>
                        </div>

                        {/* Glass panel with emoji */}
                        <div className="w-full h-24 flex flex-col items-center justify-center gap-1.5 border-b border-slate-800/60"
                            style={{ background: getGroupGlassStyle(selectedProperty.group) }}
                        >
                            <span className="text-4xl leading-none">{getTileEmoji({type: selectedProperty.type}, selectedProperty.propertyName || selectedProperty.name)}</span>
                            <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">
                                {selectedProperty.propertyName || selectedProperty.name}
                            </span>
                        </div>

                        <div className="p-6">
                            {/* Estate Details */}
                            <div className="space-y-2.5 text-xs text-slate-300">
                                <div className="flex justify-between border-b border-slate-800/40 pb-1.5">
                                    <span className="text-slate-500">Price:</span>
                                    <span className="font-semibold text-white">{formatMoney(selectedProperty.price)}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-800/40 pb-1.5">
                                    <span className="text-slate-500">Owner:</span>
                                    <span className="font-semibold text-white">
                                        {selectedProperty.ownerId 
                                            ? (selectedProperty.ownerId === me.playerId ? 'You' : game.players.find(pl => pl.playerId === selectedProperty.ownerId)?.username) 
                                            : 'Bank'}
                                    </span>
                                </div>
                                <div className="flex justify-between border-b border-slate-800/40 pb-1.5">
                                    <span className="text-slate-500">Mortgage Status:</span>
                                    <span className={`font-semibold ${selectedProperty.mortgaged ? 'text-red-400 font-bold' : 'text-emerald-400'}`}>
                                        {selectedProperty.mortgaged ? 'Mortgaged' : 'Active'}
                                    </span>
                                </div>

                                {/* Rent Breakdown for properties */}
                                {selectedProperty.rent ? (
                                    <div className="space-y-1 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 mt-3">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1.5">Rent Rates</p>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Base Rent:</span>
                                            <span className="font-medium text-white">{formatMoney(selectedProperty.rent[0])}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">With 1 House:</span>
                                            <span className="font-medium text-white">{formatMoney(selectedProperty.rent[1])}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">With 2 Houses:</span>
                                            <span className="font-medium text-white">{formatMoney(selectedProperty.rent[2])}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">With 3 Houses:</span>
                                            <span className="font-medium text-white">{formatMoney(selectedProperty.rent[3])}</span>
                                        </div>
                                        <div className="flex justify-between text-emerald-400 font-semibold">
                                            <span>With Hotel:</span>
                                            <span>{formatMoney(selectedProperty.rent[4])}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-1 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 mt-3">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1.5">Rent rates</p>
                                        {selectedProperty.type === 'UTILITY' && (
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Utility Rent:</span>
                                                <span className="font-medium text-white">{selectedProperty.diceMultiplier}x Dice Roll</span>
                                            </div>
                                        )}
                                        {selectedProperty.type === 'TRANSPORT' && (
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Transport Rent:</span>
                                                <span className="font-medium text-white">{formatMoney(selectedProperty.baseRent)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Build / Mortgage Costs */}
                                <div className="grid grid-cols-2 gap-2 mt-3 pt-1 text-[10px]">
                                    <div className="bg-slate-950/20 p-2 rounded border border-slate-800/40">
                                        <span className="text-slate-500 block">Mortgage Value</span>
                                        <span className="text-white font-bold text-xs">{formatMoney(selectedProperty.price / 2)}</span>
                                    </div>
                                    {selectedProperty.housePrice && (
                                        <div className="bg-slate-950/20 p-2 rounded border border-slate-800/40">
                                            <span className="text-slate-500 block">Build Cost (H/Hotel)</span>
                                            <span className="text-white font-bold text-[9.5px] leading-tight mt-0.5 block">
                                                H: {formatMoney(selectedProperty.housePrice)} <br/> Hot: {formatMoney(selectedProperty.hotelPrice)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                             {/* Interactive Upgrade Buttons for Owner */}
                             {liveSelectedProperty && liveSelectedProperty.ownerId === me.playerId && (
                                 <div className="mt-6 space-y-2 border-t border-slate-800 pt-4">
                                     <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Manage estate</p>
                                     
                                     {/* Build Info/Warning */}
                                     {!liveSelectedProperty.mortgaged && (
                                         <div className="text-[10px] text-slate-400 mt-1 leading-normal">
                                             {!canBuildOnSelected ? (
                                                 <p className="text-amber-400/90 font-medium">
                                                     {!isMyTurn ? "Wait for your turn to build." :
                                                      !hasRolled ? "Roll the dice first." :
                                                      !isStandingOnSelected ? "You must land on this property to build." :
                                                      ownedInGroup < 3 ? `You need majority ownership (at least 3 active properties in ${liveSelectedProperty.group}).` :
                                                      me.hasBuiltHouseThisTurn ? "Only 1 house/hotel can be built per landing." : ""}
                                                 </p>
                                             ) : (
                                                 <p className="text-emerald-400/90 font-medium">
                                                     You can build 1 house/hotel now.
                                                 </p>
                                             )}
                                         </div>
                                     )}

                                     <div className="grid grid-cols-2 gap-2 mt-2">
                                         {/* Build Houses */}
                                         {canBuildOnSelected && liveSelectedProperty.developmentLevel < 3 && !liveSelectedProperty.mortgaged && (
                                             <button 
                                                 onClick={() => { handleBuildHouse(liveSelectedProperty.propertyId); setSelectedProperty(null); }}
                                                 className="flex items-center justify-center gap-1 bg-purple-600 text-white rounded-lg py-2 text-xs font-semibold hover:bg-purple-500 cursor-pointer col-span-2"
                                             >
                                                 <HomeIcon className="h-3.5 w-3.5" />
                                                 Build House
                                             </button>
                                         )}

                                         {/* Build Hotel */}
                                         {canBuildOnSelected && liveSelectedProperty.developmentLevel === 3 && !liveSelectedProperty.mortgaged && (
                                             <button 
                                                 onClick={() => { handleBuildHotel(liveSelectedProperty.propertyId); setSelectedProperty(null); }}
                                                 className="flex items-center justify-center gap-1 bg-purple-600 text-white rounded-lg py-2 text-xs font-semibold hover:bg-purple-500 cursor-pointer col-span-2"
                                             >
                                                 <Building2 className="h-3.5 w-3.5" />
                                                 Build Hotel
                                             </button>
                                         )}

                                         {/* Sell House */}
                                         {liveSelectedProperty.developmentLevel > 0 && liveSelectedProperty.developmentLevel <= 3 && (
                                             <button 
                                                 onClick={() => { handleSellHouse(liveSelectedProperty.propertyId); setSelectedProperty(null); }}
                                                 className="bg-slate-800 text-slate-300 border border-slate-700 rounded-lg py-2 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                                             >
                                                 Sell House
                                             </button>
                                         )}

                                         {/* Sell Hotel */}
                                         {liveSelectedProperty.developmentLevel === 4 && (
                                             <button 
                                                 onClick={() => { handleSellHotel(liveSelectedProperty.propertyId); setSelectedProperty(null); }}
                                                 className="bg-slate-800 text-slate-300 border border-slate-700 rounded-lg py-2 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                                             >
                                                 Sell Hotel
                                             </button>
                                         )}

                                         {/* Mortgage / Unmortgage */}
                                         {!liveSelectedProperty.mortgaged ? (
                                             liveSelectedProperty.developmentLevel === 0 && (
                                                 <button 
                                                     onClick={() => { handleMortgage(liveSelectedProperty.propertyId); setSelectedProperty(null); }}
                                                     className="flex items-center justify-center gap-1 border border-red-500/30 bg-red-950/10 text-red-400 rounded-lg py-2 text-xs font-semibold hover:bg-red-500 hover:text-white cursor-pointer"
                                                 >
                                                     <Lock className="h-3.5 w-3.5" />
                                                     Mortgage
                                                 </button>
                                             )
                                         ) : (
                                             <button 
                                                 onClick={() => { handleUnmortgage(liveSelectedProperty.propertyId); setSelectedProperty(null); }}
                                                 className="flex items-center justify-center gap-1 border border-emerald-500/30 bg-emerald-950/10 text-emerald-400 rounded-lg py-2 text-xs font-semibold hover:bg-emerald-500 hover:text-white cursor-pointer"
                                             >
                                                 <Unlock className="h-3.5 w-3.5" />
                                                 Unmortgage
                                             </button>
                                         )}
                                     </div>
                                 </div>
                             )}

                            <button 
                                onClick={() => setSelectedProperty(null)}
                                className="mt-6 w-full rounded-lg bg-slate-800 py-2.5 text-xs font-semibold text-slate-400 hover:text-white text-center cursor-pointer"
                            >
                                Close Details
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 5. Asset Liquidation Mode (Recovery Overlay Modal) */}
            {isRecovering && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-40 p-4">
                    <div className="glass-premium border border-yellow-500/30 rounded-3xl p-8 max-w-md w-full text-center glow-primary">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-400 mx-auto border border-yellow-500/30">
                            <ShieldAlert className="h-8 w-8" />
                        </div>
                        <h2 className="text-2xl font-extrabold text-white">Asset Liquidation</h2>
                        <p className="text-slate-400 text-sm mt-2">
                            Your balance is currently <span className="text-red-400 font-bold">₹{me.balance}</span>. 
                            You must sell houses/hotels or mortgage properties to recover a positive balance before you can continue your turn.
                        </p>

                        <div className="mt-6 space-y-3">
                            <button 
                                onClick={() => setActiveTab('assets')}
                                className="w-full rounded-lg bg-yellow-500 px-4 py-3 text-xs font-bold text-black hover:bg-yellow-400 transition-colors cursor-pointer"
                            >
                                Sell Assets / Mortgage Properties
                            </button>
                            
                            <p className="text-[10px] text-slate-500">
                                If you have no houses to sell and no properties left to mortgage, you can end your turn to declare bankruptcy.
                            </p>

                            <button 
                                onClick={handleEndTurn}
                                disabled={actionPending}
                                className={`w-full rounded-lg border border-red-500/30 bg-red-950/15 py-3 text-xs font-bold text-red-400 hover:bg-red-500 hover:text-white transition-all cursor-pointer ${actionPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                Declare Bankruptcy
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 6. Trade Proposal Modal */}
            {showTradeModal && tradePartner && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/85 backdrop-blur-md z-40 p-4 animate-fade-in animate-duration-200">
                    <div className="glass-premium border border-purple-500/30 rounded-3xl p-6 max-w-2xl w-full flex flex-col gap-5 max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                            <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                                <span>🤝 Propose Trade to {tradePartner.username}</span>
                            </h2>
                            <button
                                onClick={() => {
                                    setShowTradeModal(false);
                                    setTradePartner(null);
                                }}
                                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Cash Sliders */}
                        <div className="space-y-4 bg-slate-950/40 p-4 rounded-2xl border border-slate-900">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 text-left">Cash Adjustment</h3>
                            
                            {/* Offered Cash */}
                            <div className="space-y-2 text-left">
                                <div className="flex justify-between text-xs">
                                    <span className="text-purple-400 font-medium">Offered Cash (Your balance: ₹{(me?.balance ?? 0).toLocaleString()})</span>
                                    <span className="font-bold text-white">₹{(offeredCash ?? 0).toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min="0"
                                        max={me?.balance ?? 0}
                                        step="100"
                                        value={offeredCash}
                                        onChange={(e) => setOfferedCash(Number(e.target.value))}
                                        className="w-full accent-purple-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                                    />
                                    <input
                                        type="number"
                                        min="0"
                                        max={me?.balance ?? 0}
                                        value={offeredCash}
                                        onChange={(e) => {
                                            const val = Math.min(me?.balance ?? 0, Math.max(0, Number(e.target.value)));
                                            setOfferedCash(val);
                                        }}
                                        className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white font-mono text-right"
                                    />
                                </div>
                            </div>

                            {/* Requested Cash */}
                            <div className="space-y-2 text-left">
                                <div className="flex justify-between text-xs">
                                    <span className="text-amber-400 font-medium">Requested Cash ({tradePartner.username}'s balance: ₹{(tradePartner?.balance ?? 0).toLocaleString()})</span>
                                    <span className="font-bold text-white">₹{(requestedCash ?? 0).toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min="0"
                                        max={tradePartner.balance}
                                        step="100"
                                        value={requestedCash}
                                        onChange={(e) => setRequestedCash(Number(e.target.value))}
                                        className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                                    />
                                    <input
                                        type="number"
                                        min="0"
                                        max={tradePartner.balance}
                                        value={requestedCash}
                                        onChange={(e) => {
                                            const val = Math.min(tradePartner.balance, Math.max(0, Number(e.target.value)));
                                            setRequestedCash(val);
                                        }}
                                        className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white font-mono text-right"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Properties Lists */}
                        <div className="grid md:grid-cols-2 gap-4">
                            {/* Offered Properties (My properties) */}
                            <div className="border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 bg-slate-900/10">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 text-left">Your Offered Properties</h3>
                                <div className="overflow-y-auto max-h-48 space-y-2 pr-1">
                                    {game.properties.filter(p => p.ownerId === me.playerId).length === 0 ? (
                                        <p className="text-xs text-slate-500 italic py-4">No properties owned</p>
                                    ) : (
                                        game.properties.filter(p => p.ownerId === me.playerId).map(p => {
                                            const catalog = propertyCatalogById[p.propertyId];
                                            const isImproved = isColorGroupImproved(catalog?.group);
                                            const isChecked = offeredProperties.includes(p.propertyId);

                                            return (
                                                <label
                                                    key={p.propertyId}
                                                    className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer select-none transition-all ${
                                                        isChecked 
                                                            ? 'bg-purple-950/20 border-purple-500/50 text-white font-semibold' 
                                                            : isImproved 
                                                                ? 'border-slate-900 text-slate-600 opacity-50 cursor-not-allowed'
                                                                : 'border-slate-800/80 hover:bg-slate-800/30 text-slate-300'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <input
                                                            type="checkbox"
                                                            disabled={isImproved}
                                                            checked={isChecked}
                                                            onChange={() => {
                                                                if (isChecked) {
                                                                    setOfferedProperties(prev => prev.filter(id => id !== p.propertyId));
                                                                } else {
                                                                    setOfferedProperties(prev => [...prev, p.propertyId]);
                                                                }
                                                            }}
                                                            className="accent-purple-500 rounded cursor-pointer"
                                                        />
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-3 h-3 rounded-full ${groupColors[catalog?.group] || 'bg-slate-700'}`} />
                                                            <span>{catalog?.name || p.propertyName}</span>
                                                            {p.mortgaged && (
                                                                <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/20 px-1 rounded uppercase font-extrabold scale-90">Mortgaged</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {isImproved && (
                                                        <span className="text-[9px] text-red-400 font-bold">Has Houses</span>
                                                    )}
                                                </label>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Requested Properties (Their properties) */}
                            <div className="border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 bg-slate-900/10">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 text-left">{tradePartner.username}'s Requested Properties</h3>
                                <div className="overflow-y-auto max-h-48 space-y-2 pr-1">
                                    {game.properties.filter(p => p.ownerId === tradePartner.playerId).length === 0 ? (
                                        <p className="text-xs text-slate-500 italic py-4">No properties owned</p>
                                    ) : (
                                        game.properties.filter(p => p.ownerId === tradePartner.playerId).map(p => {
                                            const catalog = propertyCatalogById[p.propertyId];
                                            const isImproved = isColorGroupImproved(catalog?.group);
                                            const isChecked = requestedProperties.includes(p.propertyId);

                                            return (
                                                <label
                                                    key={p.propertyId}
                                                    className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer select-none transition-all ${
                                                        isChecked 
                                                            ? 'bg-amber-950/20 border-amber-500/50 text-white font-semibold' 
                                                            : isImproved 
                                                                ? 'border-slate-900 text-slate-600 opacity-50 cursor-not-allowed'
                                                                : 'border-slate-800/80 hover:bg-slate-800/30 text-slate-300'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <input
                                                            type="checkbox"
                                                            disabled={isImproved}
                                                            checked={isChecked}
                                                            onChange={() => {
                                                                if (isChecked) {
                                                                    setRequestedProperties(prev => prev.filter(id => id !== p.propertyId));
                                                                } else {
                                                                    setRequestedProperties(prev => [...prev, p.propertyId]);
                                                                }
                                                            }}
                                                            className="accent-amber-500 rounded cursor-pointer"
                                                        />
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-3 h-3 rounded-full ${groupColors[catalog?.group] || 'bg-slate-700'}`} />
                                                            <span>{catalog?.name || p.propertyName}</span>
                                                            {p.mortgaged && (
                                                                <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/20 px-1 rounded uppercase font-extrabold scale-90">Mortgaged</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {isImproved && (
                                                        <span className="text-[9px] text-red-400 font-bold">Has Houses</span>
                                                    )}
                                                </label>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
                            <button
                                onClick={() => {
                                    setShowTradeModal(false);
                                    setTradePartner(null);
                                }}
                                className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/40 hover:bg-slate-700 text-xs font-bold text-slate-300 cursor-pointer transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        if (offeredCash === 0 && requestedCash === 0 && offeredProperties.length === 0 && requestedProperties.length === 0) {
                                            toast.error('Trade cannot be empty');
                                            return;
                                        }
                                        await proposeTrade(
                                            tradePartner.playerId,
                                            offeredProperties,
                                            requestedProperties,
                                            offeredCash,
                                            requestedCash
                                        );
                                        setShowTradeModal(false);
                                        setTradePartner(null);
                                    } catch (err) {
                                        console.error(err);
                                    }
                                }}
                                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white shadow-lg cursor-pointer transition-colors"
                            >
                                Propose Trade
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
