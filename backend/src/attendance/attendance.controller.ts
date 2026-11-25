import { RequireFeature } from '../features/feature.decorator';
import { Controller, Get, Post, Body, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Présences & Absences')
@RequireFeature('attendance')
@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Roles('ADMIN', 'DIRECTEUR', 'ENSEIGNANT')
  @Get('sheet/:classroomId')
  @ApiOperation({ summary: 'Feuille d\'appel journalière d\'une classe pour une date donnée' })
  @ApiQuery({ name: 'date', required: false, description: 'Format YYYY-MM-DD (défaut aujourd\'hui)' })
  async getClassAttendanceSheet(
    @Param('classroomId') classroomId: string,
    @Query('date') date?: string,
    @CurrentUser() user?: any,
  ) {
    return this.attendanceService.getClassAttendanceSheet(classroomId, date, user);
  }

  @Get('scan/roster/:classroomId')
  @Roles('ADMIN', 'DIRECTEUR', 'CONTROLEUR_PRESENCE')
  @ApiOperation({ summary: 'Liste de pointage du scanner QR pour une classe et une date' })
  async getScanRoster(
    @Param('classroomId') classroomId: string,
    @Query('date') date?: string,
  ) {
    return this.attendanceService.getScanRoster(classroomId, date);
  }

  @Post('scan')
  @Roles('ADMIN', 'DIRECTEUR', 'CONTROLEUR_PRESENCE')
  @ApiOperation({ summary: 'Scanner le QR d’un élève et enregistrer son heure d’arrivée' })
  async scanStudent(@Body() body: { qrCode: string }, @CurrentUser() actor: any) {
    return this.attendanceService.scanStudent(body?.qrCode, undefined, actor);
  }

  @Post('scan/finalize')
  @Roles('ADMIN', 'DIRECTEUR', 'CONTROLEUR_PRESENCE')
  @ApiOperation({ summary: 'Clôturer l’appel et enregistrer absents les élèves non pointés' })
  async finalizeScan(@Body() body: { classroomId: string; date?: string }) {
    return this.attendanceService.finalizeScan(body?.classroomId, body?.date);
  }

  @Post('scan/finalize-all')
  @Roles('ADMIN', 'DIRECTEUR', 'CONTROLEUR_PRESENCE')
  @ApiOperation({ summary: 'Clôturer les appels de toutes les classes de l’année en cours' })
  async finalizeAllScans(@Body() body: { date?: string }) {
    return this.attendanceService.finalizeAllScans(body?.date);
  }

  @Post('sheet')
  @Roles('ADMIN', 'DIRECTEUR', 'ENSEIGNANT')
  @ApiOperation({ summary: 'Enregistrer le pointage de présence de la classe' })
  async saveClassAttendanceSheet(@Body() body: any, @CurrentUser() user?: any) {
    return this.attendanceService.saveClassAttendanceSheet(body, user);
  }

  @Roles('ADMIN', 'DIRECTEUR', 'ENSEIGNANT')
  @Get('stats')
  @ApiOperation({ summary: 'Statistiques de présence et d\'assiduité' })
  @ApiQuery({ name: 'classroomId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getAttendanceStats(
    @Query('classroomId') classroomId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: any,
  ) {
    return this.attendanceService.getAttendanceStats({ classroomId, startDate, endDate }, user);
  }
}
