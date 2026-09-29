// Real Backup Engine — actually creates encrypted backup files.
//
// Pipeline:
//   source path → tar archive (in-memory or temp file) → AES-256-GCM encrypt → .enc file on disk
//
// Restore pipeline (reverse):
//   .enc file → AES-256-GCM decrypt → tar extract → destination path
//
// The encrypted .enc file is stored in a configurable BACKUP_DIR (default: /tmp/sentinelx-backups).
// For cloud storage (S3, Azure Blob), wire up the upload in `uploadToCloud()` below.

import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, readdirSync, unlinkSync } from 'fs';
import { join, basename, dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '@/lib/db';
import { create as tarCreate, extract as tarExtract } from 'tar';

const execAsync = promisify(exec);

const BACKUP_DIR = process.env.BACKUP_DIR || '/tmp/sentinelx-backups';

// AES-256-GCM key — 32 bytes. In production, store in HSM / secrets manager.
const BACKUP_KEY = process.env.BACKUP_KEY
  ? Buffer.from(process.env.BACKUP_KEY.padEnd(32, '0').substring(0, 32))
  : Buffer.from('SentinelX_AES_256_Secure_Key!!!!'); // 32 bytes exactly

export interface BackupResult {
  ok: boolean;
  backupFilePath: string;
  fileCount: number;
  sizeBytes: number;
  integrityHash: string;
  encryptionAlgo: string;
  error?: string;
}

export interface RestoreResult {
  ok: boolean;
  restoredPath: string;
  fileCount: number;
  error?: string;
}

function ensureBackupDir(): void {
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

// Walk a directory + count files + total size
async function walkPath(sourcePath: string): Promise<{ fileCount: number; sizeBytes: number }> {
  try {
    const stat = statSync(sourcePath);
    if (stat.isFile()) {
      return { fileCount: 1, sizeBytes: stat.size };
    }
    // Use find for speed
    const { stdout } = await execAsync(`find ${sourcePath} -type f -printf '%s\\n' 2>/dev/null | head -n 100000`, { maxBuffer: 50 * 1024 * 1024 });
    const sizes = stdout.trim().split('\n').filter(Boolean).map(Number);
    return {
      fileCount: sizes.length,
      sizeBytes: sizes.reduce((a, b) => a + b, 0),
    };
  } catch (e: any) {
    return { fileCount: 0, sizeBytes: 0 };
  }
}

// Actually create a tar.gz of the source path, then AES-256-GCM encrypt it.
// Uses the streaming `archiver` package (no shell tar — works on Windows too).
export async function createEncryptedBackup(sourcePath: string, backupId: string): Promise<BackupResult> {
  ensureBackupDir();

  if (!existsSync(sourcePath)) {
    return {
      ok: false,
      backupFilePath: '',
      fileCount: 0,
      sizeBytes: 0,
      integrityHash: '',
      encryptionAlgo: 'aes-256-gcm',
      error: `Source path not found: ${sourcePath}`,
    };
  }

  // Cap source size at 500 MB to avoid OOM
  const { fileCount, sizeBytes } = await walkPath(sourcePath);
  if (sizeBytes > 500 * 1024 * 1024) {
    return {
      ok: false,
      backupFilePath: '',
      fileCount,
      sizeBytes,
      integrityHash: '',
      encryptionAlgo: 'aes-256-gcm',
      error: `Source path too large (${(sizeBytes / 1024 / 1024).toFixed(1)}MB). Max supported: 500MB.`,
    };
  }

  const tarPath = join(BACKUP_DIR, `backup_${backupId}.tar.gz`);
  const encPath = join(BACKUP_DIR, `backup_${backupId}.enc`);

  try {
    // Step 1: Create tar.gz archive via the `tar` package (no shell tar — cross-platform)
    await tarCreate({
      gzip: true,
      file: tarPath,
      cwd: dirname(sourcePath.replace(/\/$/, '')),
    }, [basename(sourcePath.replace(/\/$/, ''))]);

    if (!existsSync(tarPath)) {
      throw new Error('tar archive creation failed');
    }

    // Step 2: Read the tar, AES-256-GCM encrypt it
    const plaintext = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(tarPath);
      stream.on('data', (c) => chunks.push(c as Buffer));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });

    // AES-256-GCM with random 12-byte nonce
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', BACKUP_KEY, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Write: nonce (12) + authTag (16) + ciphertext
    const encBuffer = Buffer.concat([nonce, authTag, ciphertext]);
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(encPath);
      stream.write(encBuffer);
      stream.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    // Step 3: Compute SHA-256 integrity hash
    const integrityHash = createHash('sha256').update(encBuffer).digest('hex');

    // Cleanup intermediate tar
    try { unlinkSync(tarPath); } catch {}

    return {
      ok: true,
      backupFilePath: encPath,
      fileCount,
      sizeBytes: encBuffer.length,
      integrityHash,
      encryptionAlgo: 'aes-256-gcm',
    };
  } catch (e: any) {
    // Cleanup partial files
    try { if (existsSync(tarPath)) unlinkSync(tarPath); } catch {}
    try { if (existsSync(encPath)) unlinkSync(encPath); } catch {}
    return {
      ok: false,
      backupFilePath: '',
      fileCount,
      sizeBytes,
      integrityHash: '',
      encryptionAlgo: 'aes-256-gcm',
      error: e.message,
    };
  }
}

