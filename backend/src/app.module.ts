import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClassesModule } from './classes/classes.module';
import { ParentsModule } from './parents/parents.module';
import { StudentsModule } from './students/students.module';
import { FinancesModule } from './finances/finances.module';
import { GradesModule } from './grades/grades.module';
import { AttendanceModule } from './attendance/attendance.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UsersModule } from './users/users.module';
import { DocumentsModule } from './documents/documents.module';
import { StaffAttendanceModule } from './staff-attendance/staff-attendance.module';
import { DataTransferModule } from './data-transfer/data-transfer.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    ClassesModule,
    ParentsModule,
    StudentsModule,
    FinancesModule,
    GradesModule,
    AttendanceModule,
    DashboardModule,
    UsersModule,
    DocumentsModule,
    StaffAttendanceModule,
    DataTransferModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
