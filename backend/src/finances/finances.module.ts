import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { RegistrationReportService } from './registration-report.service';
import { SchoolMailService } from './school-mail.service';
import { FinancialPdfService } from './financial-pdf.service';
import { FINANCIAL_PDF, SCHOOL_MAIL } from './mail.tokens';
import { AuthModule } from '../auth/auth.module';
import { FinanceControlController } from './finance-control.controller';
import { FinanceControlService } from './finance-control.service';
import { Module } from '@nestjs/common';
import { FinancesService } from './finances.service';
import { FinancesController } from './finances.controller';

@Module({
  imports: [AuthModule],
  controllers: [RefundsController, FinancesController, FinanceControlController],
  providers: [RefundsService, RegistrationReportService, FinancesService, FinanceControlService, SchoolMailService, FinancialPdfService,
    { provide: SCHOOL_MAIL, useExisting: SchoolMailService }, { provide: FINANCIAL_PDF, useExisting: FinancialPdfService }],
  exports: [FinancesService],
})
export class FinancesModule {}
