// server.js - COMPLETO CON DASHBOARD DOCENTE
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 3000;

// ✅ CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Verificar que DATABASE_URL existe
if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL no está configurada en las variables de entorno');
}

// Conexión a la base de datos
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined
});

// ══════════════════════════════════════════════════════════════════════
//  INICIALIZAR FIREBASE ADMIN SDK
// ══════════════════════════════════════════════════════════════════════
if (!admin.apps.length && process.env.FIREBASE_PROJECT_ID) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            }),
        });
        console.log('✅ Firebase Admin SDK inicializado');
    } catch (error) {
        console.error('❌ Error inicializando Firebase:', error.message);
    }
}

// ══════════════════════════════════════════════════════════════════════
//  MIDDLEWARE DE AUTENTICACIÓN
// ══════════════════════════════════════════════════════════════════════

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ success: false, message: 'Token no proporcionado' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'secret_key', (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// Middleware para verificar que es el profesor
const isTeacher = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'Token requerido' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
        const teacherEmails = ['profesor@email.com', 'docente@univ.bo', 'patricia@univ.bo'];
        if (teacherEmails.includes(decoded.email)) {
            req.user = decoded;
            next();
        } else {
            res.status(403).json({ success: false, message: 'Acceso solo para profesores' });
        }
    } catch (error) {
        res.status(401).json({ success: false, message: 'Token inválido' });
    }
};

// ══════════════════════════════════════════════════════════════════════
//  RUTAS DE AUTENTICACIÓN
// ══════════════════════════════════════════════════════════════════════

