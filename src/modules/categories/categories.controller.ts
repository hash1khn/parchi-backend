import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';
import { createApiResponse } from '../../utils/serializer.util';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAllActive() {
    const data = await this.categoriesService.findAllActive();
    return createApiResponse(data, 'Active categories retrieved successfully');
  }
}

@Controller('admin/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.ADMIN)
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll() {
    const data = await this.categoriesService.findAll();
    return createApiResponse(data, 'All categories retrieved successfully');
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCategory(
    @Body('name') name: string,
    @Body('sortOrder') sortOrder?: number
  ) {
    const data = await this.categoriesService.createCategory(name, sortOrder);
    return createApiResponse(data, 'Category created successfully');
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async updateCategory(
    @Param('id') id: string,
    @Body('name') name?: string,
    @Body('isActive') isActive?: boolean,
    @Body('sortOrder') sortOrder?: number
  ) {
    const data = await this.categoriesService.updateCategory(id, name, isActive, sortOrder);
    return createApiResponse(data, 'Category updated successfully');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async removeCategory(@Param('id') id: string) {
    const data = await this.categoriesService.removeCategory(id);
    return createApiResponse(data, 'Category deleted successfully');
  }

  @Post(':id/subcategories')
  @HttpCode(HttpStatus.CREATED)
  async createSubcategory(
    @Param('id') categoryId: string,
    @Body('name') name: string,
    @Body('sortOrder') sortOrder?: number
  ) {
    const data = await this.categoriesService.createSubcategory(categoryId, name, sortOrder);
    return createApiResponse(data, 'Subcategory created successfully');
  }

  @Put('subcategories/:id')
  @HttpCode(HttpStatus.OK)
  async updateSubcategory(
    @Param('id') id: string,
    @Body('name') name?: string,
    @Body('isActive') isActive?: boolean,
    @Body('sortOrder') sortOrder?: number
  ) {
    const data = await this.categoriesService.updateSubcategory(id, name, isActive, sortOrder);
    return createApiResponse(data, 'Subcategory updated successfully');
  }

  @Delete('subcategories/:id')
  @HttpCode(HttpStatus.OK)
  async removeSubcategory(@Param('id') id: string) {
    const data = await this.categoriesService.removeSubcategory(id);
    return createApiResponse(data, 'Subcategory deleted successfully');
  }
}
