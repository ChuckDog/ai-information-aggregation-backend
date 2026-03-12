import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async signIn(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRefreshTokenHash(user.id, tokens.refresh_token);
    return tokens;
  }

  async logout(userId: string) {
    await this.usersService.update(userId, { refreshTokenHash: null });
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: 'DO_NOT_USE_THIS_VALUE_IN_PRODUCTION', // TODO: Move to ConfigService
      });
      const userId = payload.sub;
      const user = await this.usersService.findById(userId);

      if (!user || !user.refreshTokenHash) {
        throw new ForbiddenException('Access Denied');
      }

      const refreshTokenMatches = await bcrypt.compare(
        refreshToken,
        user.refreshTokenHash,
      );
      if (!refreshTokenMatches) {
        throw new ForbiddenException('Access Denied');
      }

      const tokens = await this.getTokens(user.id, user.email);
      await this.updateRefreshTokenHash(user.id, tokens.refresh_token);
      return tokens;
    } catch (e) {
      throw new ForbiddenException('Access Denied');
    }
  }

  async updateRefreshTokenHash(userId: string, refreshToken: string) {
    const salt = await bcrypt.genSalt();
    const hash = await bcrypt.hash(refreshToken, salt);
    await this.usersService.update(userId, { refreshTokenHash: hash });
  }

  async getTokens(userId: string, email: string) {
    const payload = { sub: userId, username: email };

    const [at, rt] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: '15m',
        secret: 'DO_NOT_USE_THIS_VALUE_IN_PRODUCTION',
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: '7d',
        secret: 'DO_NOT_USE_THIS_VALUE_IN_PRODUCTION',
      }),
    ]);

    return {
      access_token: at,
      refresh_token: rt,
    };
  }
}
