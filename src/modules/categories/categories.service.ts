import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CACHE_KEYS, CACHE_TTL } from '../redis/cache-keys';

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private async bustCategoryCache() {
    await this.redis.del(CACHE_KEYS.categories());
  }

  // Public: Get all active categories with nested active subcategories
  async findAllActive() {
    return this.redis.getOrSet(
      CACHE_KEYS.categories(),
      CACHE_TTL.CATEGORIES,
      () =>
        this.prisma.merchant_categories.findMany({
          where: { is_active: true },
          include: {
            merchant_subcategories: {
              where: { is_active: true },
              orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
            },
          },
          orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
        }),
    );
  }

  // Admin: Get all categories with nested subcategories (including inactive)
  async findAll() {
    return this.prisma.merchant_categories.findMany({
      include: {
        merchant_subcategories: {
          orderBy: [
            { sort_order: 'asc' },
            { name: 'asc' }
          ]
        }
      },
      orderBy: [
        { sort_order: 'asc' },
        { name: 'asc' }
      ]
    });
  }

  // Admin: Create category
  async createCategory(name: string, sortOrder?: number) {
    // Check if category already exists
    const existing = await this.prisma.merchant_categories.findUnique({
      where: { name }
    });
    if (existing) {
      throw new ConflictException('Category with this name already exists');
    }

    return this.prisma.merchant_categories.create({
      data: {
        name,
        sort_order: sortOrder ?? 0
      }
    }).then(async (created) => {
      await this.bustCategoryCache();
      return created;
    });
  }

  // Admin: Update category
  async updateCategory(id: string, name?: string, isActive?: boolean, sortOrder?: number) {
    const category = await this.prisma.merchant_categories.findUnique({
      where: { id }
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (name && name !== category.name) {
      const existing = await this.prisma.merchant_categories.findUnique({
        where: { name }
      });
      if (existing) {
        throw new ConflictException('Category with this name already exists');
      }
    }

    const updated = await this.prisma.merchant_categories.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(isActive !== undefined && { is_active: isActive }),
        ...(sortOrder !== undefined && { sort_order: sortOrder }),
        updated_at: new Date()
      }
    });
    await this.bustCategoryCache();
    return updated;
  }

  // Admin: Delete category (checks merchant usage)
  async removeCategory(id: string) {
    const category = await this.prisma.merchant_categories.findUnique({
      where: { id }
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Check if any merchants are using this category name
    const merchantCount = await this.prisma.merchants.count({
      where: { category: category.name }
    });

    if (merchantCount > 0) {
      throw new ConflictException(
        `Category is currently in use by ${merchantCount} merchant(s). Deactivate it instead.`
      );
    }

    const deleted = await this.prisma.merchant_categories.delete({
      where: { id }
    });
    await this.bustCategoryCache();
    return deleted;
  }

  // Admin: Create subcategory
  async createSubcategory(categoryId: string, name: string, sortOrder?: number) {
    const category = await this.prisma.merchant_categories.findUnique({
      where: { id: categoryId }
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const existing = await this.prisma.merchant_subcategories.findUnique({
      where: {
        category_id_name: {
          category_id: categoryId,
          name
        }
      }
    });

    if (existing) {
      throw new ConflictException('Subcategory with this name already exists in this category');
    }

    const created = await this.prisma.merchant_subcategories.create({
      data: {
        category_id: categoryId,
        name,
        sort_order: sortOrder ?? 0
      }
    });
    await this.bustCategoryCache();
    return created;
  }

  // Admin: Update subcategory
  async updateSubcategory(id: string, name?: string, isActive?: boolean, sortOrder?: number) {
    const subcategory = await this.prisma.merchant_subcategories.findUnique({
      where: { id }
    });

    if (!subcategory) {
      throw new NotFoundException('Subcategory not found');
    }

    if (name && name !== subcategory.name) {
      const existing = await this.prisma.merchant_subcategories.findUnique({
        where: {
          category_id_name: {
            category_id: subcategory.category_id,
            name
          }
        }
      });
      if (existing) {
        throw new ConflictException('Subcategory with this name already exists in this category');
      }
    }

    const updated = await this.prisma.merchant_subcategories.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(isActive !== undefined && { is_active: isActive }),
        ...(sortOrder !== undefined && { sort_order: sortOrder }),
        updated_at: new Date()
      }
    });
    await this.bustCategoryCache();
    return updated;
  }

  // Admin: Delete subcategory (checks merchant usage)
  async removeSubcategory(id: string) {
    const subcategory = await this.prisma.merchant_subcategories.findUnique({
      where: { id }
    });

    if (!subcategory) {
      throw new NotFoundException('Subcategory not found');
    }

    // Check if any merchants are using this subcategory name
    const merchantCount = await this.prisma.merchants.count({
      where: { sub_category: subcategory.name }
    });

    if (merchantCount > 0) {
      throw new ConflictException(
        `Subcategory is currently in use by ${merchantCount} merchant(s). Deactivate it instead.`
      );
    }

    const deleted = await this.prisma.merchant_subcategories.delete({
      where: { id }
    });
    await this.bustCategoryCache();
    return deleted;
  }
}
