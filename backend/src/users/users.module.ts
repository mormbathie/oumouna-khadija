import { AccountProfileController } from './account-profile.controller';
import { AccountProfileService } from './account-profile.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ParentAccountsController } from './parent-accounts.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [UsersController, AccountProfileController, ParentAccountsController],
  providers: [UsersService, AccountProfileService],
  exports: [UsersService],
})
export class UsersModule {}
