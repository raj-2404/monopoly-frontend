import { createContext, useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import toast from 'react-hot-toast';
import { boardData, propertyCatalogById } from '../utils/boardData';
import { API_BASE, WS_BASE } from '../config/runtimeConfig';
import gameRules from '../config/game-rules.json';

// eslint-disable-next-line react-refresh/only-export-components
export const GameContext = createContext();

const playSound = (soundName) => {
    try {
        const audio = new Audio(`/sounds/${soundName}`);
        audio.play().catch(e => console.log('Audio playback blocked/failed:', e));
    } catch (err) {
        console.warn('Audio playback error:', err);
    }
};

export const GameProvider = ({ children }) => {
    const getStoredUser = () => {
        const storedUser = localStorage.getItem('vyapar_user');
        if (!storedUser) return null;

        try {
            return JSON.parse(storedUser);
        } catch {
            localStorage.removeItem('vyapar_user');
            return null;
        }
    };

    const [user, setUser] = useState(getStoredUser);
    const [room, setRoom] = useState(null);
    const [game, setGame] = useState(null);
    const [dice, setDice] = useState(null);
    const [logs, setLogs] = useState([]);
    const [currentScreen, setCurrentScreen] = useState(() => user ? 'home' : 'login');
    const [wsConnected, setWsConnected] = useState(false);

    const stompClientRef = useRef(null);
    const roomSubscriptionRef = useRef(null);
    const gameSubscriptionRef = useRef(null);
    const gameRef = useRef(null);
    const roomRef = useRef(null);
    const processedGameVersionRef = useRef(-1);

    useEffect(() => {
        gameRef.current = game;
    }, [game]);

    useEffect(() => {
        roomRef.current = room;
    }, [room]);

    useEffect(() => {
        const checkActiveRoom = async () => {
            if (!user) return;
            try {
                const res = await getAxios().get('/rooms/active');
                const activeRoom = res.data.data;
                if (activeRoom) {
                    setRoom(activeRoom);
                    connectWebSocket(activeRoom.roomId);
                    if (activeRoom.status === 'PLAYING') {
                        await fetchGameState(activeRoom.roomId);
                    } else if (activeRoom.status === 'WAITING') {
                        setCurrentScreen('lobby');
                    }
                }
            } catch (e) {
                console.error('Failed to check active room:', e);
            }
        };
        checkActiveRoom();
    }, [user]);

    // Get Auth Axios Instance
    const getAxios = () => {
        return axios.create({
            baseURL: API_BASE,
            headers: user?.accessToken ? { Authorization: `Bearer ${user.accessToken}` } : {}
        });
    };

    // WebSocket Connection Manager
    const connectWebSocket = (roomId, gameId = null) => {
        if (stompClientRef.current) {
            stompClientRef.current.deactivate();
        }

        const socket = new SockJS(WS_BASE);
        const client = new Client({
            webSocketFactory: () => socket,
            connectHeaders: {
                userId: user?.id
            },
            debug: (str) => console.log('[STOMP]', str),
            reconnectDelay: 1000,
            heartbeatIncoming: 4000,
            heartbeatOutgoing: 4000,
        });

        client.onConnect = () => {
            console.log('STOMP connected');
            setWsConnected(true);

            // Subscribe to Room Lobbies
            if (roomSubscriptionRef.current) {
                roomSubscriptionRef.current.unsubscribe();
            }
            roomSubscriptionRef.current = client.subscribe(`/topic/room/${roomId}`, (msg) => {
                const updatedRoom = JSON.parse(msg.body);
                setRoom(updatedRoom);
                if (updatedRoom.status === 'PLAYING') {
                    // Start Game transition for all players in the lobby room
                    console.log('Room playing! Starting game subscriptions.');
                    const activeGameId = updatedRoom.gameId || updatedRoom.activeGameId || updatedRoom.game?.gameId || roomId;
                    subscribeToGame(client, activeGameId);
                    fetchGameState(activeGameId);
                }
            });

            // Subscribe to Gameplay events if gameId exists
            const activeGameId = gameId || roomId;
            if (activeGameId) {
                subscribeToGame(client, activeGameId);
                fetchGameState(activeGameId); // Sync game state immediately on connection / reconnection
            }
        };

        client.onDisconnect = () => {
            console.log('STOMP disconnected');
            setWsConnected(false);
        };

        client.onStompError = (frame) => {
            console.error('Broker error: ' + frame.headers['message']);
            console.error('Additional details: ' + frame.body);
        };

        client.activate();
        stompClientRef.current = client;
    };

    const subscribeToGame = (client, gameId) => {
        console.log('Subscribing to game events for ID:', gameId);
        
        if (gameSubscriptionRef.current) {
            gameSubscriptionRef.current.unsubscribe();
        }

        gameSubscriptionRef.current = client.subscribe(`/topic/game/${gameId}`, (msg) => {
            const event = JSON.parse(msg.body);
            handleGameEvent(event);
        });
    };

    const disconnectWebSocket = () => {
        if (roomSubscriptionRef.current) {
            roomSubscriptionRef.current.unsubscribe();
            roomSubscriptionRef.current = null;
        }
        if (gameSubscriptionRef.current) {
            gameSubscriptionRef.current.unsubscribe();
            gameSubscriptionRef.current = null;
        }
        if (stompClientRef.current) {
            stompClientRef.current.deactivate();
            stompClientRef.current = null;
        }
        setWsConnected(false);
    };

    // Handle WebSocket Gameplay Events
    const handleGameEvent = (event) => {
        const { eventType, payload, version } = event;
        console.log('WebSocket event:', eventType, payload, 'version:', version);

        if (version !== undefined && version !== null) {
            const parsedVersion = Number(version);
            if (!isNaN(parsedVersion)) {
                if (parsedVersion < processedGameVersionRef.current) {
                    console.log(`[GameContext] Ignoring stale WS event ${eventType} (version ${parsedVersion} < current local ${processedGameVersionRef.current})`);
                    return;
                }
                processedGameVersionRef.current = parsedVersion;
            }
        }

        switch (eventType) {
            case 'ERROR':
                toast.error(payload.message || 'Validation failed');
                break;
            case 'GAME_STARTED':
                toast.success('The match has started!');
                fetchGameState(payload.gameId || room.roomId);
                break;
            case 'PLAYER_JOINED':
                if (payload.connected !== undefined) {
                    updatePlayerState(payload.playerId, { connected: true });
                    toast.success(`${payload.username} has reconnected!`);
                    addLog(`⚡ ${payload.username} reconnected.`);
                }
                break;
            case 'PLAYER_LEFT':
                if (payload.connected !== undefined) {
                    updatePlayerState(payload.playerId, { connected: false });
                    toast.error(`${payload.username} disconnected! 5 minutes to reconnect.`);
                    addLog(`⚡ ${payload.username} disconnected.`);
                }
                break;
            case 'DICE_ROLLED':
                playSound('roll_dice.mp3');
                setDice({
                    diceOne: payload.diceOne,
                    diceTwo: payload.diceTwo,
                    total: payload.total,
                    isDouble: payload.isDouble
                });
                setGame(prev => prev ? ({ ...prev, hasRolled: true }) : prev);
                addLog(`${getPlayerName(payload.playerId)} rolled ${payload.diceOne} & ${payload.diceTwo} (Total: ${payload.total})`);
                break;
            case 'PLAYER_MOVED': {
                const oldPosition = gameRef.current?.players.find(pl => String(pl.playerId).toLowerCase() === String(payload.playerId).toLowerCase())?.position;
                updatePlayerState(payload.playerId, { position: payload.to });
                
                const tile = boardData[payload.to];
                const placeName = tile ? (tile.property ? tile.property.name : (tile.name || tile.type.replaceAll('_', ' '))) : `tile #${payload.to}`;
                addLog(`${getPlayerName(payload.playerId)} moved to ${placeName}`);
                
                // Detect passing START (to position < from position, or exactly 0)
                if (oldPosition !== undefined && (payload.to < oldPosition || payload.to === 0)) {
                    setTimeout(() => {
                        playSound('pass_start.mp3');
                    }, 300);
                    addLog(`🎁 ${getPlayerName(payload.playerId)} passed START and collected ₹${(gameRules?.passStartReward ?? 1500).toLocaleString()}!`);
                }

                // Play community_chance sound when landing on chance or community chest
                if (tile && (tile.type === 'CHANCE' || tile.type === 'COMMUNITY_CHEST')) {
                    playSound('community_chance.mp3');
                }
                break;
            }
            case 'MONEY_UPDATED':
                updatePlayerState(payload.playerId, { balance: payload.balance });
                break;
            case 'RENT_PAID': {
                setTimeout(() => {
                    playSound('pay_rent.mp3');
                }, 300);
                const prop = payload.propertyId !== undefined ? propertyCatalogById[payload.propertyId] : null;
                const propName = prop ? prop.name : '';
                
                // Fallback in case propertyId is missing
                let finalPropName = propName;
                if (!finalPropName) {
                    const payer = gameRef.current?.players.find(pl => String(pl.playerId).toLowerCase() === String(payload.fromPlayer).toLowerCase());
                    const payerTile = payer ? boardData[Number(payer.position)] : null;
                    finalPropName = payerTile?.property ? payerTile.property.name : '';
                }
                
                const propSuffix = finalPropName ? ` for ${finalPropName}` : '';
                addLog(`${getPlayerName(payload.fromPlayer)} paid rent of ₹${payload.amount} to ${getPlayerName(payload.toPlayer)}${propSuffix}`);
                break;
            }
            case 'PROPERTY_PURCHASED': {
                playSound('buy_property.mp3');
                const prop = propertyCatalogById[payload.propertyId];
                const propName = prop ? prop.name : `property #${payload.propertyId}`;
                addLog(`${getPlayerName(payload.ownerId)} purchased ${propName}`);
                refreshGameProperties(payload.propertyId, { ownerId: payload.ownerId, developmentLevel: 0, mortgaged: false });
                setGame(prev => prev ? ({ ...prev, pendingAction: 'NONE' }) : prev);
                break;
            }
            case 'HOUSE_BUILT': {
                playSound('build_house.mp3');
                const prop = propertyCatalogById[payload.propertyId];
                const propName = prop ? prop.name : `property #${payload.propertyId}`;
                addLog(`House built on ${propName} (Level ${payload.level})`);
                refreshGameProperties(payload.propertyId, { developmentLevel: payload.level });
                break;
            }
            case 'HOTEL_BUILT': {
                playSound('build_hotel.mp3');
                const prop = propertyCatalogById[payload.propertyId];
                const propName = prop ? prop.name : `property #${payload.propertyId}`;
                addLog(`Hotel constructed on ${propName}`);
                refreshGameProperties(payload.propertyId, { developmentLevel: 4 });
                break;
            }
            case 'PROPERTY_MORTGAGED': {
                const prop = propertyCatalogById[payload.propertyId];
                const propName = prop ? prop.name : `property #${payload.propertyId}`;
                addLog(`${propName} was mortgaged`);
                refreshGameProperties(payload.propertyId, { mortgaged: true });
                break;
            }
            case 'PROPERTY_UNMORTGAGED': {
                const prop = propertyCatalogById[payload.propertyId];
                const propName = prop ? prop.name : `property #${payload.propertyId}`;
                addLog(`${propName} was unmortgaged`);
                refreshGameProperties(payload.propertyId, { mortgaged: false });
                break;
            }
            case 'PLAYER_SENT_TO_JAIL':
                playSound('go_to_jail.mp3');
                updatePlayerState(payload.playerId, { status: 'IN_JAIL' });
                addLog(`${getPlayerName(payload.playerId)} was sent to Jail!`);
                break;
            case 'PLAYER_RELEASED':
                updatePlayerState(payload.playerId, { status: 'ACTIVE' });
                addLog(`${getPlayerName(payload.playerId)} was released from Jail.`);
                break;
            case 'RECOVERY_STARTED':
                updatePlayerState(payload.playerId, { status: 'RECOVERY' });
                setGame(prev => ({ ...prev, pendingAction: 'RECOVERY' }));
                addLog(`${getPlayerName(payload.playerId)} balance is negative! Entered Asset Liquidation Mode.`);
                break;
            case 'RECOVERY_COMPLETED':
                updatePlayerState(payload.playerId, { status: 'ACTIVE' });
                setGame(prev => ({ ...prev, pendingAction: 'NONE' }));
                addLog(`${getPlayerName(payload.playerId)} successfully recovered from negative balance.`);
                break;
            case 'PLAYER_BANKRUPT':
                playSound('bankruptcy.mp3');
                updatePlayerState(payload.playerId, { status: 'BANKRUPT', balance: 0 });
                addLog(`💀 ${getPlayerName(payload.playerId)} went BANKRUPT and is eliminated!`);
                // Reset ownership for bankrupt player's properties
                setGame(prev => {
                    if (!prev) return null;
                    const props = prev.properties.map(p => {
                        if (p.ownerId && String(p.ownerId).toLowerCase() === String(payload.playerId).toLowerCase()) {
                            return { ...p, ownerId: null, developmentLevel: 0, mortgaged: false };
                        }
                        return p;
                    });
                    return { ...prev, properties: props };
                });
                break;
            case 'TURN_CHANGED': {
                setGame(prev => {
                    if (!prev) return null;
                    return {
                        ...prev,
                        currentTurnPlayerId: payload.currentPlayerId,
                        pendingAction: 'NONE',
                        hasRolled: false
                    };
                });
                // Reset temporary dice state
                setDice(null);
                addLog(`It is now ${getPlayerName(payload.currentPlayerId)}'s turn.`);
                break;
            }
            case 'PROPERTY_UPDATED': {
                console.log('PROPERTY_UPDATED event payload:', payload);
                const cardPlayer = getPlayerName(payload.playerId);
                const tile = boardData[payload.position];
                const cardType = tile?.type === 'CHANCE' ? 'Chance Card' : (tile?.type === 'COMMUNITY_CHEST' ? 'Community Chest Card' : 'Card');

                // Handles complex card results (balance, position, card details)
                if (payload.card) {
                    let actionDesc = '';
                    if (payload.card.action === 'ADD_MONEY') {
                        actionDesc = ` (Collect ₹${payload.card.amount})`;
                    } else if (payload.card.action === 'PAY_MONEY') {
                        actionDesc = ` (Pay ₹${payload.card.amount})`;
                    } else if (payload.card.action === 'GO_TO_JAIL') {
                        actionDesc = ' (Sent to Jail)';
                    } else if (payload.card.action === 'GET_OUT_OF_JAIL') {
                        actionDesc = ' (Get out of Jail free)';
                    } else if (payload.card.action === 'MOVE_TO_START') {
                        actionDesc = ' (Moved to START)';
                    } else if (payload.card.action === 'LOSE_NEXT_TURN') {
                        actionDesc = ' (Lose next turn)';
                    } else if (payload.card.action === 'MOVE_BACK') {
                        actionDesc = ' (Moved back)';
                    }
                    
                    // Delay log to print after DICE_ROLLED and PLAYER_MOVED
                    setTimeout(() => {
                        addLog(`${cardPlayer} drew ${cardType}: "${payload.card.title}"${actionDesc}`);
                    }, 250);
                } else {
                    setTimeout(() => {
                        addLog(`${cardPlayer} drew a ${cardType}.`);
                    }, 250);
                }
                if (payload.playerId) {
                    updatePlayerState(payload.playerId, {
                        balance: payload.balance,
                        position: payload.position,
                        status: payload.status
                    });
                }
                break;
            }
            case 'GAME_FINISHED':
                playSound('win.mp3');
                addLog(`🎉 MATCH OVER! Game finished.`);
                setGame(prev => ({
                    ...prev,
                    status: 'FINISHED',
                    winnerId: payload.winnerId
                }));
                setCurrentScreen('winner');
                break;
            case 'TRADE_PROPOSED':
                toast(`New trade proposal from ${payload.proposerName}!`, { icon: '🤝' });
                addLog(`🤝 ${payload.proposerName} proposed a trade to ${payload.receiverName}.`);
                break;
            case 'TRADE_ACCEPTED':
                playSound('buy_property.mp3');
                toast.success('Trade accepted!');
                addLog(`🤝 Trade between ${getPlayerName(payload.proposerId)} and ${getPlayerName(payload.receiverId)} was ACCEPTED!`);
                break;
            case 'TRADE_REJECTED':
                toast.error('Trade offer was rejected');
                addLog(`🤝 A trade offer was rejected.`);
                break;
            case 'TRADE_CANCELLED':
                addLog(`🤝 A trade offer was cancelled.`);
                break;
            default:
                break;
        }

        // Auto-refresh state from database with a tiny delay to allow database transactions to commit
        const activeId = event.gameId || payload?.gameId || gameRef.current?.gameId;
        if (activeId && eventType !== 'ERROR' && eventType !== 'GAME_FINISHED') {
            setTimeout(() => {
                fetchGameState(activeId);
            }, 150);
        }
    };

    // Helper functions to manage state
    const getPlayerName = (playerId) => {
        const latestGame = gameRef.current;
        if (!latestGame || !latestGame.players || !playerId) return 'Someone';
        const searchId = String(playerId).toLowerCase();
        const p = latestGame.players.find(pl => 
            (pl.playerId && String(pl.playerId).toLowerCase() === searchId) || 
            (pl.id && String(pl.id).toLowerCase() === searchId) ||
            (pl.username && pl.username.toLowerCase() === searchId)
        );
        return p ? p.username : 'Someone';
    };

    const updatePlayerState = (playerId, fields) => {
        const cleanFields = {};
        Object.keys(fields).forEach(key => {
            if (fields[key] !== undefined && fields[key] !== null) {
                cleanFields[key] = fields[key];
            }
        });
        if (Object.keys(cleanFields).length === 0) return;

        setGame(prev => {
            if (!prev) return null;
            const updated = prev.players.map(p => {
                if (String(p.playerId).toLowerCase() === String(playerId).toLowerCase()) {
                    return { ...p, ...cleanFields };
                }
                return p;
            });
            return { ...prev, players: updated };
        });
    };

    const refreshGameProperties = (propertyId, fields) => {
        setGame(prev => {
            if (!prev) return null;
            const updated = prev.properties.map(p => {
                if (p.propertyId === propertyId) {
                    const cleanFields = { ...fields };
                    if (cleanFields.ownerId !== undefined && cleanFields.ownerId !== null) {
                        cleanFields.ownerId = String(cleanFields.ownerId).toLowerCase();
                    }
                    return { ...p, ...cleanFields };
                }
                return p;
            });
            return { ...prev, properties: updated };
        });
    };

    const addLog = (msg) => {
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-40));
    };

    // REST Actions
    const login = async (username, password) => {
        try {
            const res = await axios.post(`${API_BASE}/auth/login`, { username, password });
            const loggedUser = res.data.data;
            setUser(loggedUser);
            localStorage.setItem('vyapar_user', JSON.stringify(loggedUser));
            setCurrentScreen('home');
            toast.success(`Welcome, ${loggedUser.username}!`);
        } catch (e) {
            console.error(e);
            toast.error(e.response?.data?.message || 'Login failed');
        }
    };

    const logout = () => {
        setUser(null);
        setRoom(null);
        setGame(null);
        processedGameVersionRef.current = -1;
        setLogs([]);
        setDice(null);
        disconnectWebSocket();
        localStorage.removeItem('vyapar_user');
        setCurrentScreen('login');
        toast.success('Logged out successfully');
    };

    const createRoom = async (maxPlayers) => {
        try {
            const res = await getAxios().post('/rooms', { maxPlayers });
            const createdRoom = res.data.data;
            setRoom(createdRoom);
            setCurrentScreen('lobby');
            connectWebSocket(createdRoom.roomId);
            toast.success('Room created! Share room code: ' + createdRoom.roomCode);
        } catch (e) {
            console.error(e);
            toast.error(e.response?.data?.message || 'Failed to create room');
        }
    };

    const joinRoom = async (roomCode) => {
        try {
            const res = await getAxios().post(`/rooms/${roomCode}/join`);
            const joinedRoom = res.data.data;
            setRoom(joinedRoom);
            setCurrentScreen('lobby');
            connectWebSocket(joinedRoom.roomId);
            toast.success('Joined lobby successfully!');
        } catch (e) {
            console.error(e);
            toast.error(e.response?.data?.message || 'Failed to join room');
        }
    };

    const leaveRoom = async () => {
        if (!room) {
            disconnectWebSocket();
            setRoom(null);
            setGame(null);
            processedGameVersionRef.current = -1;
            setLogs([]);
            setCurrentScreen('home');
            return;
        }
        try {
            await getAxios().delete(`/rooms/${room.roomId}/leave`);
            toast.success('Left room');
        } catch (e) {
            console.error(e);
            toast.error(e.response?.data?.message || 'Failed to leave room');
        } finally {
            disconnectWebSocket();
            setRoom(null);
            setGame(null);
            processedGameVersionRef.current = -1;
            setLogs([]);
            setCurrentScreen('home');
        }
    };

    const toggleReady = async () => {
        if (!room) return;
        try {
            await getAxios().post(`/rooms/${room.roomId}/ready`);
        } catch (e) {
            console.error(e);
            toast.error(e.response?.data?.message || 'Failed to change ready status');
        }
    };

    const updateTokenColor = useCallback(async (hexColor) => {
        if (!roomRef.current) return;
        
        // Find current player in the room state
        const meInRoom = roomRef.current.players.find(p => p.username === user?.username);
        // If current color already matches, short-circuit to prevent infinite loops/redundant requests!
        if (meInRoom && meInRoom.tokenColor === hexColor) {
            return;
        }

        try {
            await getAxios().put(`/rooms/${roomRef.current.roomId}/token-color`, null, {
                params: { tokenColor: hexColor }
            });
        } catch (e) {
            console.error(e);
            toast.error(e.response?.data?.message || 'Failed to update token color');
        }
    }, [user?.username]);

    const startGame = async () => {
        if (!room) return;
        try {
            const res = await getAxios().post(`/rooms/${room.roomId}/start`);
            const gameId = res.data.data;
            // Subscribe to game actions
            if (stompClientRef.current) {
                subscribeToGame(stompClientRef.current, gameId);
            }
            fetchGameState(gameId);
        } catch (e) {
            console.error(e);
            toast.error(e.response?.data?.message || 'Failed to start game');
        }
    };

    const fetchGameState = async (gameId) => {
        try {
            const res = await getAxios().get(`/games/${gameId}`);
            const state = res.data.data;
            if (state && state.version !== undefined && state.version !== null) {
                const parsedVersion = Number(state.version);
                if (!isNaN(parsedVersion)) {
                    if (parsedVersion < processedGameVersionRef.current) {
                        console.log(`[GameContext] Ignoring stale REST state (version ${parsedVersion} < current local ${processedGameVersionRef.current})`);
                        return;
                    }
                    processedGameVersionRef.current = parsedVersion;
                }
            }
            if (state && state.players) {
                state.players = state.players.map(p => ({
                    ...p,
                    playerId: String(p.playerId).toLowerCase(),
                    position: p.boardPosition !== undefined ? p.boardPosition : p.position
                }));
            }
            if (state && state.properties) {
                state.properties = state.properties.map(p => ({
                    ...p,
                    ownerId: p.ownerId ? String(p.ownerId).toLowerCase() : null
                }));
            }
            setGame(state);

            // Fetch game transactions to populate the action logs
            try {
                const historyRes = await getAxios().get(`/games/${gameId}/transactions`);
                const history = historyRes.data.data;
                if (history && history.length > 0) {
                    const mappedLogs = history.map(t => {
                        const time = t.createdAt ? new Date(t.createdAt).toLocaleTimeString() : new Date().toLocaleTimeString();
                        return `[${time}] ${t.description}`;
                    });
                    setLogs(mappedLogs.slice(-40));
                }
            } catch (historyErr) {
                console.error('Failed to load transaction logs:', historyErr);
            }

            setCurrentScreen(prevScreen => {
                if (prevScreen !== 'game') {
                    addLog('Loaded game state. Let the match begin!');
                    return 'game';
                }
                return prevScreen;
            });
        } catch (e) {
            console.error(e);
            toast.error('Failed to fetch game state');
        }
    };

    // WebSocket action sender
    const sendGameAction = (action, propertyId = null, options = {}) => {
        const client = stompClientRef.current;
        const activeGame = gameRef.current;

        if (!client || (!wsConnected && !client.connected)) {
            toast.error('WebSocket not connected');
            return false;
        }

        if (!activeGame) {
            toast.error('Game state is not loaded yet');
            return false;
        }

        // Find active player ID in game
        const activePlayer = activeGame.players.find(p => p.username === user.username);
        if (!activePlayer) {
            toast.error('Player not found in active game sessions');
            return false;
        }

        const payload = {
            gameId: activeGame.gameId,
            playerId: activePlayer.playerId,
            action: action,
            propertyId: propertyId
        };

        client.publish({
            destination: '/app/game/action',
            body: JSON.stringify(payload)
        });

        if (options.endTurnAfter) {
            window.setTimeout(() => {
                const latestGame = gameRef.current;
                const latestPlayer = latestGame?.players.find(p => p.username === user.username);
                const stillSameTurn = latestGame?.currentTurnPlayerId === latestPlayer?.playerId;

                if (stillSameTurn && client.connected) {
                    client.publish({
                        destination: '/app/game/action',
                        body: JSON.stringify({
                            gameId: latestGame.gameId,
                            playerId: latestPlayer.playerId,
                            action: 'END_TURN',
                            propertyId: null
                        })
                    });
                }
            }, options.endTurnDelayMs ?? 350);
        }

        window.setTimeout(() => {
            const latestGameId = gameRef.current?.gameId;
            if (latestGameId) fetchGameState(latestGameId);
        }, 600);

        return true;
    };

    const proposeTrade = async (receiverId, offeredProperties, requestedProperties, offeredCash, requestedCash) => {
        if (!game) return null;
        try {
            const res = await getAxios().post(`/games/${game.gameId}/trades`, {
                receiverId,
                offeredProperties,
                requestedProperties,
                offeredCash,
                requestedCash
            });
            toast.success('Trade proposed successfully');
            return res.data.data;
        } catch (e) {
            console.error(e);
            toast.error(e.response?.data?.message || 'Failed to propose trade');
            throw e;
        }
    };

    const fetchPendingTrades = async () => {
        if (!game) return [];
        try {
            const res = await getAxios().get(`/games/${game.gameId}/trades/pending`);
            return res.data.data;
        } catch (e) {
            console.error(e);
            return [];
        }
    };

    const acceptTrade = async (tradeId) => {
        if (!game) return;
        try {
            await getAxios().post(`/games/${game.gameId}/trades/${tradeId}/accept`);
            toast.success('Trade accepted successfully');
            fetchGameState(game.gameId);
        } catch (e) {
            console.error(e);
            toast.error(e.response?.data?.message || 'Failed to accept trade');
            throw e;
        }
    };

    const rejectTrade = async (tradeId) => {
        if (!game) return;
        try {
            await getAxios().post(`/games/${game.gameId}/trades/${tradeId}/reject`);
            toast.success('Trade rejected');
            fetchGameState(game.gameId);
        } catch (e) {
            console.error(e);
            toast.error(e.response?.data?.message || 'Failed to reject trade');
            throw e;
        }
    };

    const cancelTrade = async (tradeId) => {
        if (!game) return;
        try {
            await getAxios().post(`/games/${game.gameId}/trades/${tradeId}/cancel`);
            toast.success('Trade cancelled');
            fetchGameState(game.gameId);
        } catch (e) {
            console.error(e);
            toast.error(e.response?.data?.message || 'Failed to cancel trade');
            throw e;
        }
    };

    // Automatic Synchronization when the tab is focused or returns from background
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                const activeId = game?.gameId || room?.roomId;
                if (activeId) {
                    console.log('Visibility changed to visible. Fetching latest state...');
                    fetchGameState(activeId);
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [game?.gameId, room?.roomId]);

    return (
        <GameContext.Provider value={{
            user,
            room,
            game,
            dice,
            logs,
            currentScreen,
            wsConnected,
            login,
            logout,
            createRoom,
            joinRoom,
            leaveRoom,
            toggleReady,
            updateTokenColor,
            startGame,
            sendGameAction,
            proposeTrade,
            fetchPendingTrades,
            acceptTrade,
            rejectTrade,
            cancelTrade
        }}>
            {children}
        </GameContext.Provider>
    );
};
