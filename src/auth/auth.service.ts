import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { compare } from 'bcryptjs';
import { LoginDto } from './dto/login.dto';
import { AppsScriptClientService } from '../upstream/apps-script-client.service';
import { AppError } from '../common/errors/app-error';
import { toArray } from '../common/utils/data.util';
import { AuditService } from '../audit/audit.service';
import { AuthUser, UserRole } from '../common/interfaces/auth-user.interface';

interface LoginRow {
  user_id: number;
  user_mail: string;
  password_hash: string;
}

@Injectable()
export class AuthService {
  private readonly jwtExpiresIn: string | number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly appsScriptClient: AppsScriptClientService,
    private readonly auditService: AuditService,
  ) {
    this.jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN') ?? '7d';
  }

  async login(dto: LoginDto) {
    const normalizedMail = dto.user_mail.trim().toLowerCase();

    const loginData = await this.appsScriptClient.call<unknown>('get_login_data', {}, {
      legacyArgs: [],
    });

    const credentials = this.extractRows<LoginRow>(loginData);

    const credential = credentials.find(
      (item) => item.user_mail?.toLowerCase?.() === normalizedMail,
    );

    if (!credential) {
      await this.auditService.record(
        'auth.login.failed',
        0,
        'user',
        normalizedMail,
        { reason: 'INVALID_CREDENTIALS' },
      );
      throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials');
    }

    const isValidPassword = await compare(dto.password, credential.password_hash);
    if (!isValidPassword) {
      await this.auditService.record(
        'auth.login.failed',
        credential.user_id,
        'user',
        String(credential.user_id),
        { reason: 'INVALID_CREDENTIALS' },
      );
      throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials');
    }

    const user = await this.appsScriptClient.call<Record<string, unknown>>(
      'get_user_by_id',
      { user_id: credential.user_id },
      {
        legacyArgs: [credential.user_id],
      },
    );

    if (!user || user.user_id == null) {
      throw new AppError('UNAUTHORIZED', 'User not found');
    }

    if (user.user_is_active === false) {
      throw new AppError('USER_DISABLED', 'User disabled');
    }

    const role = this.normalizeRole(user.user_role);

    const payload: AuthUser = {
      sub: Number(user.user_id),
      user_id: Number(user.user_id),
      role,
      leader_id: user.user_leader_id ? Number(user.user_leader_id) : null,
    };

    const token = await this.jwtService.signAsync(payload, {
      expiresIn: this.jwtExpiresIn as any,
    });

    await this.auditService.record(
      'auth.login.success',
      payload.user_id,
      'user',
      String(payload.user_id),
      { role: payload.role },
    );

    return {
      token,
      expires_in: this.jwtExpiresIn,
      user: {
        user_id: payload.user_id,
        user_name: user.user_name,
        user_mail: user.user_mail,
        role: payload.role,
        leader_id: payload.leader_id,
        team: user.user_team ?? null,
      },
    };
  }

  async refresh(user: AuthUser) {
    const token = await this.jwtService.signAsync(
      {
        sub: user.user_id,
        role: user.role,
        leader_id: user.leader_id ?? null,
      },
      { expiresIn: this.jwtExpiresIn as any },
    );

    return {
      token,
      expires_in: this.jwtExpiresIn,
    };
  }

  private normalizeRole(role: unknown): UserRole {
    const normalized = String(role ?? 'USER').toUpperCase();
    if (normalized === 'ADMIN' || normalized === 'LEADER' || normalized === 'USER') {
      return normalized;
    }
    return 'USER';
  }

  private extractRows<T>(value: unknown): T[] {
    const direct = toArray<T>(value);
    if (direct.length > 0) {
      return direct;
    }

    if (value && typeof value === 'object') {
      for (const item of Object.values(value as Record<string, unknown>)) {
        if (Array.isArray(item)) {
          return item as T[];
        }
      }
    }

    return [];
  }
}


