// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db/connection');

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Importar rutas
const authRoutes = require('./routes/authRoutes');
const scoreRoutes = require('./routes/scoreRoutes');
const examRoutes = require('./routes/examRoutes');

// Usar las rutas
app.use('/api/auth', authRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/exam', examRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
    res.json({ message: 'Kernel Defender API - Online!' });
});

// Función para crear tablas
const createTables = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                firebase_uid TEXT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                mode TEXT,
                score INTEGER,
                wave INTEGER,
                duration_seconds INTEGER,
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS high_scores (
                id SERIAL PRIMARY KEY,
                user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                score INTEGER,
                wave INTEGER,
                achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS exam_answers (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                question_id INTEGER,
                correct BOOLEAN,
                answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tablas creadas/verificadas exitosamente.');
    } catch (error) {
        console.error('❌ Error creando tablas:', error);
    }
};

// Iniciar servidor
app.listen(port, async () => {
    console.log(`🚀 Servidor de Kernel Defender escuchando en el puerto ${port}`);
    await createTables();
});