// server.js - VERSIÓN COMPLETA CON RUTAS INLINE
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Conexión a la base de datos
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ============================================
// RUTAS DE AUTENTICACIÓN
// ============================================

// Registro de usuario
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ 
            success: false, 
            message: 'Faltan datos obligatorios: username, email, password' 
        });
    }

    try {
        // Verificar si el usuario ya existe
        const userCheck = await pool.query(
            'SELECT id FROM users WHERE email = $1 OR username = $2',
            [email, username]
        );
        
        if (userCheck.rows.length > 0) {
            return res.status(409).json({ 
                success: false, 
                message: 'El usuario o correo ya existe.' 
            });
        }

        // Hashear contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insertar usuario
        const result = await pool.query(
            `INSERT INTO users (username, email, password_hash) 
             VALUES ($1, $2, $3) 
             RETURNING id, username, email, created_at`,
            [username, email, hashedPassword]
        );

        res.status(201).json({ 
            success: true, 
            user: result.rows[0] 
        });
    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor.' 
        });
    }
});

// Login de usuario
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ 
            success: false, 
            message: 'Faltan email o contraseña.' 
        });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales inválidas.' 
            });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        
        if (!match) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales inválidas.' 
            });
        }

        // Generar JWT
        const token = jwt.sign(
            { userId: user.id, email: user.email, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ 
            success: true, 
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor.' 
        });
    }
});

// ============================================
// RUTAS DE PUNTUACIONES
// ============================================

// Obtener Top 10
app.get('/api/scores/top', async (req, res) => {
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
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor.' 
        });
    }
});

// Guardar puntuación
app.post('/api/scores/save', async (req, res) => {
    const { username, score, wave, mode, duration_seconds } = req.body;
    
    if (!score) {
        return res.status(400).json({ 
            success: false, 
            message: 'La puntuación es obligatoria.' 
        });
    }

    try {
        // Buscar o crear usuario
        let userResult = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username || 'anonymous']
        );
        
        let userId;
        if (userResult.rows.length === 0) {
            const newUser = await pool.query(
                `INSERT INTO users (username, email) 
                 VALUES ($1, $2) 
                 RETURNING id`,
                [username || 'anonymous', `${username || 'anonymous'}@temp.com`]
            );
            userId = newUser.rows[0].id;
        } else {
            userId = userResult.rows[0].id;
        }

        // Guardar sesión de juego
        await pool.query(
            `INSERT INTO game_sessions (user_id, mode, score, wave, duration_seconds)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, mode || 'manual', score, wave || 1, duration_seconds || 0]
        );

        // Actualizar high scores
        await pool.query(
            `INSERT INTO high_scores (user_id, score, wave)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO UPDATE SET
                 score = EXCLUDED.score,
                 wave = EXCLUDED.wave,
                 achieved_at = CURRENT_TIMESTAMP
             WHERE high_scores.score < EXCLUDED.score`,
            [userId, score, wave || 1]
        );

        res.json({ 
            success: true, 
            message: 'Puntuación guardada correctamente.' 
        });
    } catch (error) {
        console.error('Error guardando puntuación:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor.' 
        });
    }
});

// ============================================
// RUTAS DE EXAMEN
// ============================================

app.get('/api/exam/questions', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Las preguntas se manejan desde el frontend.' 
    });
});

app.post('/api/exam/answer', async (req, res) => {
    const { username, questionId, correct } = req.body;
    
    try {
        let userResult = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username || 'anonymous']
        );
        
        let userId;
        if (userResult.rows.length === 0) {
            const newUser = await pool.query(
                `INSERT INTO users (username, email) 
                 VALUES ($1, $2) 
                 RETURNING id`,
                [username || 'anonymous', `${username || 'anonymous'}@temp.com`]
            );
            userId = newUser.rows[0].id;
        } else {
            userId = userResult.rows[0].id;
        }

        await pool.query(
            `INSERT INTO exam_answers (user_id, question_id, correct) 
             VALUES ($1, $2, $3)`,
            [userId, questionId, correct]
        );
        
        res.json({ 
            success: true, 
            message: 'Respuesta registrada.' 
        });
    } catch (error) {
        console.error('Error guardando respuesta de examen:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor.' 
        });
    }
});

// ============================================
// RUTA DE PRUEBA
// ============================================

app.get('/', (req, res) => {
    res.json({ 
        message: '✅ Kernel Defender API - Online!',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
            register: 'POST /api/auth/register {username, email, password}',
            login: 'POST /api/auth/login {email, password}',
            topScores: 'GET /api/scores/top',
            saveScore: 'POST /api/scores/save {username, score, wave, mode}',
            examQuestions: 'GET /api/exam/questions',
            examAnswer: 'POST /api/exam/answer {username, questionId, correct}'
        }
    });
});

// ============================================
// CREAR TABLAS EN LA BASE DE DATOS
// ============================================

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
        console.log('✅ Tabla users creada/verificada');

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
        console.log('✅ Tabla game_sessions creada/verificada');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS high_scores (
                id SERIAL PRIMARY KEY,
                user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                score INTEGER,
                wave INTEGER,
                achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tabla high_scores creada/verificada');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS exam_answers (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                question_id INTEGER,
                correct BOOLEAN,
                answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tabla exam_answers creada/verificada');

        console.log('✅ Todas las tablas creadas/verificadas exitosamente.');
    } catch (error) {
        console.error('❌ Error creando tablas:', error);
    }
};

// ============================================
// INICIAR SERVIDOR
// ============================================

app.listen(port, async () => {
    console.log(`🚀 Servidor de Kernel Defender escuchando en el puerto ${port}`);
    console.log(`🌐 URL: http://localhost:${port}`);
    await createTables();
    console.log('✅ Servidor listo para recibir peticiones');
});