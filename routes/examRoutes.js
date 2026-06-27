// routes/examRoutes.js
const express = require('express');
const pool = require('../db/connection');
const authenticateToken = require('../middleware/auth');
const router = express.Router();

// Aquí podrías tener un banco de preguntas fijo en el servidor, o en la BD.
// Por simplicidad, lo dejamos como un array en el código, pero el frontend ya tiene sus propias preguntas.
// Este endpoint es opcional si el frontend ya maneja las preguntas.
router.get('/questions', (req, res) => {
    // Puedes devolver el mismo banco de preguntas que usas en el frontend.
    // O mejor, no usar este endpoint y que el frontend sea quien gestione las preguntas,
    // y solo uses este para guardar las respuestas.
    res.json({ success: true, message: 'Las preguntas se manejan desde el frontend.' });
});

// Guardar una respuesta del examen (Requiere Autenticación)
router.post('/answer', authenticateToken, async (req, res) => {
    const { questionId, correct } = req.body;
    const userId = req.user.userId;

    if (questionId === undefined || correct === undefined) {
        return res.status(400).json({ success: false, message: 'Faltan datos de la respuesta.' });
    }

    try {
        await pool.query(
            'INSERT INTO exam_answers (user_id, question_id, correct) VALUES ($1, $2, $3)',
            [userId, questionId, correct]
        );
        res.json({ success: true, message: 'Respuesta registrada.' });
    } catch (error) {
        console.error('Error guardando respuesta de examen:', error);
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

// Obtener la exactitud del usuario en el examen (Requiere Autenticación)
router.get('/accuracy', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const result = await pool.query(
            `SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN correct THEN 1 ELSE 0 END) AS correct
             FROM exam_answers
             WHERE user_id = $1`,
            [userId]
        );
        const { total, correct } = result.rows[0];
        res.json({
            success: true,
            data: {
                total: parseInt(total) || 0,
                correct: parseInt(correct) || 0,
                accuracy: total > 0 ? Math.round((correct / total) * 100) : 0
            }
        });
    } catch (error) {
        console.error('Error obteniendo exactitud del examen:', error);
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

module.exports = router;