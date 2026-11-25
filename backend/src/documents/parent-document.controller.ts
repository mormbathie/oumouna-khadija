import { RequireFeature } from '../features/feature.decorator';
import { Controller, Get, Param, StreamableFile, UseGuards } from '@nestjs/common';
import { Readable } from 'node:stream';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DocumentsService } from './documents.service';
@RequireFeature('parentPortal') @Controller('parent-portal') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('PARENT')
export class ParentDocumentController {
  constructor(private readonly documents: DocumentsService) {}
  @Get('students/:studentId/documents/:documentId')
  async file(@Param('studentId') studentId: string, @Param('documentId') id: string, @CurrentUser() user: any) {
    await this.documents.assertParentOwnsStudent(studentId,user);
    const doc = await this.documents.studentFile(studentId,id);
    return new StreamableFile(Readable.from([doc.buffer]), { type: doc.mimeType, disposition: `attachment; filename*=UTF-8''${encodeURIComponent(doc.originalName)}` });
  }
}
