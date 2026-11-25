import { RequireFeature } from '../features/feature.decorator';
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BoardingService } from './boarding.service';

const STAFF = ['ADMIN', 'DIRECTEUR', 'SURVEILLANT_INTERNAT'];

@ApiTags('Internat')
@RequireFeature('boarding')
@Controller('boarding')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BoardingController {
  constructor(private readonly service: BoardingService) {}

  @Get('overview') @Roles(...STAFF) @ApiOperation({ summary: 'Chiffres clés de l’internat' })
  overview() { return this.service.overview(); }

  @Get('boarders') @Roles(...STAFF) @ApiOperation({ summary: 'Liste des internes (classes d’internat de l’année en cours)' })
  boarders(@Query('search') search?: string) { return this.service.boarders(search); }

  @Put('boarders/batch') @Roles('ADMIN', 'DIRECTEUR') @ApiOperation({ summary: 'Passer un groupe d’élèves en interne ou en externe' })
  setBoarders(@Body() body: { studentIds: string[]; isBoarder: boolean }, @CurrentUser() actor: any) { return this.service.setBoarders(body, actor); }

  @Get('rooms') @Roles(...STAFF) rooms() { return this.service.rooms(); }
  @Post('rooms') @Roles('ADMIN', 'DIRECTEUR') createRoom(@Body() body: any) { return this.service.createRoom(body); }
  @Patch('rooms/:id') @Roles('ADMIN', 'DIRECTEUR') updateRoom(@Param('id') id: string, @Body() body: any) { return this.service.updateRoom(id, body); }
  @Delete('rooms/:id') @Roles('ADMIN', 'DIRECTEUR') deleteRoom(@Param('id') id: string) { return this.service.deleteRoom(id); }
  @Post('rooms/:id/beds') @Roles('ADMIN', 'DIRECTEUR') addBed(@Param('id') id: string, @Body() body: any) { return this.service.addBed(id, body); }
  @Delete('beds/:id') @Roles('ADMIN', 'DIRECTEUR') deleteBed(@Param('id') id: string) { return this.service.deleteBed(id); }
  @Put('beds/:id/student') @Roles(...STAFF) @ApiOperation({ summary: 'Affecter un interne à un lit ou libérer le lit' })
  assignBed(@Param('id') id: string, @Body() body: { studentId?: string | null }) { return this.service.assignBed(id, body); }

  @RequireFeature('boarding.rollCall') @Get('roll-call') @Roles(...STAFF) rollCall(@Query('date') date?: string) { return this.service.rollCall(date); }
  @RequireFeature('boarding.rollCall') @Post('roll-call') @Roles(...STAFF) @ApiOperation({ summary: 'Enregistrer l’appel du soir' })
  saveRollCall(@Body() body: any, @CurrentUser() actor: any) { return this.service.saveRollCall(body, actor); }

  @RequireFeature('boarding.leaves') @Get('leaves') @Roles(...STAFF) leaves(@Query('open') open?: string, @Query('studentId') studentId?: string) { return this.service.leaves({ open, studentId }); }
  @RequireFeature('boarding.leaves') @Post('leaves') @Roles(...STAFF) @ApiOperation({ summary: 'Enregistrer une sortie (qui récupère l’élève, retour prévu)' })
  createLeave(@Body() body: any, @CurrentUser() actor: any) { return this.service.createLeave(body, actor); }
  @RequireFeature('boarding.leaves') @Post('leaves/:id/return') @Roles(...STAFF) returnLeave(@Param('id') id: string, @Body() body: any, @CurrentUser() actor: any) { return this.service.returnLeave(id, body, actor); }

  @RequireFeature('boarding.leaves') @Get('visits') @Roles(...STAFF) visits(@Query('studentId') studentId?: string) { return this.service.visits(studentId); }
  @RequireFeature('boarding.leaves') @Post('visits') @Roles(...STAFF) createVisit(@Body() body: any, @CurrentUser() actor: any) { return this.service.createVisit(body, actor); }

  @RequireFeature('boarding.health') @Get('health') @Roles(...STAFF) health(@Query('studentId') studentId?: string) { return this.service.health(studentId); }
  @RequireFeature('boarding.health') @Post('health') @Roles(...STAFF) createHealth(@Body() body: any, @CurrentUser() actor: any) { return this.service.createHealth(body, actor); }

  @RequireFeature('boarding.pocketMoney') @Get('pocket-money/:studentId') @Roles(...STAFF) pocketMoney(@Param('studentId') studentId: string) { return this.service.pocketMoney(studentId); }
  @RequireFeature('boarding.pocketMoney') @Post('pocket-money') @Roles(...STAFF) @ApiOperation({ summary: 'Dépôt ou retrait d’argent de poche' })
  recordPocketMoney(@Body() body: any, @CurrentUser() actor: any) { return this.service.recordPocketMoney(body, actor); }
}
