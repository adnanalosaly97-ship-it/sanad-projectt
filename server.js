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

        if (req.user.user_role !== 'ELDERLY') {
            return res.status(403).json({
                status: 'ERROR',
                message: 'يمكن لكبار السن فقط إرسال بلاغ الطوارئ.'
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

        if (requiredColumns.some(column => !names.has(column))) {
            return res.status(500).json({
                status: 'ERROR',
                message: 'بنية جدول طلبات المساعدة لا تطابق المطلوب.'
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
                message: 'تعذر الحصول على رقم الطلب بعد تسجيله.'
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
            message: 'تعذر تسجيل بلاغ الطوارئ.'
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
            message: 'تعذر جلب التذكيرات.'
        });
    }
});

app.get('/api/caregiver/requests', authMiddleware, async (req, res) => {
    try {
        if (!req.user || req.user.user_role !== 'HELPER') {
            return res.status(403).json({
                status: 'ERROR',
                message: 'غير مصرح لك بعرض طلبات المساعدة.'
            });
        }

        const helperId = req.user.user_id || req.user.id;

        if (!helperId) {
            return res.status(401).json({
                status: 'ERROR',
                message: 'تعذر تحديد حساب المساعد.'
            });
        }

        const [rows] = await db.execute(
            `SELECT
                r.request_id,
                r.elderly_id,
                u.full_name AS elderly_name,
                r.request_type,
                r.description,
                r.priority_level,
                r.status,
                r.created_at
             FROM assistance_requests AS r
             INNER JOIN users AS u
                ON r.elderly_id = u.user_id
             WHERE r.helper_id = ?
             ORDER BY r.created_at DESC`,
            [helperId]
        );

        return res.status(200).json({
            status: 'SUCCESS',
            count: rows.length,
            data: rows
        });
    } catch (error) {
        console.error(
            'Caregiver requests failed:',
            error.code || error.message
        );

        return res.status(500).json({
            status: 'ERROR',
            message: 'تعذر جلب طلبات المساعدة.'
        });
    }
});

app.get('/api/admin/stats', authMiddleware, async (req, res) => {
    try {
        if (!req.user || req.user.user_role !== 'ADMIN') {
            return res.status(403).json({
                status: 'ERROR',
                message: 'غير مصرح لك بعرض إحصائيات الإدارة.'
            });
        }

        const [userStats] = await db.execute(
            `SELECT
                COUNT(*) AS total_users,
                SUM(CASE WHEN user_role = 'ELDERLY' THEN 1 ELSE 0 END) AS elderly_users,
                SUM(CASE WHEN user_role = 'HELPER' THEN 1 ELSE 0 END) AS helper_users,
                SUM(CASE WHEN user_role = 'ADMIN' THEN 1 ELSE 0 END) AS admin_users,
                SUM(CASE WHEN account_status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_users
             FROM users`
        );

        const [requestStats] = await db.execute(
            `SELECT
                COUNT(*) AS total_requests,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_requests,
                SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END) AS accepted_requests,
                SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress_requests,
                SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_requests,
                SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_requests,
                SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_requests
             FROM assistance_requests`
        );

        const [reminderStats] = await db.execute(
            `SELECT
                COUNT(*) AS total_reminders,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_reminders,
                SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) AS sent_reminders,
                SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_reminders
             FROM reminders`
        );

        return res.status(200).json({
            status: 'SUCCESS',
            users: userStats[0],
            requests: requestStats[0],
            reminders: reminderStats[0]
        });
    } catch (error) {
        console.error(
            'Admin statistics failed:',
            error.code || error.message
        );

        return res.status(500).json({
            status: 'ERROR',
            message: 'تعذر جلب إحصائيات الإدارة.'
        });
    }
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
