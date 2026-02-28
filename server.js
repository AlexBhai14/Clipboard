// Online Clipboard Server
// Files auto-delete after 2 minutes

const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// SQLite Database Setup
const db = new sqlite3.Database('./clipboard.db', (err) => {
    if (err) console.error('Database error:', err.message);
    else console.log('Connected to SQLite database');
});

// Create tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            originalName TEXT NOT NULL,
            mimetype TEXT,
            size INTEGER,
            path TEXT,
            uploadTime INTEGER,
            expiresAt INTEGER,
            views INTEGER DEFAULT 0
        )
    `);
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Auto-delete expired files (run every 30 seconds)
setInterval(() => {
    const now = Date.now();
    db.all('SELECT * FROM files WHERE expiresAt < ?', [now], (err, files) => {
        if (err) {
            console.error('Error fetching expired files:', err);
            return;
        }
        
        files.forEach(file => {
            // Delete file from filesystem
            const filePath = path.join(uploadsDir, file.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            
            // Delete from database
            db.run('DELETE FROM files WHERE id = ?', [file.id], (err) => {
                if (err) console.error('Error deleting file:', err);
                else console.log(`Deleted expired file: ${file.originalName}`);
            });
        });
    });
}, 30000);

// ==================== API ROUTES ====================

// Upload file
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileId = uuidv4();
    const expiresAt = Date.now() + (2 * 60 * 1000); // 2 minutes from now
    
    const sql = `
        INSERT INTO files (id, filename, originalName, mimetype, size, path, uploadTime, expiresAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(sql, [
        fileId,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.file.path,
        Date.now(),
        expiresAt
    ], (err) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json({
            success: true,
            fileId: fileId,
            message: 'File uploaded successfully',
            expiresIn: 120 // seconds
        });
    });
});

// Upload multiple files
app.post('/api/upload-multiple', upload.array('files', 50), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = [];
    const expiresAt = Date.now() + (2 * 60 * 1000); // 2 minutes from now

    req.files.forEach(file => {
        const fileId = uuidv4();
        
        db.run(`
            INSERT INTO files (id, filename, originalName, mimetype, size, path, uploadTime, expiresAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            fileId,
            file.filename,
            file.originalname,
            file.mimetype,
            file.size,
            file.path,
            Date.now(),
            expiresAt
        ], (err) => {
            if (!err) {
                uploadedFiles.push({ id: fileId, name: file.originalname });
            }
        });
    });

    res.json({
        success: true,
        files: uploadedFiles,
        message: `${uploadedFiles.length} files uploaded successfully`,
        expiresIn: 120
    });
});

// Get all active files
app.get('/api/files', (req, res) => {
    const now = Date.now();
    
    db.all('SELECT id, originalName, mimetype, size, uploadTime, expiresAt, views FROM files WHERE expiresAt > ? ORDER BY uploadTime DESC', [now], (err, files) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        const filesWithTime = files.map(f => ({
            ...f,
            timeRemaining: Math.max(0, Math.floor((f.expiresAt - now) / 1000)),
            sizeFormatted: formatFileSize(f.size)
        }));

        res.json({ files: filesWithTime });
    });
});

// Get single file info
app.get('/api/file/:id', (req, res) => {
    const fileId = req.params.id;
    const now = Date.now();

    db.get('SELECT * FROM files WHERE id = ? AND expiresAt > ?', [fileId, now], (err, file) => {
        if (err || !file) {
            return res.status(404).json({ error: 'File not found or expired' });
        }

        // Increment view count
        db.run('UPDATE files SET views = views + 1 WHERE id = ?', [fileId]);

        res.json({
            ...file,
            sizeFormatted: formatFileSize(file.size),
            timeRemaining: Math.max(0, Math.floor((file.expiresAt - now) / 1000))
        });
    });
});

// Download/serve file
app.get('/api/download/:id', (req, res) => {
    const fileId = req.params.id;
    const now = Date.now();

    db.get('SELECT * FROM files WHERE id = ? AND expiresAt > ?', [fileId, now], (err, file) => {
        if (err || !file) {
            return res.status(404).json({ error: 'File not found or expired' });
        }

        const filePath = path.join(uploadsDir, file.filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        // Increment view count
        db.run('UPDATE files SET views = views + 1 WHERE id = ?', [fileId]);

        res.download(filePath, file.originalName);
    });
});

// Get file preview (for images/text)
app.get('/api/preview/:id', (req, res) => {
    const fileId = req.params.id;
    const now = Date.now();

    db.get('SELECT * FROM files WHERE id = ? AND expiresAt > ?', [fileId, now], (err, file) => {
        if (err || !file) {
            return res.status(404).json({ error: 'File not found or expired' });
        }

        const filePath = path.join(uploadsDir, file.filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        // Increment view count
        db.run('UPDATE files SET views = views + 1 WHERE id = ?', [fileId]);

        res.setHeader('Content-Type', file.mimetype);
        res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    });
});

// Delete single file
app.delete('/api/file/:id', (req, res) => {
    const fileId = req.params.id;

    db.get('SELECT * FROM files WHERE id = ?', [fileId], (err, file) => {
        if (err || !file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Delete from filesystem
        const filePath = path.join(uploadsDir, file.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Delete from database
        db.run('DELETE FROM files WHERE id = ?', [fileId], (err) => {
            if (err) {
                return res.status(500).json({ error: 'Error deleting file' });
            }
            res.json({ success: true, message: 'File deleted successfully' });
        });
    });
});

// Clear all files
app.delete('/api/clear-all', (req, res) => {
    // Delete all files from filesystem
    fs.readdir(uploadsDir, (err, files) => {
        if (!err && files) {
            files.forEach(file => {
                fs.unlinkSync(path.join(uploadsDir, file));
            });
        }
    });

    // Clear database
    db.run('DELETE FROM files', (err) => {
        if (err) {
            return res.status(500).json({ error: 'Error clearing files' });
        }
        res.json({ success: true, message: 'All files cleared successfully' });
    });
});

// Get server info
app.get('/api/status', (req, res) => {
    const now = Date.now();
    
    db.get('SELECT COUNT(*) as count, SUM(size) as totalSize FROM files WHERE expiresAt > ?', [now], (err, row) => {
        res.json({
            status: 'online',
            activeFiles: row.count || 0,
            totalSize: formatFileSize(row.totalSize || 0),
            expiryTime: '2 minutes',
            serverTime: new Date().toISOString()
        });
    });
});

// Helper function
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`========================================`);
    console.log(`   Online Clipboard Server Started`);
    console.log(`========================================`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Network: http://${getLocalIP()}:${PORT}`);
    console.log(`   Files expire after: 2 minutes`);
    console.log(`========================================`);
});

function getLocalIP() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}
