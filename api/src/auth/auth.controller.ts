import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, ClientIp, CurrentUser, type AuthUser } from '../common/auth.js';
import { AuthService } from './auth.service.js';

type Json = Record<string, unknown>;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Which sign-in methods this server offers. */
  @Get('providers')
  providers() {
    return { email: true, google: this.auth.googleEnabled };
  }

  @Post('signup')
  signup(@Body() body: Json, @ClientIp() ip: string) {
    return this.auth.signup(body ?? {}, ip);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: Json, @ClientIp() ip: string) {
    return this.auth.login(body ?? {}, ip);
  }

  /** Step 1 of Google sign-in: the web app asks for the consent-screen URL. */
  @Get('google/url')
  googleUrl(@Query('redirectUri') redirectUri?: string, @Query('state') state?: string) {
    return this.auth.googleAuthUrl(redirectUri, state);
  }

  /** Step 2: the web app's /auth/google/callback hands over the authorization code. */
  @Post('google')
  @HttpCode(200)
  google(@Body() body: Json, @ClientIp() ip: string) {
    return this.auth.googleSignIn(body ?? {}, ip);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  update(@CurrentUser() user: AuthUser, @Body() body: Json) {
    return this.auth.update(user.id, body ?? {});
  }

  @Delete('me')
  @UseGuards(AuthGuard)
  remove(@CurrentUser() user: AuthUser) {
    return this.auth.deleteAccount(user.id);
  }

  @Post('password')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  password(@CurrentUser() user: AuthUser, @Body() body: Json) {
    return this.auth.changePassword(user.id, body ?? {});
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.auth.signOutEverywhere(user.id);
  }
}