// Registro de usuario
app.post('/api/auth/register', async (req, res) => {
    console.log('📝 Registro recibido:', req.body);
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ 
            success: false, 
            message: 'Faltan datos obligatorios: username, email, password' 
        });
    }

    try {
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

        const hashedPassword = await bcrypt.hash(password, 10);
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
    console.log('🔑 Login recibido:', req.body.email);
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

        const token = jwt.sign(
            { userId: user.id, email: user.email, username: user.username },
            process.env.JWT_SECRET || 'secret_key',
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

// Login con Google (Firebase)
app.post('/api/auth/google', async (req, res) => {
    const { firebaseToken } = req.body;
    console.log('🔑 Login con Google recibido');
    
    if (!firebaseToken) {
        return res.status(400).json({ 
            success: false, 
            message: 'Falta el token de Firebase.' 
        });
    }

    try {
        if (!admin.apps.length) {
            return res.status(500).json({ 
                success: false, 
                message: 'Firebase no está configurado.' 
            });
        }

        const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
        const { uid, email, name } = decodedToken;

        let userResult = await pool.query(
            'SELECT * FROM users WHERE firebase_uid = $1 OR email = $2',
            [uid, email]
        );
        
        let user = userResult.rows[0];
        if (!user) {
            const newUserResult = await pool.query(
                `INSERT INTO users (username, email, firebase_uid) 
                 VALUES ($1, $2, $3) 
                 RETURNING *`,
                [name || email.split('@')[0], email, uid]
            );
            user = newUserResult.rows[0];
        } else if (!user.firebase_uid) {
            await pool.query(
                'UPDATE users SET firebase_uid = $1 WHERE id = $2',
                [uid, user.id]
            );
            user.firebase_uid = uid;
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email, username: user.username },
            process.env.JWT_SECRET || 'secret_key',
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
        console.error('Error en login con Google:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor.' 
        });
    }
});

// ══════════════════════════════════════════════════════════════════════
//  RUTAS DE PUNTUACIONES
// ══════════════════════════════════════════════════════════════════════

// Obtener Top 10
app.get('/api/scores/top', async (req, res) => {
    console.log('🏆 Top 10 solicitado');
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
    console.log('💾 Guardando puntuación:', req.body);
    const { username, score, wave, mode, duration_seconds } = req.body;
    
    if (!score) {
        return res.status(400).json({ 
            success: false, 
            message: 'La puntuación es obligatoria.' 
        });
    }

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
            `INSERT INTO game_sessions (user_id, mode, score, wave, duration_seconds)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, mode || 'manual', score, wave || 1, duration_seconds || 0]
        );

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

// Obtener estadísticas del usuario
app.get('/api/scores/user-stats', authenticateToken, async (req, res) => {
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
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor.' 
        });
    }
});

// ══════════════════════════════════════════════════════════════════════
//  RUTAS DE EXAMEN
// ══════════════════════════════════════════════════════════════════════

app.get('/api/exam/questions', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Las preguntas se manejan desde el frontend.' 
    });
});

app.post('/api/exam/answer', authenticateToken, async (req, res) => {
    const { questionId, correct } = req.body;
    const userId = req.user.userId;

    if (questionId === undefined || correct === undefined) {
        return res.status(400).json({ 
            success: false, 
            message: 'Faltan datos de la respuesta.' 
        });
    }

    try {
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

app.get('/api/exam/accuracy', authenticateToken, async (req, res) => {
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
        res.status(500).json({ 
            success: false, 
            message: 'Error en el servidor.' 
        });
    }
});

// ══════════════════════════════════════════════════════════════════════
//  RUTAS DEL DASHBOARD DOCENTE
// ══════════════════════════════════════════════════════════════════════

// 📊 1. Estadísticas Generales
app.get('/api/admin/stats', isTeacher, async (req, res) => {
    try {
        const totalStudents = await pool.query('SELECT COUNT(*) FROM users');
        const totalGames = await pool.query('SELECT COUNT(*) FROM game_sessions');
        const totalTime = await pool.query('SELECT SUM(duration_seconds) FROM game_sessions');
        const avgScore = await pool.query('SELECT AVG(score) FROM game_sessions');
        
        res.json({
            success: true,
            data: {
                totalStudents: parseInt(totalStudents.rows[0].count),
                totalGames: parseInt(totalGames.rows[0].count),
                totalTimeSeconds: parseInt(totalTime.rows[0].sum) || 0,
                avgScore: Math.round(avgScore.rows[0].avg) || 0
            }
        });
    } catch (error) {
        console.error('Error en stats generales:', error);
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

// 📋 2. Actividad Reciente de Estudiantes
app.get('/api/admin/activity', isTeacher, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.username,
                u.email,
                COUNT(g.id) as total_games,
                MAX(g.score) as best_score,
                MAX(g.wave) as best_wave,
                SUM(g.duration_seconds) as total_time,
                MAX(g.played_at) as last_played,
                ROUND(AVG(g.score)) as avg_score
            FROM users u
            LEFT JOIN game_sessions g ON u.id = g.user_id
            GROUP BY u.id, u.username, u.email
            ORDER BY last_played DESC NULLS LAST
            LIMIT 50
        `);
        
        const students = result.rows.map(row => ({
            username: row.username,
            email: row.email,
            totalGames: parseInt(row.total_games) || 0,
            bestScore: parseInt(row.best_score) || 0,
            bestWave: parseInt(row.best_wave) || 0,
            totalTime: parseInt(row.total_time) || 0,
            avgScore: parseInt(row.avg_score) || 0,
            lastPlayed: row.last_played
        }));
        
        res.json({ success: true, data: students });
    } catch (error) {
        console.error('Error en actividad:', error);
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

// 📊 3. Uso de Algoritmos por Estudiante
app.get('/api/admin/algorithms/:userId?', isTeacher, async (req, res) => {
    try {
        const userId = req.params.userId;
        let query = `
            SELECT 
                mode,
                COUNT(*) as times_used
            FROM game_sessions
        `;
        const params = [];
        if (userId) {
            query += ` WHERE user_id = $1 GROUP BY mode`;
            params.push(userId);
        } else {
            query += ` GROUP BY mode`;
        }
        
        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error en algoritmos:', error);
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

// 📈 4. Rendimiento en Exámenes
app.get('/api/admin/exam-performance', isTeacher, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.username,
                u.email,
                COUNT(e.id) as total_answers,
                SUM(CASE WHEN e.correct THEN 1 ELSE 0 END) as correct_answers,
                ROUND(SUM(CASE WHEN e.correct THEN 1 ELSE 0 END)::decimal / NULLIF(COUNT(e.id), 0) * 100, 2) as accuracy
            FROM users u
            LEFT JOIN exam_answers e ON u.id = e.user_id
            GROUP BY u.id, u.username, u.email
            HAVING COUNT(e.id) > 0
            ORDER BY accuracy DESC
        `);
        
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error en examen:', error);
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

// ⏰ 5. Actividad por Hora
app.get('/api/admin/hourly-activity', isTeacher, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                EXTRACT(HOUR FROM played_at) as hour,
                COUNT(*) as games
            FROM game_sessions
            GROUP BY hour
            ORDER BY hour
        `);
        
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error en actividad horaria:', error);
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

// 🚨 6. Estudiantes con bajo rendimiento
app.get('/api/admin/low-performance', isTeacher, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.username,
                u.email,
                MAX(g.played_at) as last_played,
                COUNT(g.id) as total_games
            FROM users u
            LEFT JOIN game_sessions g ON u.id = g.user_id
            GROUP BY u.id, u.username, u.email
            HAVING MAX(g.played_at) < NOW() - INTERVAL '7 days' OR COUNT(g.id) = 0
            ORDER BY last_played NULLS FIRST
        `);
        
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error en bajo rendimiento:', error);
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

// ══════════════════════════════════════════════════════════════════════
//  RUTA PRINCIPAL
// ══════════════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
    res.json({ 
        message: '✅ Kernel Defender API - Online!',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        database: process.env.DATABASE_URL ? '✅ Conectado' : '❌ No configurado',
        endpoints: {
            auth: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login',
                google: 'POST /api/auth/google'
            },
            scores: {
                top: 'GET /api/scores/top',
                save: 'POST /api/scores/save',
                userStats: 'GET /api/scores/user-stats'
            },
            exam: {
                questions: 'GET /api/exam/questions',
                answer: 'POST /api/exam/answer',
                accuracy: 'GET /api/exam/accuracy'
            },
            admin: {
                stats: 'GET /api/admin/stats',
                activity: 'GET /api/admin/activity',
                algorithms: 'GET /api/admin/algorithms',
                examPerformance: 'GET /api/admin/exam-performance',
                hourlyActivity: 'GET /api/admin/hourly-activity',
                lowPerformance: 'GET /api/admin/low-performance'
            }
        }
    });
});

// ══════════════════════════════════════════════════════════════════════
//  CREAR TABLAS EN LA BASE DE DATOS
// ══════════════════════════════════════════════════════════════════════

const createTables = async () => {
    if (!process.env.DATABASE_URL) {
        console.log('⚠️ DATABASE_URL no configurada. No se crearán tablas.');
        return;
    }
    
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

// ══════════════════════════════════════════════════════════════════════
//  INICIAR SERVIDOR
// ══════════════════════════════════════════════════════════════════════

app.listen(port, async () => {
    console.log(`🚀 Servidor de Kernel Defender escuchando en el puerto ${port}`);
    console.log(`🌐 URL: http://localhost:${port}`);
    await createTables();
    console.log('✅ Servidor listo para recibir peticiones');
});