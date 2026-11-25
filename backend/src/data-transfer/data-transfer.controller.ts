import { RequireFeature } from '../features/feature.decorator';
import { Controller, Get, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BUSINESS_MODELS, DataTransferService } from './data-transfer.service';

@ApiTags('Import et export des données métier')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@RequireFeature('dataTransfer')
@Controller('data-transfer')
export class DataTransferController {
  constructor(private readonly service: DataTransferService) {}

  @Get('models')
  models() { return BUSINESS_MODELS; }

  @Get('export-models')
  exportModels() { return this.service.exportModels(); }

  @Get('export')
  async export(@Query('format') format: string, @Query('model') model: string, @Res() response: Response) {
    const result = await this.service.export(format, model);
    response.setHeader('Content-Type', result.mime);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.send(result.data);
  }

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  preview(@UploadedFile() file: any, @Query('model') model?: string) { return this.service.preview(file, model); }

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  import(@UploadedFile() file: any, @Query('model') model?: string) { return this.service.import(file, model); }
}
