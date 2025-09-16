
//src/auth/auth.cocntroller.ts
import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User, UserSchema } from './user.schema';
import { JwtStrategy } from './jwt.strategy';
import { CategoriesModule } from '@/categories/categories.module';
console.log('CategoriesModule:', CategoriesModule);


@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-save-state',
      signOptions: { expiresIn: process.env.JWT_EXPIRES || '1d' },
    }),
    forwardRef(() => CategoriesModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
