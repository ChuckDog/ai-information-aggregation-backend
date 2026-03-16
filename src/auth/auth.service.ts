import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const updateData: any = {};
    if (updateProfileDto.name) {
      updateData.name = updateProfileDto.name;
    }
    if (updateProfileDto.password) {
      const salt = await bcrypt.genSalt();
      updateData.password = await bcrypt.hash(updateProfileDto.password, salt);
    }

    if (Object.keys(updateData).length > 0) {
      await this.usersService.update(userId, updateData);
    }

    const updatedUser = await this.usersService.findById(userId);
    if (updatedUser) {
      const { password, refreshTokenHash, ...result } = updatedUser;
      return result;
    }
    return null;
  }

  async signIn(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.getTokens(user);
    await this.updateRefreshTokenHash(user.id, tokens.refresh_token);
    await this.usersService.update(user.id, { lastLoginAt: new Date() });
    return tokens;
  }

  async logout(userId: string) {
    await this.usersService.update(userId, { refreshTokenHash: null });
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_SECRET'),
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

      const tokens = await this.getTokens(user);
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

  async getTokens(user: any) {
    const payload = {
      sub: user.id,
      username: user.email,
      role: user.role,
      isActive: user.isActive,
      name: user.name,
    };

    const accessExpiration = this.configService.get<string>(
      'JWT_ACCESS_EXPIRATION_TIME',
      '15m',
    );
    const refreshExpiration = this.configService.get<string>(
      'JWT_REFRESH_EXPIRATION_TIME',
      '7d',
    );

    const [at, rt] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: accessExpiration,
        secret: this.configService.get<string>('JWT_SECRET'),
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: refreshExpiration,
        secret: this.configService.get<string>('JWT_SECRET'),
      }),
    ]);

    const decodedAt = this.jwtService.decode(at) as { exp: number };
    const expiresIn = decodedAt.exp * 1000; // Return absolute timestamp in ms

    return {
      access_token: at,
      refresh_token: rt,
      expires_at: expiresIn,
    };
  }
}
