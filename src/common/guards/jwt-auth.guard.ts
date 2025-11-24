import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../../modules/auth/auth.service';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException(API_RESPONSE_MESSAGES.AUTH.UNAUTHORIZED);
    }

    const user = await this.authService.validateUserFromSession(token);

    if (!user) {
      throw new UnauthorizedException(API_RESPONSE_MESSAGES.AUTH.TOKEN_INVALID);
    }

    request.user = user;
    return true;
  }

  private extractTokenFromHeader(request: any): string | null {
    const authHeader = request.headers?.authorization;
    if (!authHeader) {
      return null;
    }

    const [type, token] = authHeader.split(' ') ?? [];
    return type === 'Bearer' ? token : null;
  }
}

