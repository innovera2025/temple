import { HttpStatus, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import "reflect-metadata";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Base64 attachment uploads (capped at 5 MB decoded -> ~6.7 MB base64) need a
  // larger JSON body than the 100 kB default.
  app.useBodyParser("json", { limit: "12mb" });
  app.useGlobalPipes(
    new ValidationPipe({
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      whitelist: true,
      transform: true
    })
  );

  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>("apiPort");
  await app.listen(port);
}

void bootstrap();
