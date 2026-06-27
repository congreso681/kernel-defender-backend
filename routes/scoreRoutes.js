// routes/scoreRoutes.js
const express = require('express');
const pool = require('../db/connection');
const authenticateToken = require('../middleware/auth');
const router = express.Router();

// Obtener Top 10 (Público)
router.get('/top', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.username, hs.score, hs.wave, hs.achieved_at
             FROM high_scores hs
             JOIN users u ON hs.user_id = u.id
             ORDER BY hs.score DESC
             LIMIT 10`
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error obteniendo top scores:', error);
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

// Guardar una puntuación (Requiere Autenticación)
router.post('/save', authenticateToken, async (req, res) => {
    const { score, wave, mode, duration_seconds } = req.body;
    const userId = req.user.userId;

    if (!score) {
        return res.status(400).json({ success: false, message: 'La puntuación es obligatoria.' });
    }

    try {
        // 1. Guardar en la tabla de sesiones de juego
        await pool.query(
            `INSERT INTO game_sessions (user_id, mode, score, wave, duration_seconds)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, mode, score, wave, duration_seconds]
        );

        // 2. Guardar en la tabla de High Scores
        await pool.query(
            `INSERT INTO high_scores (user_id, score, wave)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO UPDATE SET
                 score = EXCLUDED.score,
                 wave = EXCLUDED.wave,
                 achieved_at = CURRENT_TIMESTAMP
             WHERE high_scores.score < EXCLUDED.score`,
            [userId, score, wave]
        );

        res.json({ success: true, message: 'Puntuación guardada correctamente.' });
    } catch (error) {
        console.error('Error guardando puntuación:', error);
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

// Obtener estadísticas de un usuario (Requiere Autenticación)
router.get('/user-stats', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const statsResult = await pool.query(
            `SELECT
                COUNT(*) AS total_games,
                MAX(score) AS best_score,
                MAX(wave) AS best_wave,
                AVG(score) AS avg_score
             FROM game_sessions
             WHERE user_id = $1`,
            [userId]
        );

        const highScoreResult = await pool.query(
            `SELECT score, wave, achieved_at
             FROM high_scores
             WHERE user_id = $1`,
            [userId]
        );

        res.json({
            success: true,
            data: {
                stats: statsResult.rows[0] || {},
                highScore: highScoreResult.rows[0] || null
            }
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas del usuario:', error);
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

// ⬇️ ¡ESTA LÍNEA ES CRÍTICA!
module.exports = router;