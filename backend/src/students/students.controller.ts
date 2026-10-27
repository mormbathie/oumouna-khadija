import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, StreamableFile } from '@nestjs/common';
import { Readable } from 'node:stream';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Élèves & Inscriptions')
@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @Roles('ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT', 'PARENT')
  @ApiOperation({ summary: 'Liste des élèves avec filtres (classe, statut, recherche)' })
  @ApiQuery({ name: 'classId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  async findAll(
    @Query('classId') classId?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('fullDay') fullDay?: string,
    @CurrentUser() user?: any,
  ) {
    return this.studentsService.findAll({ classId, search, status, fullDay }, user);
  }

  @Post('fee-quote')
  @Roles('ADMIN', 'DIRECTEUR', 'COMPTABLE')
  async quote(@Body() body: any) { return this.studentsService.quote(body); }

  @Put(':id/registration-discount')
  @Roles('DIRECTEUR')
  @ApiOperation({ summary: 'Accorder, modifier ou retirer une réduction sur une facture d’inscription' })
  async applyRegistrationDiscount(@Param('id') id: string, @Body() body: any, @CurrentUser() actor: any) {
    return this.studentsService.applyRegistrationDiscount(id, body, actor);
  }

  @Post(':id/registration-discount/refund')
  @Roles('COMPTABLE')
  @ApiOperation({ summary: 'Enregistrer la remise au parent du trop-perçu approuvé par la direction' })
  async refundRegistrationDiscount(@Param('id') id: string, @Body() body: any, @CurrentUser() actor: any) {
    return this.studentsService.refundRegistrationDiscount(id, body, actor);
  }

  @Get(':id/photo')
  @Roles('ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT', 'PARENT', 'CONTROLEUR_PRESENCE')
  @ApiOperation({ summary: 'Afficher la photo d’identité de l’élève autorisé' })
  async getPhoto(@Param('id') id: string, @CurrentUser() user: any) {
    const photo = await this.studentsService.getPhoto(id, user);
    return new StreamableFile(Readable.from([photo.buffer]), {
      type: photo.mimeType,
      disposition: 'inline',
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT', 'PARENT')
  @ApiOperation({ summary: 'Dossier complet d\'un élève (inscriptions, notes, factures, présences)' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.studentsService.findOne(id, user);
  }

  @Post()
  @Roles('ADMIN', 'DIRECTEUR', 'COMPTABLE')
  @ApiOperation({ summary: 'Inscrire un nouvel élève (avec affectation de classe et génération de facture)' })
  async create(@Body() body: any, @CurrentUser() actor: any) {
    return this.studentsService.create(body, actor);
  }

  @Put(':id')
  @Roles('ADMIN', 'DIRECTEUR')
  @ApiOperation({ summary: 'Modifier les informations d\'un élève' })
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() actor: any) {
    return this.studentsService.update(id, body, actor);
  }

  @Post('enroll')
  @Roles('ADMIN', 'DIRECTEUR')
  @ApiOperation({ summary: 'Affecter ou réinscrire un élève dans une classe' })
  async enroll(@Body() body: { studentId: string; classroomId: string; academicYearId: string }, @CurrentUser() actor: any) {
    return this.studentsService.enroll(body, actor);
  }

  @Delete(':id')
  @Roles('ADMIN', 'DIRECTEUR')
  @ApiOperation({ summary: 'Supprimer un dossier élève (administrateur ou directeur)' })
  async remove(@Param('id') id: string) {
    return this.studentsService.remove(id);
  }
}
