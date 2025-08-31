import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app/app.module'
import { ValidationPipe } from '@nestjs/common'


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('api')
app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
await app.listen(process.env.PORT || 3000)

console.log(
  `🚀 Save State API on http://localhost:${process.env.PORT || 3000}/api`,
)

}
bootstrap();
