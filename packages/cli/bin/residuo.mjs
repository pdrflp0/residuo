#!/usr/bin/env node
// Executa o código TypeScript da CLI diretamente (sem etapa de build), via tsx.
import { register } from 'tsx/esm/api';

register();
await import('../src/main.ts');
