import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('Messages WhatsApp')
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get() @Roles('ADMIN', 'DIRECTEUR', 'COMPTABLE')
  @ApiOperation({ summary: 'Journal des messages WhatsApp ouverts pour les parents' })
  journal(@Query('kind') kind?: string, @Query('studentId') studentId?: string) { return this.service.journal({ kind, studentId }); }

  @Get('absences') @Roles('ADMIN', 'DIRECTEUR', 'COMPTABLE')
  @ApiOperation({ summary: 'Absences et retards du jour, avec les liens WhatsApp des parents' })
  absences(@Query('date') date?: string) { return this.service.absences(date); }

  @Get('payments/:paymentId') @Roles('ADMIN', 'DIRECTEUR', 'COMPTABLE')
  @ApiOperation({ summary: 'Message WhatsApp de confirmation d’un paiement' })
  payment(@Param('paymentId') paymentId: string) { return this.service.payment(paymentId); }

  @Get('invoices/:invoiceId/reminder') @Roles('ADMIN', 'DIRECTEUR', 'COMPTABLE')
  @ApiOperation({ summary: 'Message WhatsApp de relance d’une facture impayée' })
  reminder(@Param('invoiceId') invoiceId: string) { return this.service.reminder(invoiceId); }

  @Post('announcements') @Roles('ADMIN', 'DIRECTEUR')
  @ApiOperation({ summary: 'Préparer une annonce WhatsApp et la liste des parents' })
  announcement(@Body() body: any) { return this.service.announcement(body); }

  @Post('opened') @Roles('ADMIN', 'DIRECTEUR', 'COMPTABLE')
  @ApiOperation({ summary: 'Noter qu’un message WhatsApp a été ouvert pour un parent' })
  logOpened(@Body() body: any, @CurrentUser() actor: any) { return this.service.logOpened(body, actor); }
}
