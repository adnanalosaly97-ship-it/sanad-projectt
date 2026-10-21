
'use strict';

const express = require('express');
const cors = require('cors');

const app = express();

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
        system: 'SANAD',
        version: '1.0.0',
        message: 'SANAD API is running',
        timestamp: new Date().toISOString()
    });
});

app.use((req, res) => {
    res.status(404).json({
        status: 'ERROR',
        message: 'The requested route was not found'
    });
});

app.use((err, req, res, next) => {
    console.error('Request error:', err.message);

    if (res.headersSent) {
        return next(err);
    }

    const statusCode = err.status || 500;

    res.status(statusCode).json({
        status: 'ERROR',
        message: statusCode >= 500
            ? 'An internal server error occurred'
            : 'Invalid request'
    });
});

module.exports = app;
