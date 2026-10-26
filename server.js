'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');

const authController = require('./controllers/authController');
const requestController = require('./controllers/requestController');
const authMiddleware = require('./middleware/authMiddleware');

const app = express();

const PORT = Number(process.env.PORT || 3000);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('PORT must be a valid port number.');
}

app.disable('x-powered-by');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({
    extended: true,
    limit: '1mb'
}));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api', (req, res) => {
    res.status(200).json({
        status: 'SUCCESS',
        system: 'SANAD API',
        version: '1.0.0',
        message: 'SANAD API is running',
        timestamp: new Date().toISOString()
    });
});

app.post('/api/auth/register', authController.registerUser);
app.post('/api/auth/login', authController.loginUser);

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

app.post(
    '/api/alerts/emergency',
    authMiddleware,
    (req, res) => {
        return res.status(501).json({
            status: 'ERROR',
            message: 'Emergency alert service is not implemented yet'
        });
    }
);

app.get(
    '/api/caregiver/requests',
    authMiddleware,
    (req, res) => {
        return res.status(501).json({
            status: 'ERROR',
            message: 'Caregiver request retrieval is not implemented yet'
        });
    }
);

app.get(
    '/api/admin/stats',
    authMiddleware,
    (req, res) => {
        return res.status(501).json({
            status: 'ERROR',
            message: 'Admin statistics are not implemented yet'
        });
    }
);

app.use((req, res) => {
    return res.status(404).json({
        status: 'ERROR',
        message: 'The requested route was not found'
    });
});

app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({
            status: 'ERROR',
            message: 'Invalid JSON request body.'
        });
    }

    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            status: 'ERROR',
            message: 'Request body is too large.'
        });
    }

    console.error('Request error:', err.message);

    const statusCode = Number.isInteger(err.status) &&
        err.status >= 400 &&
        err.status <= 599
        ? err.status
        : 500;

    return res.status(statusCode).json({
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
