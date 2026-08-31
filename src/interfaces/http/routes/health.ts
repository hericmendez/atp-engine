import { Router } from 'express';
import { isDatabaseConnected } from '../../../infrastructure/persistence/mongodb/connection.js';
import { getConfig } from '../../../infrastructure/config/config.js';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  dependencies: {
    database: 'connected' | 'disconnected';
    ai: 'configured' | 'not_configured';
  };
  uptime: number;
}

export function healthRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    let aiConfigured = false;

    try {
      const config = getConfig();
      aiConfigured = Boolean(config.OLLAMA_URL);
    } catch {
      // Config not loaded — degrade gracefully
    }

    const dbConnected = isDatabaseConnected();
    const status: HealthStatus['status'] = dbConnected ? 'ok' : 'degraded';

    const healthStatus: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      dependencies: {
        database: dbConnected ? 'connected' : 'disconnected',
        ai: aiConfigured ? 'configured' : 'not_configured',
      },
      uptime: process.uptime(),
    };

    res.status(200).json(healthStatus);
  });

  return router;
}
