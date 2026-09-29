// GET /api/v1/backup — list backups
// POST /api/v1/backup — create/restore/verify/delete a backup (REAL encryption)

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createEncryptedBackup, restoreEncryptedBackup, verifyBackup, deleteBackup } from '@/lib/engines/backup-engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const backups = await db.backup.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  const completed = backups.filter((b) => b.status === 'completed').length;
  const immutable = backups.filter((b) => b.immutable).length;
  const verified = backups.filter((b) => b.verified).length;
  const lastBackup = backups.find((b) => b.status === 'completed');
  return NextResponse.json({
    backups: backups.map((b) => ({
      ...b,
      createdAt: b.createdAt.toISOString(),
      completedAt: b.completedAt?.toISOString(),
      verifiedAt: b.verifiedAt?.toISOString(),
      expiresAt: b.expiresAt?.toISOString(),
    })),
    status: {
      totalBackups: backups.length,
      completedBackups: completed,
      immutableBackups: immutable,
      verifiedBackups: verified,
      lastCleanBackup: lastBackup?.completedAt?.toISOString() || null,
      rpoMinutes: lastBackup?.rpoMinutes || 15,
      rtoMinutes: lastBackup?.rtoMinutes || 5,
      recoveryReady: completed > 0,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Verify integrity
    if (body.action === 'verify') {
      const backup = await db.backup.findUnique({ where: { id: body.backupId } });
      if (!backup) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
      if (!backup.backupFilePath) return NextResponse.json({ error: 'Backup file path missing' }, { status: 400 });
      const result = await verifyBackup(backup.backupFilePath, backup.integrityHash || '');
      if (result.ok) {
        await db.backup.update({
          where: { id: backup.id },
          data: {
            verified: result.verified,
            verifiedAt: new Date(),
          },
        });
      }
      return NextResponse.json({
        verified: result.verified,
        expectedHash: backup.integrityHash?.substring(0, 24) + '...',
        actualHash: result.actualHash.substring(0, 24) + '...',
        error: result.error,
      });
    }

    // Restore
    if (body.action === 'restore') {
      const backup = await db.backup.findUnique({ where: { id: body.backupId } });
      if (!backup) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
      if (backup.status !== 'completed') return NextResponse.json({ error: 'Backup not complete' }, { status: 400 });
      if (!backup.backupFilePath) return NextResponse.json({ error: 'Backup file path missing' }, { status: 400 });

      const restorePath = body.restorePath || `/tmp/sentinelx-restore-${Date.now()}`;
      const result = await restoreEncryptedBackup(backup.backupFilePath, restorePath);
      return NextResponse.json({
        ok: result.ok,
        message: result.ok
          ? `Backup restored to ${restorePath} (${result.fileCount} files extracted)`
          : `Restore failed: ${result.error}`,
        restoredPath: result.restoredPath,
        fileCount: result.fileCount,
        error: result.error,
      });
    }

    // Delete (refuses if immutable)
    if (body.action === 'delete') {
      const backup = await db.backup.findUnique({ where: { id: body.backupId } });
      if (!backup) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
      if (!backup.backupFilePath) return NextResponse.json({ error: 'Backup file path missing' }, { status: 400 });
      const result = await deleteBackup(backup.id, backup.backupFilePath);
      if (result.ok) {
        await db.backup.delete({ where: { id: backup.id } });
      }
      return NextResponse.json({ ok: result.ok, error: result.error });
    }

    // Default: create a new encrypted backup
    const sourcePath = body.sourcePath || '/tmp';
    const triggeredBy = body.triggeredBy || 'manual';
    const immutable = body.immutable !== false; // default true

    // Generate a unique backup ID for the filename
    const backupId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    const result = await createEncryptedBackup(sourcePath, backupId);

    if (!result.ok) {
      // Still record the attempt
      await db.backup.create({
        data: {
          sourcePath,
          backupFilePath: result.backupFilePath || '',
          status: 'failed',
          fileCount: result.fileCount,
          integrityHash: '',
          sizeBytes: result.sizeBytes,
          immutable,
          rpoMinutes: 15,
          rtoMinutes: 5,
          verified: false,
          triggeredBy,
        },
      });
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }

    // Persist metadata
    const backup = await db.backup.create({
      data: {
        sourcePath,
        backupFilePath: result.backupFilePath,
        status: 'completed',
        fileCount: result.fileCount,
        integrityHash: result.integrityHash,
        encryptionAlgo: result.encryptionAlgo,
        sizeBytes: result.sizeBytes,
        immutable,
        rpoMinutes: 15,
        rtoMinutes: 5,
        verified: true,
        verifiedAt: new Date(),
        completedAt: new Date(),
        triggeredBy,
      },
    });

    return NextResponse.json({
      ok: true,
      message: `Encrypted backup created: ${result.fileCount} files, ${(result.sizeBytes / 1024).toFixed(1)}KB encrypted. Hash: ${result.integrityHash.substring(0, 24)}...`,
      backup: {
        id: backup.id,
        sourcePath: backup.sourcePath,
        backupFilePath: backup.backupFilePath,
        status: backup.status,
        fileCount: backup.fileCount,
        sizeBytes: backup.sizeBytes,
        integrityHash: backup.integrityHash,
        encryptionAlgo: backup.encryptionAlgo,
        immutable: backup.immutable,
        verified: backup.verified,
        completedAt: backup.completedAt?.toISOString(),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