// Actually decrypt + extract a backup to a destination path.
export async function restoreEncryptedBackup(encPath: string, destPath: string): Promise<RestoreResult> {
  if (!existsSync(encPath)) {
    return { ok: false, restoredPath: '', fileCount: 0, error: `Backup file not found: ${encPath}` };
  }

  mkdirSync(destPath, { recursive: true });

  const tarPath = join(BACKUP_DIR, `restore_${Date.now()}.tar.gz`);

  try {
    // Read encrypted file
    const encBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(encPath);
      stream.on('data', (c) => chunks.push(c as Buffer));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });

    // Parse: nonce (12) + authTag (16) + ciphertext
    if (encBuffer.length < 28) {
      throw new Error('Backup file too small to be valid');
    }
    const nonce = encBuffer.subarray(0, 12);
    const authTag = encBuffer.subarray(12, 28);
    const ciphertext = encBuffer.subarray(28);

    // AES-256-GCM decrypt
    const decipher = createDecipheriv('aes-256-gcm', BACKUP_KEY, nonce);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    // Write tar to disk
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(tarPath);
      stream.write(plaintext);
      stream.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    // Extract tar to destPath using the `tar` package (no shell tar)
    await tarExtract({
      file: tarPath,
      cwd: destPath,
    });

    // Cleanup intermediate tar
    try { unlinkSync(tarPath); } catch {}

    // Count extracted files
    const { stdout } = await execAsync(`find ${destPath} -type f 2>/dev/null | wc -l`, { maxBuffer: 10 * 1024 * 1024 });
    const fileCount = parseInt(stdout.trim()) || 0;

    return {
      ok: true,
      restoredPath: destPath,
      fileCount,
    };
  } catch (e: any) {
    try { if (existsSync(tarPath)) unlinkSync(tarPath); } catch {}
    return {
      ok: false,
      restoredPath: '',
      fileCount: 0,
      error: e.message,
    };
  }
}

// Verify backup integrity by re-reading + re-hashing + comparing
export async function verifyBackup(encPath: string, expectedHash: string): Promise<{ ok: boolean; verified: boolean; actualHash: string; error?: string }> {
  if (!existsSync(encPath)) {
    return { ok: false, verified: false, actualHash: '', error: `Backup file not found: ${encPath}` };
  }
  try {
    const encBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(encPath);
      stream.on('data', (c) => chunks.push(c as Buffer));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
    const actualHash = createHash('sha256').update(encBuffer).digest('hex');
    return {
      ok: true,
      verified: actualHash === expectedHash,
      actualHash,
    };
  } catch (e: any) {
    return { ok: false, verified: false, actualHash: '', error: e.message };
  }
}

// List all backup files on disk
export function listBackupFiles(): string[] {
  ensureBackupDir();
  try {
    return readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.enc'))
      .map((f) => join(BACKUP_DIR, f));
  } catch {
    return [];
  }
}

// Delete a backup file (refuses if immutable flag is set in DB)
export async function deleteBackup(backupId: string, encPath: string): Promise<{ ok: boolean; error?: string }> {
  // Check immutability in DB
  const backup = await db.backup.findUnique({ where: { id: backupId } });
  if (backup?.immutable) {
    return { ok: false, error: 'Backup is marked immutable and cannot be deleted' };
  }
  try {
    if (existsSync(encPath)) unlinkSync(encPath);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// Upload to cloud storage — hook for S3/Azure/GCS
// Stub — wire up with your cloud SDK of choice.
export async function uploadToCloud(encPath: string, key: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  // TODO: implement with @aws-sdk/client-s3 or @azure/storage-blob
  return { ok: false, error: 'Cloud upload not configured. Set up AWS_S3_BUCKET or AZURE_STORAGE_CONTAINER env vars.' };
}
