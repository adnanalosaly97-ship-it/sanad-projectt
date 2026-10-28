'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');

const authController = require('./controllers/authController');
const requestController = require('./controllers/requestController');
const authMiddleware = require('./middleware/authMiddleware');
const db = require('./config/db');

const app = express();
const PORT = Number(process.env.PORT || 3000);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('PORT must be a valid port number.');
}

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api', (req, res) => {
    res.status(200).json({
        status: 'SUCCESS',
        system: 'SANAD API',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

app.post('/api/auth/register', authController.registerUser);
app.post('/api/auth/login', authController.loginUser);

app.get('/api/auth/users', authMiddleware, authController.getAllUsers);
app.post('/api/admin/users', authMiddleware, authController.adminCreateUser);
app.patch('/api/admin/users/:id', authMiddleware, authController.adminUpdateUser);

app.post('/api/requests', authMiddleware, requestController.createRequest);
app.get('/api/requests', authMiddleware, requestController.getAllRequests);

app.post('/api/alerts/emergency', authMiddleware, async (req, res) => {
    try {
        const userId = req.user && (req.user.user_id || req.user.id);

        if (!userId) {
            return res.status(401).json({
                status: 'ERROR',
                message: 'تعذر تحديد المستخدم المسجل دخوله.'
            });
        }

        const [columns] = await db.execute(
            `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'assistance_requests'`
        );

        const names = new Set(columns.map(column => column.COLUMN_NAME));

        const requiredColumns = [
            'request_id',
            'elderly_id',
            'request_type',
            'priority_level',
            'status'
        ];

        const missingColumns = requiredColumns.filter(
            column => !names.has(column)
        );

        if (missingColumns.length > 0) {
            return res.status(500).json({
                status: 'ERROR',
                message: 'أعمدة جدول طلبات المساعدة لا تطابق بنية قاعدة البيانات.'
            });
        }

        const insertColumns = [
            'elderly_id',
            'request_type',
            'priority_level',
            'status'
        ];

        const values = [
            userId,
            'EMERGENCY',
            'CRITICAL',
            'PENDING'
        ];

        if (names.has('description')) {
            insertColumns.push('description');
            values.push('بلاغ طوارئ من لوحة كبار السن');
        }

        const placeholders = insertColumns.map(() => '?').join(', ');

        const sql = `
            INSERT INTO assistance_requests
            (${insertColumns.map(column => `\`${column}\``).join(', ')})
            VALUES (${placeholders})
        `;

        const [result] = await db.execute(sql, values);

        if (!result.insertId) {
            return res.status(500).json({
                status: 'ERROR',
                message: 'تم تنفيذ الطلب دون إرجاع رقم الطلب.'
            });
        }

        return res.status(201).json({
            status: 'SUCCESS',
            message: 'تم تسجيل بلاغ الطوارئ بنجاح.',
            requestId: result.insertId,
            request_id: result.insertId
        });
    } catch (error) {
        console.error(
            'Emergency request failed:',
            error.code || error.message
        );

        return res.status(500).json({
            status: 'ERROR',
            message: 'تعذر تسجيل بلاغ الطوارئ. تحقق من اتصال قاعدة البيانات.'
        });
    }
});

app.get('/api/reminders', authMiddleware, async (req, res) => {
    try {
        const userId = req.user && (req.user.user_id || req.user.id);

        if (!userId) {
            return res.status(401).json({
                status: 'ERROR',
                message: 'تعذر تحديد المستخدم المسجل دخوله.'
            });
        }

        const [rows] = await db.execute(
            `SELECT
                reminder_id,
                user_id,
                title,
                reminder_details,
                reminder_at,
                status
             FROM reminders
             WHERE user_id = ?
             ORDER BY reminder_at ASC
             LIMIT 50`,
            [userId]
        );

        const reminders = rows.map(row => ({
            id: row.reminder_id,
            reminder_id: row.reminder_id,
            title: row.title,
            medicine_name: row.title,
            reminder_details: row.reminder_details,
            reminder_time: row.reminder_at,
            reminder_at: row.reminder_at,
            status: row.status
        }));

        return res.status(200).json({
            status: 'SUCCESS',
            count: reminders.length,
            reminders,
            data: reminders
        });
    } catch (error) {
        console.error(
            'Reminder retrieval failed:',
            error.code || error.message
        );

        return res.status(500).json({
            status: 'ERROR',
            message: 'تعذر جلب التذكيرات. تحقق من اتصال قاعدة البيانات.'
        });
    }
});

app.get('/api/caregiver/requests', authMiddleware, (req, res) => {
    return res.status(501).json({
        status: 'ERROR',
        message: 'استرجاع طلبات المساعد لم يتم تنفيذه بعد.'
    });
});

app.get('/api/admin/stats', authMiddleware, (req, res) => {
    return res.status(501).json({
        status: 'ERROR',
        message: 'إحصائيات الإدارة لم يتم تنفيذها بعد.'
    });
});

app.use((req, res) => {
    res.status(404).json({
        status: 'ERROR',
        message: 'The requested route was not found.'
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

    console.error(
        'Request error:',
        err.code || err.message
    );

    return res.status(500).json({
        status: 'ERROR',
        message: 'حدث خطأ داخلي في الخادم.'
    });
});

const server = app.listen(PORT, () => {
    console.log(`SANAD server is running on port ${PORT}`);
});

server.on('error', error => {
    console.error('Failed to start SANAD server:', error.message);
    process.exitCode = 1;
});

module.exports = server;
