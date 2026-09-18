import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Headers,
  UnauthorizedException,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  Req,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { AuthService } from '../auth/auth.service';
import { UpdateProfileDto, BAFFA_AVATARS } from '@baffa/shared';

@Controller('api/profile')
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly authService: AuthService
  ) {}

  /**
   * Get BAFFA avatar collection catalog
   */
  @Get('avatars')
  getAvatarCatalog() {
    return {
      avatars: BAFFA_AVATARS,
    };
  }

  /**
   * Get authenticated user's own profile
   */
  @Get('me')
  async getMyProfile(@Headers('authorization') authHeader?: string) {
    const user = this.extractUserFromHeader(authHeader);
    return this.profileService.getMyProfile(user.sub);
  }

  /**
   * Update authenticated user's profile details (Display name, Bio, Gender, AvatarId)
   */
  @Patch('me')
  async updateMyProfile(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: UpdateProfileDto
  ) {
    const user = this.extractUserFromHeader(authHeader);
    return this.profileService.updateMyProfile(user.sub, dto);
  }

  /**
   * Upload custom avatar photo (Supports Base64 JSON payload or binary buffer)
   */
  @Post('me/avatar')
  async uploadAvatar(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: { imageBase64?: string; mimeType?: string },
    @Req() req: any
  ) {
    const user = this.extractUserFromHeader(authHeader);

    let buffer: Buffer;
    let mimeType = body.mimeType || 'image/jpeg';

    if (body.imageBase64) {
      // Safely decode Base64 image payload without expensive regex that crashes V8
      let base64Data = body.imageBase64;
      if (base64Data.startsWith('data:')) {
        const commaIndex = base64Data.indexOf(',');
        if (commaIndex !== -1) {
          const meta = base64Data.substring(0, commaIndex);
          const mimeMatch = meta.match(/^data:([A-Za-z-+\/]+);base64/);
          if (mimeMatch) {
            mimeType = mimeMatch[1];
          }
          base64Data = base64Data.substring(commaIndex + 1);
        }
      }
      buffer = Buffer.from(base64Data, 'base64');
    } else if (req.body && Buffer.isBuffer(req.body)) {
      buffer = req.body;
    } else {
      throw new BadRequestException('لم يتم تقديم ملف صورة صالح');
    }

    return this.profileService.uploadCustomAvatar(user.sub, buffer, mimeType);
  }

  /**
   * Delete custom uploaded photo and revert to avatar ID
   */
  @Delete('me/avatar')
  async deleteAvatar(@Headers('authorization') authHeader?: string) {
    const user = this.extractUserFromHeader(authHeader);
    return this.profileService.deleteCustomAvatar(user.sub);
  }

  /**
   * Get public profile by username or userId (Read-only, sanitized, zero private data)
   */
  @Get('public/:identifier')
  async getPublicProfile(@Param('identifier') identifier: string) {
    return this.profileService.getPublicProfile(identifier);
  }

  /**
   * Calculate head-to-head match history between authenticated user and another player
   */
  @Get('head-to-head/:opponentId')
  async getHeadToHead(
    @Headers('authorization') authHeader: string | undefined,
    @Param('opponentId') opponentId: string
  ) {
    const user = this.extractUserFromHeader(authHeader);
    return this.profileService.getHeadToHead(user.sub, opponentId);
  }

  /**
   * Securely extract authenticated user from Authorization header
   */
  private extractUserFromHeader(authHeader?: string): { sub: string; username: string } {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('يرجى تسجيل الدخول أولاً');
    }
    const token = authHeader.substring(7);
    const payload = this.authService.validateToken(token);
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('جلسة المستخدم غير صالحة أو منتهية');
    }
    return payload;
  }
}
