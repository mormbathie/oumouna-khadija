import { AccountSecurityService } from '../auth/account-security.service';
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersService } from './users.service';

@ApiTags('Gestion des utilisateurs Keycloak')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService, private readonly security: AccountSecurityService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  create(@Body() body: any) {
    return this.usersService.create(body);
  }

  @Post('me/password')
  @Roles()
  changeOwnPassword(@CurrentUser() actor: any, @Body() body: { currentPassword: string; newPassword: string; totp?: string }) {
    return this.usersService.changeOwnPassword(actor, body?.currentPassword, body?.newPassword, body?.totp);
  }

  @Get('me/two-factor')
  @Roles()
  twoFactorStatus(@CurrentUser() actor: any) { return this.security.status(actor.userId); }

  @Post('me/two-factor')
  @Roles()
  enrollTwoFactor(@CurrentUser() actor: any) { return this.security.enroll(actor.userId); }

  @Get('me')
  @Roles()
  getOwnProfile(@CurrentUser() actor: any) {
    return this.usersService.getOwnProfile(actor);
  }

  @Patch('me')
  @Roles()
  updateOwnProfile(@CurrentUser() actor: any, @Body() body: { firstName: string; lastName: string; email: string; phone?: string }) {
    return this.usersService.updateOwnProfile(actor, body);
  }

  @Post('me/verify-email')
  @Roles()
  requestOwnEmailVerification(@CurrentUser() actor: any) {
    return this.usersService.requestOwnEmailVerification(actor);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() body: { password: string }) {
    return this.usersService.resetPassword(id, body?.password);
  }

  @Post(':id/send-activation')
  sendActivation(@Param('id') id: string) { return this.usersService.sendActivation(id); }

  @Post(':id/send-password-reset')
  sendPasswordReset(@Param('id') id: string) { return this.usersService.sendPasswordReset(id); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { email: string; firstName: string; lastName: string; role: string }, @CurrentUser() actor: any) {
    return this.usersService.update(id, body, actor.userId);
  }

  @Patch(':id/status')
  setEnabled(
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
    @CurrentUser() actor: any,
  ) {
    if (typeof body?.enabled !== 'boolean') {
      throw new BadRequestException('Le champ enabled doit être un booléen.');
    }
    return this.usersService.setEnabled(id, body.enabled, actor.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.usersService.remove(id, actor.userId);
  }
}
