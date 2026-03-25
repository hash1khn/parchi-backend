import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { AuthService } from '../../modules/auth/auth.service';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      // If no token, we still allow access (public route)
      return true;
    }

    try {
      const user = await this.authService.validateUserFromSession(token);
      if (user) {
        request.user = user;
      }
    } catch (error) {
      // If token is invalid, we still allow access (public route)
      // but request.user remains undefined
    }

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
