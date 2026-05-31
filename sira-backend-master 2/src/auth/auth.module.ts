import { Module, forwardRef } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import type { StringValue } from 'ms';

@Module({
    imports: [
        forwardRef(() => UsersModule),
        ConfigModule,
        PassportModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => {
                const jwtExpiresIn = configService.get<string>('JWT_EXPIRES_IN');
                return {
                    secret: configService.get<string>('JWT_SECRET') || 'secretKey',
                    // Keep this configurable to avoid frequent forced re-login in long sessions.
                    signOptions: { expiresIn: (jwtExpiresIn as StringValue) || ('7d' as StringValue) },
                };
            },
            inject: [ConfigService],
        }),
    ],
    providers: [AuthService, JwtStrategy],
    controllers: [AuthController],
    exports: [AuthService],
})
export class AuthModule { }
