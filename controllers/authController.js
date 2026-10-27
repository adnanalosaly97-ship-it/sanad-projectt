
'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const PUBLIC_ROLES = ['ELDERLY', 'HELPER'];
const ACCOUNT_STATUSES = ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'];
const AVAILABILITY_STATUSES = ['AVAILABLE', 'BUSY', 'OFFLINE'];
const LANGUAGES = ['ar', 'en'];

function sendError(res, statusCode, message) {
    return res.status(statusCode).json({
        status: 'ERROR',
        message
    });
}

function isValidEmail(email) {
    return typeof email === 'string' &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
    return typeof phone === 'string' &&
        /^[+\d][\d\s()-]{5,24}$/.test(phone);
}

function normalizeOptional(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized || null;
}

async function registerUser(req, res, next) {
    try {
        const fullName = normalizeOptional(req.body.full_name);
        const phone = normalizeOptional(req.body.phone_number);
        const email = normalizeOptional(req.body.email_address);
        const password = req.body.password;
        const role = req.body.user_role || 'ELDERLY';

        if (!fullName || fullName.length < 2 || fullName.length > 150) {
            return sendError(res, 400, 'Please enter a valid full name.');
        }

        if (!phone && !email) {
            return sendError(res, 400, 'Enter a phone number or email address.');
        }

        if (phone && !isValidPhone(phone)) {
            return sendError(res, 400, 'Please enter a valid phone number.');
        }

        if (email && !isValidEmail(email)) {
            return sendError(res, 400, 'Please enter a valid email address.');
        }

        if (typeof password !== 'string' ||
            password.length < 8 ||
            password.length > 72) {
            return sendError(res, 400, 'Password must be 8 to 72 characters.');
        }

        if (!PUBLIC_ROLES.includes(role)) {
            return sendError(res, 400, 'Invalid user role.');
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const [result] = await db.execute(
            `INSERT INTO users
            (full_name, phone_number, email_address, password_hash, user_role)
            VALUES (?, ?, ?, ?, ?)`,
            [fullName, phone, email, passwordHash, role]
        );

        return res.status(201).json({
            status: 'SUCCESS',
            message: 'Account created successfully.',
            userId: result.insertId
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return sendError(res, 409, 'Phone number or email already exists.');
        }
        return next(error);
    }
}

async function loginUser(req, res, next) {
    try {
        const identifier = normalizeOptional(
            req.body.identifier ||
            req.body.email_address ||
            req.body.phone_number
        );
        const password = req.body.password;

        if (!identifier || typeof password !== 'string') {
            return sendError(res, 400, 'Enter your login details.');
        }

        const [rows] = await db.execute(
            `SELECT user_id, full_name, phone_number, email_address,
                    password_hash, user_role, account_status
             FROM users
             WHERE email_address = ? OR phone_number = ?
             LIMIT 1`,
            [identifier, identifier]
        );

        if (!rows.length) {
            return sendError(res, 401, 'Invalid login details.');
        }

        const user = rows[0];

        if (user.account_status !== 'ACTIVE') {
            return sendError(res, 403, 'This account is not active.');
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            return sendError(res, 401, 'Invalid login details.');
        }

        if (!process.env.JWT_SECRET) {
            return sendError(res, 500, 'Server authentication is not configured.');
        }

        const token = jwt.sign(
            {
                sub: String(user.user_id)
            },
            process.env.JWT_SECRET,
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
        return next(error);
    }
}

async function getAllUsers(req, res, next) {
    try {
        if (!req.user || req.user.user_role !== 'ADMIN') {
            return sendError(res, 403, 'Administrator access required.');
        }

        const [rows] = await db.execute(
            `SELECT user_id, full_name, phone_number, email_address,
                    user_role, account_status, availability_status,
                    preferred_language, created_at, updated_at
             FROM users
             ORDER BY created_at DESC`
        );

        return res.status(200).json({
            status: 'SUCCESS',
            count: rows.length,
            data: rows
        });
    } catch (error) {
        return next(error);
    }
}

async function adminCreateUser(req, res, next) {
    try {
        if (!req.user || req.user.user_role !== 'ADMIN') {
            return sendError(res, 403, 'Administrator access required.');
        }

        const fullName = normalizeOptional(req.body.full_name);
        const phone = normalizeOptional(req.body.phone_number);
        const email = normalizeOptional(req.body.email_address);
        const password = req.body.password;
        const role = req.body.user_role || 'ELDERLY';

        if (!fullName || fullName.length < 2 || fullName.length > 150) {
            return sendError(res, 400, 'Please enter a valid full name.');
        }

        if (!phone && !email) {
            return sendError(res, 400, 'Enter a phone number or email address.');
        }

        if (phone && !isValidPhone(phone)) {
            return sendError(res, 400, 'Please enter a valid phone number.');
        }

        if (email && !isValidEmail(email)) {
            return sendError(res, 400, 'Please enter a valid email address.');
        }

        if (typeof password !== 'string' ||
            password.length < 8 ||
            password.length > 72) {
            return sendError(res, 400, 'Password must be 8 to 72 characters.');
        }

        if (!PUBLIC_ROLES.includes(role)) {
            return sendError(res, 400, 'Invalid user role.');
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const [result] = await db.execute(
            `INSERT INTO users
            (full_name, phone_number, email_address, password_hash, user_role)
            VALUES (?, ?, ?, ?, ?)`,
            [fullName, phone, email, passwordHash, role]
        );

        return res.status(201).json({
            status: 'SUCCESS',
            message: 'User created successfully.',
            userId: result.insertId
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return sendError(res, 409, 'Phone number or email already exists.');
        }
        return next(error);
    }
}

async function adminUpdateUser(req, res, next) {
    try {
        if (!req.user || req.user.user_role !== 'ADMIN') {
            return sendError(res, 403, 'Administrator access required.');
        }

        const userId = Number(req.params.id);

        if (!Number.isSafeInteger(userId) || userId < 1) {
            return sendError(res, 400, 'Invalid user ID.');
        }

        const allowedFields = {
            full_name: value => typeof value === 'string' &&
                value.trim().length >= 2 &&
                value.trim().length <= 150
                    ? value.trim()
                    : undefined,
            phone_number: value => value === null || value === ''
                ? null
                : isValidPhone(value) ? value.trim() : undefined,
            email_address: value => value === null || value === ''
                ? null
                : isValidEmail(value) ? value.trim() : undefined,
            user_role: value => PUBLIC_ROLES.includes(value) ? value : undefined,
            account_status: value => ACCOUNT_STATUSES.includes(value)
                ? value
                : undefined,
            availability_status: value =>
                AVAILABILITY_STATUSES.includes(value) ? value : undefined,
            preferred_language: value => LANGUAGES.includes(value)
                ? value
                : undefined
        };

        const updates = [];
        const values = [];

        for (const [field, validator] of Object.entries(allowedFields)) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                const value = validator(req.body[field]);

                if (value === undefined) {
                    return sendError(res, 400, `Invalid value for ${field}.`);
                }

                updates.push(`${field} = ?`);
                values.push(value);
            }
        }

        if (!updates.length) {
            return sendError(res, 400, 'No valid fields were provided.');
        }

        if (
            String(req.user.user_id) === String(userId) &&
            req.body.account_status &&
            req.body.account_status !== 'ACTIVE'
        ) {
            return sendError(res, 400, 'You cannot deactivate your own account.');
        }

        values.push(userId);

        const [result] = await db.execute(
            `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ?`,
            values
        );

        if (!result.affectedRows) {
            return sendError(res, 404, 'User not found or no changes made.');
        }

        return res.status(200).json({
            status: 'SUCCESS',
            message: 'User updated successfully.'
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return sendError(res, 409, 'Phone number or email already exists.');
        }
        return next(error);
    }
}

module.exports = {
    registerUser,
    loginUser,
    getAllUsers,
    adminCreateUser,
    adminUpdateUser
};
