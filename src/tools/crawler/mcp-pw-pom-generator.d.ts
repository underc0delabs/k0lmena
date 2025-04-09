// src/mcp-pw-pom-generator.d.ts

declare module "mcp-pw-pom-generator" {
    export interface PomGeneratorOptions {
      url: string;
      // Otras opciones que soporte el generador
    }
    export class PomGenerator {
      constructor(options: PomGeneratorOptions);
      generate(): Promise<any>;
    }
  }