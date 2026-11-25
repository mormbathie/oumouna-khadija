import { RequireFeature } from '../features/feature.decorator';
import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { GradesService } from './grades.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Term } from '@prisma/client';

@ApiTags('Notes & Bulletins')
@RequireFeature('grades')
@Controller('grades')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  @Roles('ADMIN', 'DIRECTEUR', 'ENSEIGNANT')
  @Get()
  @ApiOperation({ summary: 'Consulter les notes par classe, matière ou trimestre' })
  @ApiQuery({ name: 'classroomId', required: false })
  @ApiQuery({ name: 'subjectId', required: false })
  @ApiQuery({ name: 'term', enum: Term, required: false })
  @ApiQuery({ name: 'studentId', required: false })
  @ApiQuery({ name: 'academicYearId', required: false })
  async getGrades(
    @Query('classroomId') classroomId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('term') term?: Term,
    @Query('studentId') studentId?: string,
    @Query('academicYearId') academicYearId?: string,
    @CurrentUser() user?: any,
  ) {
    return this.gradesService.getGrades({ classroomId, subjectId, term, studentId, academicYearId }, user);
  }

  @Post()
  @Roles('ADMIN', 'DIRECTEUR', 'ENSEIGNANT')
  @ApiOperation({ summary: 'Enregistrer une note individuelle' })
  async recordGrade(@Body() body: any, @CurrentUser() user?: any) {
    return this.gradesService.recordGrade(body, user);
  }

  @Post('batch')
  @Roles('ADMIN', 'DIRECTEUR', 'ENSEIGNANT')
  @ApiOperation({ summary: 'Saisie rapide collective des notes pour toute une classe' })
  async recordBatchGrades(@Body() body: any, @CurrentUser() user?: any) {
    return this.gradesService.recordBatchGrades(body, user);
  }

  @Post('report-cards/generate')
  @Roles('ADMIN', 'DIRECTEUR', 'ENSEIGNANT')
  @ApiOperation({ summary: 'Calculer et générer le bulletin d\'un élève' })
  async generateReportCard(
    @Body()
    body: {
      studentId: string;
      classroomId: string;
      term: Term;
      academicYearId?: string;
    },
    @CurrentUser() user?: any,
  ) {
    return this.gradesService.generateReportCard(body.studentId, body.classroomId, body.term, body.academicYearId, user);
  }

  @Post('report-cards/generate-class')
  @Roles('ADMIN', 'DIRECTEUR')
  @ApiOperation({ summary: 'Générer les bulletins de toute la classe en un clic' })
  async generateClassReportCards(
    @Body()
    body: {
      classroomId: string;
      term: Term;
      academicYearId?: string;
    },
  ) {
    return this.gradesService.generateClassReportCards(body.classroomId, body.term, body.academicYearId);
  }

  @Roles('ADMIN', 'DIRECTEUR', 'ENSEIGNANT')
  @Get('report-cards/details')
  @ApiOperation({ summary: 'Détails imprimables du bulletin scolaire d\'un élève' })
  @ApiQuery({ name: 'studentId' })
  @ApiQuery({ name: 'classroomId' })
  @ApiQuery({ name: 'term', enum: Term })
  @ApiQuery({ name: 'academicYearId', required: false })
  async getReportCardDetails(
    @Query('studentId') studentId: string,
    @Query('classroomId') classroomId: string,
    @Query('term') term: Term,
    @Query('academicYearId') academicYearId?: string,
    @CurrentUser() user?: any,
  ) {
    return this.gradesService.getReportCardDetails(studentId, classroomId, term, academicYearId, user);
  }

  @Roles('ADMIN', 'DIRECTEUR', 'ENSEIGNANT')
  @Get('report-cards/class')
  @ApiOperation({ summary: 'Liste de tous les bulletins générés pour une classe et trimestre' })
  @ApiQuery({ name: 'classroomId' })
  @ApiQuery({ name: 'term', enum: Term })
  @ApiQuery({ name: 'academicYearId', required: false })
  async getClassReportCards(
    @Query('classroomId') classroomId: string,
    @Query('term') term: Term,
    @Query('academicYearId') academicYearId?: string,
    @CurrentUser() user?: any,
  ) {
    return this.gradesService.getClassReportCards(classroomId, term, academicYearId, user);
  }
}
