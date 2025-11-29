import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.ADMIN)
export class AdminMerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get('branches')
  @HttpCode(HttpStatus.OK)
  async getAllBranches() {
    return this.merchantsService.getAllBranches();
  }

  @Post('branches/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approveBranch(@Param('id') id: string) {
    return this.merchantsService.approveBranch(id);
  }

  @Post('branches/:id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectBranch(@Param('id') id: string) {
    return this.merchantsService.rejectBranch(id);
  }

  @Patch('branches/:id')
  @HttpCode(HttpStatus.OK)
  async updateBranch(
    @Param('id') id: string,
    @Body() updateBranchDto: UpdateBranchDto,
  ) {
    return this.merchantsService.updateBranch(id, updateBranchDto);
  }

  @Patch('merchants/:id')
  @HttpCode(HttpStatus.OK)
  async updateMerchant(
    @Param('id') id: string,
    @Body() updateMerchantDto: UpdateMerchantDto,
  ) {
    return this.merchantsService.updateMerchant(id, updateMerchantDto);
  }
}
