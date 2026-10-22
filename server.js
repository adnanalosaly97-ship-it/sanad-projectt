'use strict';

const express = require('express');
const cors = require('cors');

const authController = require('./controllers/authController');
const requestController = require('./controllers/requestController');
const authMiddleware = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({
    extended: true,
    limit: '1mb'
}));

app.get('/', (req, res) => {
    res.status(200).json({
        status: 'SUCCESS',
        system: 'SANAD API',
        version: '1.0.0',
        message: 'SANAD API is running',
        timestamp: new Date().toISOString()
    });
});

app.post('/api/auth/register', authController.registerUser);

app.get(
    '/api/auth/users',
    authMiddleware,
    authController.getAllUsers
);

app.post(
    '/api/requests',
    authMiddleware,
    requestController.createRequest
);

app.get(
    '/api/requests',
    authMiddleware,
    requestController.getAllRequests
);

app.use((req, res) => {
    res.status(404).json({
        status: 'ERROR',
        message: 'The requested route was not found'
    });
});

app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    console.error('Request error:', err.message);

    const statusCode = Number.isInteger(err.status) &&
        err.status >= 400 &&
        err.status <= 599
        ? err.status
        : 500;

    res.status(statusCode).json({
        status: 'ERROR',
        message: statusCode >= 500
            ? 'An internal server error occurred'
            : 'Invalid request'
    });
});

const server = app.listen(PORT, () => {
    console.log(`SANAD server is running on port ${PORT}`);
});

server.on('error', (error) => {
    console.error('Failed to start SANAD server:', error.message);
    process.exitCode = 1;
});

module.exports = server;
