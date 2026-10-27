
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

app.post('/api/alerts/emergency', authMiddleware, async (req, res, next) => {
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

        const names = new Set(columns.map(c => c.COLUMN_NAME));

        if (!names.has('elderly_id') || !names.has('request_type')) {
            return res.status(500).json({
                status: 'ERROR',
                message: 'بنية جدول طلبات المساعدة لا تطابق المطلوب.'
            });
        }

        const typeColumn = names.has('priority_level')
            ? 'priority_level'
            : names.has('priority')
                ? 'priority'
                : null;

        const statusColumn = names.has('status')
            ? 'status'
            : names.has('request_status')
                ? 'request_status'
                : null;

        const descriptionColumn = names.has('description')
            ? 'description'
            : null;

        const insertColumns = ['elderly_id', 'request_type'];
        const placeholders = ['?', '?'];
        const values = [userId, 'EMERGENCY'];

        if (descriptionColumn) {
            insertColumns.push(descriptionColumn);
            placeholders.push('?');
            values.push('بلاغ طوارئ من لوحة كبار السن');
        }

        if (typeColumn) {
            insertColumns.push(typeColumn);
            placeholders.push('?');
            values.push('CRITICAL');
        }

        if (statusColumn) {
            insertColumns.push(statusColumn);
            placeholders.push('?');
            values.push('PENDING');
        }

        const sql = `INSERT INTO assistance_requests
            (${insertColumns.map(c => `\`${c}\``).join(', ')})
            VALUES (${placeholders.join(', ')})`;

        const [result] = await db.execute(sql, values);

        return res.status(201).json({
            status: 'SUCCESS',
            requestId: result.insertId
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/reminders', authMiddleware, async (req, res, next) => {
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
               AND TABLE_NAME = 'reminders'`
        );

        const names = new Set(columns.map(c => c.COLUMN_NAME));

        if (names.size === 0) {
            return res.status(501).json({
                status: 'ERROR',
                message: 'جدول التذكيرات غير موجود في قاعدة البيانات.'
            });
        }

        const userColumn = ['user_id', 'elderly_id'].find(c => names.has(c));

        if (!userColumn) {
            return res.status(500).json({
                status: 'ERROR',
                message: 'جدول التذكيرات لا يحتوي على عمود يربط التذكير بالمستخدم.'
            });
        }

        const idColumn = ['reminder_id', 'id'].find(c => names.has(c));
        const nameColumn = [
            'medicine_name',
            'medication_name',
            'title',
            'name',
            'reminder_title'
        ].find(c => names.has(c));

        const timeColumn = [
            'reminder_time',
            'scheduled_at',
            'reminder_date',
            'medication_time',
            'time'
        ].find(c => names.has(c));

        const selected = [
            idColumn,
            nameColumn,
            timeColumn
        ].filter(Boolean);

        if (selected.length === 0) {
            return res.status(500).json({
                status: 'ERROR',
                message: 'لم يتم العثور على أعمدة بيانات التذكيرات.'
            });
        }

        const sql = `SELECT ${selected.map(c => `\`${c}\``).join(', ')}
                     FROM reminders
                     WHERE \`${userColumn}\` = ?
                     ${idColumn ? `ORDER BY \`${idColumn}\` DESC` : ''}
                     LIMIT 50`;

        const [rows] = await db.execute(sql, [userId]);

        const reminders = rows.map(row => ({
            id: idColumn ? row[idColumn] : null,
            medicine_name: nameColumn ? row[nameColumn] : 'تذكير',
            reminder_time: timeColumn ? row[timeColumn] : 'غير محدد'
        }));

        return res.status(200).json({
            status: 'SUCCESS',
            reminders
        });
    } catch (error) {
        next(error);
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
    if (res.headersSent) return next(err);

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
