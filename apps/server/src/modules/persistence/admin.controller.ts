import { Body, Controller, ForbiddenException, Headers, NotFoundException, Post, BadRequestException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PersistenceService } from './persistence.service';
import { getPersistentUploadsDir, getDataDir } from '../../config/runtime';

/**
 * Restoring a backup of accounts/matches/photos onto the server. Disabled unless the server has an
 * ADMIN_IMPORT_TOKEN (at least 24 characters) in its environment, and every call must send it as a
 * Bearer token. Nothing is ever deleted: records are only added, or replaced by a newer copy.
 */
@Controller('api/admin')
export class AdminController {
  constructor(private readonly persistence: PersistenceService) {}

  private authorize(authHeader?: string) {
    const expected = (process.env.ADMIN_IMPORT_TOKEN || '').trim();
    if (expected.length < 24) throw new NotFoundException();
    const given = (authHeader || '').startsWith('Bearer ') ? authHeader!.slice(7).trim() : '';
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException();
  }

  @Post('import-db')
  importDb(@Headers('authorization') auth: string, @Body() body: any) {
    this.authorize(auth);
    if (!body || typeof body !== 'object' || (typeof body.users !== 'object' && typeof body.matches !== 'object')) {
      throw new BadRequestException('Expected { users, matches }');
    }
    return this.persistence.importBackup({ users: body.users || {}, matches: body.matches || {} });
  }

  @Post('import-avatar')
  importAvatar(@Headers('authorization') auth: string, @Body() body: { name?: string; base64?: string }) {
    this.authorize(auth);
    const name = path.basename(String(body?.name || ''));
    if (!/^[A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)$/i.test(name) || typeof body?.base64 !== 'string') {
      throw new BadRequestException('Expected { name, base64 } for a .jpg/.png/.webp file');
    }
    const dir = path.join(getPersistentUploadsDir() || path.join(getDataDir(), 'uploads'), 'avatars');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, name);
    if (fs.existsSync(target)) return { saved: false, reason: 'exists' };
    fs.writeFileSync(target, Buffer.from(body.base64, 'base64'));
    return { saved: true };
  }
}
