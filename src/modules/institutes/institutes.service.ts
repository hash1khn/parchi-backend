import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CACHE_KEYS, CACHE_TTL } from '../redis/cache-keys';

@Injectable()
export class InstitutesService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // Public: Get active institutes for students
  async findAllActive() {
    return this.redis.getOrSet(
      CACHE_KEYS.institutes(),
      CACHE_TTL.INSTITUTES,
      () =>
        this.prisma.institutes.findMany({
          where: { is_active: true },
          select: { name: true, id: true },
          orderBy: { name: 'asc' },
        }),
    );
  }

  // Admin: Get all institutes
  async findAll() {
    return this.prisma.institutes.findMany({
      orderBy: { name: 'asc' },
    });
  }

  // Admin: Create institute
  async create(name: string) {
    const created = await this.prisma.institutes.create({
      data: { name },
    });
    await this.redis.del(CACHE_KEYS.institutes());
    return created;
  }

  // Admin: Update institute
  async update(id: string, name?: string, isActive?: boolean) {
    const institute = await this.prisma.institutes.findUnique({
      where: { id },
    });

    if (!institute) {
      throw new NotFoundException('Institute not found');
    }

    const updated = await this.prisma.institutes.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(isActive !== undefined && { is_active: isActive }),
        updated_at: new Date(),
      },
    });
    await this.redis.del(CACHE_KEYS.institutes());
    return updated;
  }

  // Admin: Delete institute
  async remove(id: string) {
    const institute = await this.prisma.institutes.findUnique({
      where: { id },
    });

    if (!institute) {
      throw new NotFoundException('Institute not found');
    }

    await this.prisma.institutes.delete({ where: { id } });
    await this.redis.del(CACHE_KEYS.institutes());
    return { message: 'Institute deleted successfully' };
  }
}
