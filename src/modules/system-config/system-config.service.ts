import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateConfigDto } from './dto/update-config.dto';
import { RedisService } from '../redis/redis.service';
import { CACHE_KEYS, CACHE_TTL } from '../redis/cache-keys';

@Injectable()
export class SystemConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getConfig() {
    return this.redis.getOrSet(CACHE_KEYS.appConfig(), CACHE_TTL.APP_CONFIG, async () => {
      const config = await this.prisma.app_configs.findFirst();
      if (!config) {
        return this.prisma.app_configs.create({
          data: {
            min_android_build_number: 1,
            min_ios_build_number: 1,
            min_android_version: '1.0.0',
            min_ios_version: '1.0.0',
            force_update_title: 'Time for an Upgrade! 🚀',
            force_update_message:
              'To keep your Parchiyan safe and enjoy new deals, please update to the latest version.',
            is_under_maintenance: false,
            auto_queue_offers: true,
            auto_queue_partners: true,
          },
        });
      }
      return config;
    });
  }

  async updateConfig(dto: UpdateConfigDto) {
    const config = await this.prisma.app_configs.findFirst();
    if (!config) {
      throw new NotFoundException('Configuration not found');
    }

    const updated = await this.prisma.app_configs.update({
      where: { id: config.id },
      data: {
        ...dto,
        updated_at: new Date(),
      },
    });
    await this.redis.del(CACHE_KEYS.appConfig());
    return updated;
  }
}
