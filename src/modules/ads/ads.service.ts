import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdDto } from './dto/update-ad.dto';

@Injectable()
export class AdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  /** What the student app's home carousel renders: live ads in order + rotation speed. */
  async findActive() {
    const now = new Date();
    const [ads, config] = await Promise.all([
      this.prisma.home_ads.findMany({
        where: {
          is_active: true,
          AND: [
            { OR: [{ starts_at: null }, { starts_at: { lte: now } }] },
            { OR: [{ ends_at: null }, { ends_at: { gt: now } }] },
          ],
        },
        take: 20,
        orderBy: [{ display_order: 'asc' }, { created_at: 'desc' }],
      }),
      this.systemConfigService.getConfig(),
    ]);
    return {
      intervalSeconds: config.home_ad_interval_seconds ?? 4,
      ads: ads.map((ad) => this.formatAd(ad)),
    };
  }

  async findAll() {
    const ads = await this.prisma.home_ads.findMany({
      orderBy: [{ display_order: 'asc' }, { created_at: 'desc' }],
    });
    return ads.map((ad) => this.formatAd(ad));
  }

  async findOne(id: string) {
    const ad = await this.prisma.home_ads.findUnique({ where: { id } });
    if (!ad) throw new NotFoundException('Ad not found');
    return this.formatAd(ad);
  }

  async create(dto: CreateAdDto) {
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    this.assertValidWindow(startsAt, endsAt);
    const ad = await this.prisma.home_ads.create({
      data: {
        title: dto.title,
        image_url: dto.imageUrl,
        link_url: dto.linkUrl ?? null,
        is_active: dto.isActive ?? true,
        display_order: dto.displayOrder ?? 0,
        starts_at: startsAt,
        ends_at: endsAt,
      },
    });
    return this.formatAd(ad);
  }

  async update(id: string, dto: UpdateAdDto) {
    const existing = await this.findOne(id);
    const startsAt =
      dto.startsAt !== undefined
        ? dto.startsAt
          ? new Date(dto.startsAt)
          : null
        : existing.startsAt;
    const endsAt =
      dto.endsAt !== undefined
        ? dto.endsAt
          ? new Date(dto.endsAt)
          : null
        : existing.endsAt;
    this.assertValidWindow(startsAt, endsAt);

    const ad = await this.prisma.home_ads.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.imageUrl !== undefined && { image_url: dto.imageUrl }),
        ...(dto.linkUrl !== undefined && { link_url: dto.linkUrl }),
        ...(dto.isActive !== undefined && { is_active: dto.isActive }),
        ...(dto.displayOrder !== undefined && {
          display_order: dto.displayOrder,
        }),
        ...(dto.startsAt !== undefined && { starts_at: startsAt }),
        ...(dto.endsAt !== undefined && { ends_at: endsAt }),
      },
    });
    return this.formatAd(ad);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.home_ads.delete({ where: { id } });
    return { success: true };
  }

  private assertValidWindow(startsAt: Date | null, endsAt: Date | null) {
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
  }

  private formatAd(ad: {
    id: string;
    title: string;
    image_url: string;
    link_url: string | null;
    is_active: boolean;
    display_order: number;
    starts_at: Date | null;
    ends_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: ad.id,
      title: ad.title,
      imageUrl: ad.image_url,
      linkUrl: ad.link_url,
      isActive: ad.is_active,
      displayOrder: ad.display_order,
      startsAt: ad.starts_at,
      endsAt: ad.ends_at,
      createdAt: ad.created_at,
      updatedAt: ad.updated_at,
    };
  }
}
