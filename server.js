// server.js - VERSIÓN DIAGNÓSTICA
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

console.log('📦 Cargando módulos...');

// Intentar cargar cada módulo por separado para identificar el error
try {
    console.log('🔄 Cargando authRoutes...');
    const authRoutes = require('./routes/authRoutes');
    console.log('✅ authRoutes cargado correctamente');
    
    console.log('🔄 Cargando scoreRoutes...');
    const scoreRoutes = require('./routes/scoreRoutes');
    console.log('✅ scoreRoutes cargado correctamente');
    
    console.log('🔄 Cargando examRoutes...');
    const examRoutes = require('./routes/examRoutes');
    console.log('✅ examRoutes cargado correctamente');
    
    // Usar las rutas
    app.use('/api/auth', authRoutes);
    app.use('/api/scores', scoreRoutes);
    app.use('/api/exam', examRoutes);
    
    console.log('✅ Todas las rutas configuradas correctamente');
} catch (error) {
    console.error('❌ Error cargando módulos:', error.message);
    console.error('📄 Stack trace:', error.stack);
}

// Ruta de prueba
app.get('/', (req, res) => {
    res.json({ message: 'Kernel Defender API - Online!' });
});

// Ruta de prueba adicional
app.get('/test', (req, res) => {
    res.json({ 
        status: 'OK',
        message: 'Servidor funcionando correctamente',
        timestamp: new Date().toISOString()
    });
});

// Iniciar servidor
app.listen(port, () => {
    console.log(`🚀 Servidor de Kernel Defender escuchando en el puerto ${port}`);
    console.log(`🌐 URL: http://localhost:${port}`);
});