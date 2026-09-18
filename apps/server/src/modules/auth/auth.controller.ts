import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  GoogleAuthDto,
  LinkGoogleAccountDto,
  LoginDto,
  RegisterDto,
  VerifyEmailDto,
  ResendVerificationDto,
  ForgotPasswordDto,
  VerifyResetCodeDto,
  ResetPasswordDto,
  ChangePasswordDto,
  ChangeEmailDto,
} from '@baffa/shared';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: any) {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    return this.authService.register(dto, ip);
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: any) {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.authService.login(dto, ip, userAgent);
  }

  @Post('google')
  async googleAuth(@Body() dto: GoogleAuthDto) {
    return this.authService.googleAuth(dto);
  }

  @Post('google/link')
  async linkGoogleAccount(@Body() dto: LinkGoogleAccountDto) {
    return this.authService.linkGoogleAccount(dto);
  }

  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification')
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('verify-reset-code')
  async verifyResetCode(@Body() dto: VerifyResetCodeDto) {
    return this.authService.verifyResetCode(dto);
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  async changePassword(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: ChangePasswordDto
  ) {
    const user = this.extractUserFromHeader(authHeader);
    return this.authService.changePassword(user.sub, dto);
  }

  @Post('change-email')
  async changeEmail(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: ChangeEmailDto
  ) {
    const user = this.extractUserFromHeader(authHeader);
    return this.authService.changeEmail(user.sub, dto);
  }

  @Post('logout')
  async logout(@Body('refreshToken') refreshToken?: string) {
    return this.authService.logout(refreshToken);
  }

  @Post('logout-all')
  async logoutAll(@Headers('authorization') authHeader: string | undefined) {
    const user = this.extractUserFromHeader(authHeader);
    return this.authService.logoutAll(user.sub);
  }

  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Get('me')
  async getMe(@Headers('authorization') authHeader?: string) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { authenticated: false };
    }
    const token = authHeader.substring(7);
    const payload = this.authService.validateToken(token);
    return { authenticated: !!payload, user: payload };
  }

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
