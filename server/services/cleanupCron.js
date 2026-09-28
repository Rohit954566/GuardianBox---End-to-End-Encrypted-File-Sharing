import cron from 'node-cron';
import { db } from '../database/db.js';
import { storage } from './storageService.js';
import { config } from '../config/config.js';

/**
 * Executes a purge cycle to clean up expired or burn-after-reading files.
 * @returns {Promise<{ purgedCount: number, freedBytes: number }>}
 */
export async function runPurgeCycle() {
  const now = Date.now();
  const toPurge = db.findFilesToPurge(now);

  if (toPurge.length === 0) {
    return { purgedCount: 0, freedBytes: 0 };
  }

  console.log(`[Ephemeral Cleanup] Found ${toPurge.length} file(s) eligible for automated purge.`);
  let freedBytes = 0;
  let purgedCount = 0;

  for (const file of toPurge) {
    try {
      console.log(`[Ephemeral Cleanup] Purging ${file.id} (Reason: ${file.reason}, Size: ${file.fileSize} bytes)`);
      
      // Delete binary blob from storage (S3 or local disk)
      await storage.deleteObject(file.storageKey);

      // Remove metadata record from database
      db.markDeleted(file.id);

      freedBytes += file.fileSize || 0;
      purgedCount += 1;
    } catch (err) {
      console.error(`[Ephemeral Cleanup] Failed to purge file ${file.id}:`, err.message);
    }
  }

  console.log(`[Ephemeral Cleanup] Cycle complete. Purged ${purgedCount} file(s), freed ${freedBytes} bytes.`);
  return { purgedCount, freedBytes };
}

/**
 * Initializes the automated cron job.
 */
export function startCleanupCron() {
  const schedule = config.cleanupCronSchedule;
  console.log(`[Ephemeral Cleanup] Scheduled automated cleanup cron with schedule: "${schedule}"`);

  // Run initial check on startup
  runPurgeCycle().catch(err => console.error('[Ephemeral Cleanup] Startup check failed:', err.message));

  // Schedule recurring cron
  return cron.schedule(schedule, async () => {
    try {
      await runPurgeCycle();
    } catch (err) {
      console.error('[Ephemeral Cleanup] Cron execution error:', err.message);
    }
  });
}
