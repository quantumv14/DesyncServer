import express from 'express';
import { GameDig } from 'gamedig';

const router = express.Router();

const SERVER_IP = '92.62.251.104';
const SERVER_PORT = 27015;

// Initialize GameDig instance
const gamedig = new GameDig();

// @route   GET /api/server-status
// @desc    Get CS2 server status
// @access  Public
router.get('/', async (req, res) => {
  try {
    const query = {
      type: 'counterstrike2',
      host: SERVER_IP,
      port: SERVER_PORT,
      requestRules: true,
      requestPlayers: true,
      socketTimeout: 5000
    };

    const state = await gamedig.query(query);
    
    // Calculate ping (if available) or use a default calculation
    // The ping is usually in the response, but we'll calculate status rate
    const ping = state.ping || 0;
    
    // Calculate status rate from 0% to 100%
    // Lower ping = higher status rate
    // We'll use a formula: 100% for ping < 50ms, decreasing to 0% for ping > 300ms
    let statusRate = 100;
    if (ping > 50) {
      if (ping >= 300) {
        statusRate = 0;
      } else {
        statusRate = Math.max(0, 100 - ((ping - 50) / 250) * 100);
      }
    }

    // Format response
    const response = {
      success: true,
      server: {
        name: state.name || 'CS2 Server',
        map: state.map || 'Unknown',
        players: {
          current: state.players.length || 0,
          max: state.maxplayers || 0,
          list: state.players.map(player => ({
            name: player.name || 'Unknown',
            score: player.score || 0,
            duration: player.raw?.time || 0
          })) || []
        },
        ping: ping,
        statusRate: Math.round(statusRate),
        online: true,
        raw: {
          game: state.raw?.game || 'Unknown',
          version: state.raw?.version || 'Unknown'
        }
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Server status query error:', error.message || error);
    
    // Server is likely offline or unreachable
    res.json({
      success: true,
      server: {
        name: 'Desync CS2 Server',
        map: 'Offline',
        players: {
          current: 0,
          max: 32,
          list: []
        },
        ping: -1,
        statusRate: 0,
        online: false,
        raw: {
          game: 'Counter-Strike 2',
          version: 'Unknown'
        },
        error: 'Server is offline or unreachable'
      }
    });
  }
});

export default router;

