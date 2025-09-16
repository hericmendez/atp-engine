// src/auth/auth.service.ts
import { forwardRef, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User, UserDocument } from './user.schema';
import { CategoriesService } from '@/categories/categories.service';
import { RegisterDto } from './dto/register.dto';
import { DEFAULT_CATEGORIES } from '@/categories/constants';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    @Inject(forwardRef(() => CategoriesService))
        private readonly categoriesService: CategoriesService, // ⬅️ injetado

  ) {}

async register() {
  const user = await this.userModel.create(RegisterDto);

  // Cria categorias padrão
  for (const name of DEFAULT_CATEGORIES) {
    try {
      await this.categoriesService.createCategory({ name }, user._id.toString());
    } catch (err) {
      // ignora erro de duplicate key
      console.log(`Categoria ${name} já existe para esse usuário`);
    }
  }

  return user;
}


  async validateUser(email: string, password: string) {
    const user = await this.userModel.findOne({ email });
    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new UnauthorizedException('Senha incorreta');

    return user;
  }

async login(email: string, password: string) {
  const user = await this.validateUser(email, password);
  const payload = { email: user.email, sub: user._id };
  return {
    username: user.username,
    userId: user._id,       // ✅ facilita no front
    access_token: this.jwtService.sign(payload)
  };
}

}
