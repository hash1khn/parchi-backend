import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { hashedKeysEqual, hashPartnerKey } from '../../utils/partner-key.util';

const CACHE_TTL_MS = 30_000;

@Injectable()
export class PartnerApiKeyGuard implements CanActivate {
  private cache:
    | { loadedAt: number; keys: { id: string; partner_name: string; hashed_key: string }[] }
    | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawKey = this.extractKey(request);

    if (!rawKey) {
      throw new UnauthorizedException('Missing partner API key');
    }

    const presentedHash = hashPartnerKey(rawKey);
    const keys = await this.getActiveKeys();
    const match = keys.find((key) => hashedKeysEqual(key.hashed_key, presentedHash));

    if (!match) {
      throw new UnauthorizedException('Invalid partner API key');
    }

    request.partner = {
      id: match.id,
      partnerName: match.partner_name,
    };
    return true;
  }

  private extractKey(request: any): string | null {
    const header = request.headers?.['x-partner-key'];
    if (typeof header === 'string' && header.trim()) return header.trim();
    if (Array.isArray(header) && typeof header[0] === 'string' && header[0].trim()) {
      return header[0].trim();
    }
    return null;
  }

  private async getActiveKeys() {
    const now = Date.now();
    if (this.cache && now - this.cache.loadedAt < CACHE_TTL_MS) {
      return this.cache.keys;
    }

    const keys = await this.prisma.partner_api_keys.findMany({
      where: { is_active: true },
      select: { id: true, partner_name: true, hashed_key: true },
    });
    this.cache = { loadedAt: now, keys };
    return keys;
  }
}
