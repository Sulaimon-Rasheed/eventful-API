import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import * as dotenv from "dotenv"
dotenv.config()
import * as cookieParser from "cookie-parser"
import * as session from 'express-session';




async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
  );

    app.use(cookieParser())
  app.use(session({
    secret:process.env.SESSION_SECRET,
    cookie:{maxAge:60000},
    resave:false,
    saveUninitialized:false
    
  }))
  // app.setViewEngine('ejs');

  await app.listen(process.env.PORT);
}
bootstrap();
