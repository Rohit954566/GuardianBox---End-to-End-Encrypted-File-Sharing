import express from 'express';
import cors from 'cors';
import { config } from './config/config.js';
import fileRoutes from './routes/fileRoutes.js';
import { startCleanupCron } from './services/cleanupCron.js';
import { storage } from './services/storageService.js';
import { db } from './database/db.js';

const app = express();

// Security Middleware
app.use(cors({
  origin: '*', // Allow client requests
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request Logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.url.startsWith('/api/health')) {
      console.log(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// API Routes
app.use('/api/files', fileRoutes);

// System Health & Statistics Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'GuardianBox E2EE Storage Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    zeroKnowledgeVerified: true,
    storageProvider: storage.getProviderName(),
    activeFiles: db.getAllActiveFilesCount(),
    totalStorageBytes: db.getTotalStorageBytes()
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// Start Server and Background Ephemeral Lifecycle Cron
const server = app.listen(config.port, () => {
  console.log(`====================================================`);
  console.log(`   GuardianBox E2EE Backend Engine Running          `);
  console.log(`   Port: ${config.port}                                    `);
  console.log(`   Storage Provider: ${storage.getProviderName()}         `);
  console.log(`   Zero-Knowledge Policy: Active (Keys never stored)`);
  console.log(`====================================================`);

  // Start the background purge cron
  startCleanupCron();
});

export default app;
