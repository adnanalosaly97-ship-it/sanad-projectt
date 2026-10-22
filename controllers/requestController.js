
'use strict';

const db = require('../config/db');

exports.createRequest = async (req, res) => {
    try {
        if (!req.user || req.user.user_role !== 'ELDERLY') {
            return res.status(403).json({
                status: 'ERROR',
                message: 'Only elderly users can create assistance requests.'
            });
        }

        const { request_type, description, priority_level } = req.body;

        if (
            typeof request_type !== 'string' ||
            !request_type.trim() ||
            request_type.trim().length > 100
        ) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'Please provide a valid request type.'
            });
        }

        if (
            description !== undefined &&
            description !== null &&
            typeof description !== 'string'
        ) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'Description must be text.'
            });
        }

        if (
            typeof description === 'string' &&
            description.length > 2000
        ) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'Description is too long.'
            });
        }

        const allowedPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
        const priority = priority_level || 'MEDIUM';

        if (!allowedPriorities.includes(priority)) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'Invalid priority level.'
            });
        }

        const query = `
            INSERT INTO assistance_requests (
                elderly_id,
                request_type,
                priority_level,
                description,
                status
            )
            VALUES (?, ?, ?, ?, 'PENDING')
        `;

        const [result] = await db.execute(query, [
            req.user.user_id,
            request_type.trim(),
            priority,
            description ? description.trim() || null : null
        ]);

        return res.status(201).json({
            status: 'SUCCESS',
            message: 'Assistance request created successfully.',
            requestId: result.insertId
        });
    } catch (error) {
        console.error('Request creation failed:', error.message);

        return res.status(500).json({
            status: 'ERROR',
            message: 'Unable to create the assistance request.'
        });
    }
};

exports.getAllRequests = async (req, res) => {
    if (
        !req.user ||
        !['ADMIN', 'HELPER'].includes(req.user.user_role)
    ) {
        return res.status(403).json({
            status: 'ERROR',
            message: 'You are not authorized to view all assistance requests.'
        });
    }

    try {
        const [rows] = await db.execute(`
            SELECT
                r.request_id,
                r.request_type,
                r.priority_level,
                r.description,
                r.status,
                r.created_at,
                u.full_name AS elderly_name
            FROM assistance_requests AS r
            INNER JOIN users AS u
                ON r.elderly_id = u.user_id
            ORDER BY r.created_at DESC
        `);

        return res.status(200).json({
            status: 'SUCCESS',
            count: rows.length,
            data: rows
        });
    } catch (error) {
        console.error('Request retrieval failed:', error.message);

        return res.status(500).json({
            status: 'ERROR',
            message: 'Unable to retrieve assistance requests.'
        });
    }
};
