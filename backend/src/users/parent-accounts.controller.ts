import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';

@ApiTags('Accès parents')
@Controller('parents')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ParentAccountsController {
  constructor(private readonly users: UsersService) {}

  @Get(':id/account') @Roles('ADMIN', 'DIRECTEUR', 'COMPTABLE')
  @ApiOperation({ summary: 'État de l’accès à l’espace parents' })
  status(@Param('id') id: string) { return this.users.parentAccount(id); }

  @Post(':id/account') @Roles('ADMIN', 'DIRECTEUR', 'COMPTABLE')
  @ApiOperation({ summary: 'Créer l’accès parent (identifiant : numéro de portable, mot de passe provisoire)' })
  create(@Param('id') id: string, @CurrentUser() actor: any) { return this.users.createParentAccount(id, actor); }

  @Post(':id/account/reset-password') @Roles('ADMIN', 'DIRECTEUR', 'COMPTABLE')
  @ApiOperation({ summary: 'Générer un nouveau mot de passe provisoire pour le parent' })
  resetPassword(@Param('id') id: string, @CurrentUser() actor: any) { return this.users.resetParentPassword(id, actor); }

  @Patch(':id/account/status') @Roles('ADMIN', 'DIRECTEUR')
  @ApiOperation({ summary: 'Activer ou désactiver l’accès parent' })
  setStatus(@Param('id') id: string, @Body() body: { enabled: boolean }, @CurrentUser() actor: any) {
    return this.users.setParentAccountEnabled(id, body?.enabled, actor);
  }
}
