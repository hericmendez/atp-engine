import { Injectable, NestMiddleware, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class PaginationAuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // 🔒 Validação simples de token (pode adaptar depois)
/*     const token = req.headers['Authorization'];
    if (!token) {
      throw new UnauthorizedException('Token inválido ou ausente');
    }
 */
    // 📄 Paginação padrão
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;

    if (page < 1 || limit < 1) {
      throw new BadRequestException('Parâmetros de paginação inválidos');
    }

    // 🔀 Cálculo de offset para usar no banco ou API
    (req as any).pagination = {
      page,
      limit,
      offset: (page - 1) * limit,
    };

    next();
  }
}
