require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// Import routes
const authRoutes = require('./routes/auth');
const leaveRoutes = require('./routes/leaves');

// Connect to database
connectDB();

const app = express();

// ── CORS: allow Vercel frontend + local dev ──────────────
const allowedOrigins = [
    process.env.FRONTEND_URL || 'https://time-off-hub-frontend.vercel.app',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS policy: origin ${origin} not allowed`));
    },
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/leaves', leaveRoutes);

// Health check route
app.get('/api/health', (req, res) => {
    res.status(200).json({ success: true, message: 'TimeOff Hub API is running.' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error.',
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
