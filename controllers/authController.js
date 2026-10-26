'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

exports.registerUser = async (req, res) => {
    try {
        const {
            full_name,
            phone_number,
            email_address,
            password,
            user_role
        } = req.body || {};

        if (
            typeof full_name !== 'string' ||
            !full_name.trim() ||
            full_name.trim().length > 100
        ) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'Please provide a valid full name.'
            });
        }

        const phone = typeof phone_number === 'string'
            ? phone_number.trim()
            : '';

        const email = typeof email_address === 'string'
            ? email_address.trim().toLowerCase()
            : '';

        if (!phone && !email) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'A phone number or email address is required.'
            });
        }

        if (phone && (
            phone.length > 20 ||
            !/^[+\d\s()-]+$/.test(phone)
        )) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'Please provide a valid phone number.'
            });
        }

        if (email && (
            email.length > 255 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        )) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'Please provide a valid email address.'
            });
        }

        if (
            typeof password !== 'string' ||
            password.length < 8 ||
            password.length > 72
        ) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'Password must be between 8 and 72 characters.'
            });
        }

        if (
            user_role !== undefined &&
            !['ELDERLY', 'HELPER'].includes(user_role)
        ) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'Invalid user role.'
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const query = `
            INSERT INTO users (
                full_name,
                phone_number,
                email_address,
                password_hash,
                user_role
            )
            VALUES (?, ?, ?, ?, ?)
        `;

        const [result] = await db.execute(query, [
            full_name.trim(),
            phone || null,
            email || null,
            passwordHash,
            user_role || 'ELDERLY'
        ]);

        return res.status(201).json({
            status: 'SUCCESS',
            message: 'User registered successfully.',
            userId: result.insertId
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                status: 'ERROR',
                message: 'The phone number or email address is already registered.'
            });
        }

        console.error(
            'User registration failed:',
            error.code || error.message
        );

        return res.status(500).json({
            status: 'ERROR',
            message: 'An internal server error occurred.'
        });
    }
};

exports.loginUser = async (req, res) => {
    try {
        const { identifier, email_address, password } = req.body || {};

        const loginIdentifier = typeof identifier === 'string'
            ? identifier.trim()
            : typeof email_address === 'string'
                ? email_address.trim()
                : '';

        if (
            !loginIdentifier ||
            typeof password !== 'string' ||
            !password
        ) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'Please provide your email or phone number and password.'
            });
        }

        if (loginIdentifier.length > 255 || password.length > 72) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'Invalid email, phone number, or password.'
            });
        }

        const normalizedIdentifier = loginIdentifier.toLowerCase();

        const [rows] = await db.execute(
            `SELECT
                user_id,
                full_name,
                phone_number,
                email_address,
                password_hash,
                user_role,
                account_status
             FROM users
             WHERE email_address = ?
                OR phone_number = ?
             LIMIT 1`,
            [normalizedIdentifier, loginIdentifier]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                status: 'ERROR',
                message: 'Invalid email, phone number, or password.'
            });
        }

        const user = rows[0];

        const isMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!isMatch || user.account_status !== 'ACTIVE') {
            return res.status(401).json({
                status: 'ERROR',
                message: 'Invalid email, phone number, or password.'
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

        const token = jwt.sign(
            {
                sub: String(user.user_id)
            },
            secret,
            {
                algorithm: 'HS256',
                expiresIn: '7d'
            }
        );

        return res.status(200).json({
            status: 'SUCCESS',
            message: 'Login successful.',
            token,
            user: {
                id: user.user_id,
                name: user.full_name,
                role: user.user_role
            }
        });
    } catch (error) {
        console.error(
            'Login failed:',
            error.code || error.message
        );

        return res.status(500).json({
            status: 'ERROR',
            message: 'An internal server error occurred.'
        });
    }
};

exports.getAllUsers = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({
            status: 'ERROR',
            message: 'Authentication is required.'
        });
    }

    if (req.user.user_role !== 'ADMIN') {
        return res.status(403).json({
            status: 'ERROR',
            message: 'Administrator access is required.'
        });
    }

    try {
        const [rows] = await db.execute(`
            SELECT
                user_id,
                full_name,
                phone_number,
                email_address,
                user_role,
                account_status,
                availability_status,
                preferred_language,
                created_at,
                updated_at
            FROM users
            ORDER BY created_at DESC
        `);

        return res.status(200).json({
            status: 'SUCCESS',
            count: rows.length,
            data: rows
        });
    } catch (error) {
        console.error(
            'User retrieval failed:',
            error.code || error.message
        );

        return res.status(500).json({
            status: 'ERROR',
            message: 'Unable to retrieve users at this time.'
        });
    }
};
