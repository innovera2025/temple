import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import "reflect-metadata";
import { AppModule } from "./app.module";
import { configureApp } from "./app-setup";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  configureApp(app);

  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>("apiPort");
  await app.listen(port);
}

void bootstrap();
