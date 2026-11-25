import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FeaturesService } from './features.service';

@ApiTags('Modules et fonctionnalités')
@Controller('features')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class FeaturesController {
  constructor(private readonly features: FeaturesService) {}

  @Get() @ApiOperation({ summary: 'Modules actifs (pour adapter l’interface)' })
  states() { return this.features.states(); }

  @Get('admin') @Roles('ADMIN') @ApiOperation({ summary: 'Liste détaillée des modules activables' })
  list() { return this.features.list(); }

  @Put(':key') @Roles('ADMIN') @ApiOperation({ summary: 'Activer ou désactiver un module' })
  set(@Param('key') key: string, @Body() body: { enabled: boolean }, @CurrentUser() actor: any) { return this.features.set(key, body?.enabled, actor); }
}
