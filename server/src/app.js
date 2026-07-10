'use strict';
const path = require('path');
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const hpp = require('hpp');
const morgan = require('morgan');

const env = require('./config/env');
const logger = require('./utils/logger');
const helmetMiddleware = require('./middleware/security');
const sessionMiddleware = require('./middleware/session');
const { attachCsrfToken, verifyCsrfToken } = require('./middleware/csrf');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const flightsRoutes = require('./routes/flights.routes');
const bookingsRoutes = require('./routes/bookings.routes');
const staffRoutes = require('./routes/staff.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// Trust first proxy hop (needed for correct req.ip / secure cookies behind
// a reverse proxy / load balancer in production).
app.set('trust proxy', 1);

app.use(helmetMiddleware);
app.use(compression());
app.use(hpp()); // strips duplicate query/body params (HTTP Parameter Pollution defense)
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(cookieParser());

app.use(morgan(env.isProd ? 'combined' : 'dev', {
    stream: { write: (msg) => logger.info(msg.trim()) }
}));

app.use(sessionMiddleware);
app.use(attachCsrfToken);

app.use('/api', apiLimiter);
app.use('/api/auth', verifyCsrfToken, authRoutes);
app.use('/api/flights', verifyCsrfToken, flightsRoutes);
app.use('/api/bookings', verifyCsrfToken, bookingsRoutes);
app.use('/api/staff', verifyCsrfToken, staffRoutes);
app.use('/api/admin', verifyCsrfToken, adminRoutes);

// Static frontend (vanilla HTML/CSS/JS — no build step required).
app.use(express.static(path.join(__dirname, '..', '..', 'public'), {
    extensions: ['html'],
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff')
}));

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

app.use('/api', notFoundHandler);
app.use(errorHandler);

module.exports = app;
