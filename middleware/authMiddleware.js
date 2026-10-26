
'use strict';

const jwt = require('jsonwebtoken');
const db = require('../config/db');

module.exports = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (
        typeof authHeader !== 'string' ||
        !authHeader.startsWith('Bearer ')
    ) {
        return res.status(401).json({
            status: 'ERROR',
            message: 'Authentication required.'
        });
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
        return res.status(401).json({
            status: 'ERROR',
            message: 'Authentication token is missing.'
        });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
        console.error('JWT_SECRET is not configured.');

        return res.status(500).json({
            status: 'ERROR',
            message: 'Authentication service is unavailable.'
        });
    }

    try {
        const decoded = jwt.verify(token, secret, {
            algorithms: ['HS256']
        });

        if (
            !decoded.sub ||
            !Number.isInteger(Number(decoded.sub)) ||
            Number(decoded.sub) <= 0
        ) {
            return res.status(401).json({
                status: 'ERROR',
                message: 'Invalid authentication token.'
            });
        }

        const [rows] = await db.execute(
            `SELECT user_id, user_role, account_status
             FROM users
             WHERE user_id = ?
             LIMIT 1`,
            [Number(decoded.sub)]
        );

        if (
            rows.length === 0 ||
            rows[0].account_status !== 'ACTIVE'
        ) {
            return res.status(401).json({
                status: 'ERROR',
                message: 'User account is unavailable.'
            });
        }

        req.user = {
            user_id: rows[0].user_id,
            user_role: rows[0].user_role
        };

        return next();
    } catch (error) {
        if (
            error.name === 'JsonWebTokenError' ||
            error.name === 'TokenExpiredError' ||
            error.name === 'NotBeforeError'
        ) {
            return res.status(401).json({
                status: 'ERROR',
                message: 'Invalid or expired authentication token.'
            });
        }

        console.error('Authentication failed:', error.message);

        return res.status(500).json({
            status: 'ERROR',
            message: 'Authentication service is unavailable.'
        });
    }
};
