import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateConfigDto } from './dto/update-config.dto';

@Injectable()
export class SystemConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig() {
    const config = await this.prisma.app_configs.findFirst();
    if (!config) {
      // If none exists, create a default one
      return this.prisma.app_configs.create({
        data: {
          min_android_build_number: 1,
          min_ios_build_number: 1,
          min_android_version: '1.0.0',
          min_ios_version: '1.0.0',
          force_update_title: 'Time for an Upgrade! 🚀',
          force_update_message: 'To keep your Parchiyan safe and enjoy new deals, please update to the latest version.',
          is_under_maintenance: false,
          auto_queue_offers: true,
          auto_queue_partners: true,
        },
      });
    }
    return config;
  }

  async updateConfig(dto: UpdateConfigDto) {
    const config = await this.prisma.app_configs.findFirst();
    if (!config) {
      throw new NotFoundException('Configuration not found');
    }

    return this.prisma.app_configs.update({
      where: { id: config.id },
      data: {
        ...dto,
        updated_at: new Date(),
      },
    });
  }
}
