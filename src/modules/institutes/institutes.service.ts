import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
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
    const trimmed = name?.trim();
    if (!trimmed) {
      throw new BadRequestException('Institute name is required');
    }

    const existing = await this.prisma.institutes.findFirst({
      where: {
        name: {
          equals: trimmed,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      throw new ConflictException('An institute with this name already exists');
    }

    try {
      const created = await this.prisma.institutes.create({
        data: { name: trimmed },
      });
      await this.redis.del(CACHE_KEYS.institutes());
      return created;
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('An institute with this name already exists');
      }
      throw err;
    }
  }

  // Admin: Update institute
  async update(id: string, name?: string, isActive?: boolean) {
    const institute = await this.prisma.institutes.findUnique({
      where: { id },
    });

    if (!institute) {
      throw new NotFoundException('Institute not found');
    }

    const trimmed = name?.trim();
    if (trimmed !== undefined) {
      if (!trimmed) {
        throw new BadRequestException('Institute name cannot be empty');
      }
      const existing = await this.prisma.institutes.findFirst({
        where: {
          name: {
            equals: trimmed,
            mode: 'insensitive',
          },
          NOT: { id },
        },
      });

      if (existing) {
        throw new ConflictException('An institute with this name already exists');
      }
    }

    try {
      const updated = await this.prisma.institutes.update({
        where: { id },
        data: {
          ...(trimmed && { name: trimmed }),
          ...(isActive !== undefined && { is_active: isActive }),
          updated_at: new Date(),
        },
      });
      await this.redis.del(CACHE_KEYS.institutes());
      return updated;
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('An institute with this name already exists');
      }
      throw err;
    }
  }

  // Admin: Delete institute
  async remove(id: string) {
    const institute = await this.prisma.institutes.findUnique({
      where: { id },
    });

    if (!institute) {
      throw new NotFoundException('Institute not found');
    }

    const linkedStudents = await this.prisma.students.count({
      where: { institute_id: id },
    });

    if (linkedStudents > 0) {
      throw new BadRequestException(
        `Cannot delete institute: ${linkedStudents} student(s) are associated with it. Please deactivate the institute instead.`
      );
    }

    try {
      await this.prisma.institutes.delete({ where: { id } });
      await this.redis.del(CACHE_KEYS.institutes());
      return { message: 'Institute deleted successfully' };
    } catch (err: any) {
      if (err.code === 'P2003') {
        throw new BadRequestException('Cannot delete institute because it has associated records. Please deactivate it instead.');
      }
      throw err;
    }
  }
}
