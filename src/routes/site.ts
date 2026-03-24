import path from 'node:path';
import { createReadStream } from 'node:fs';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

const rootDir = process.cwd();

export async function registerSiteRoutes(app: FastifyInstance): Promise<void> {
  await app.register(fastifyStatic, {
    root: path.join(rootDir, 'css'),
    prefix: '/css/',
    decorateReply: false,
  });

  await app.register(fastifyStatic, {
    root: path.join(rootDir, 'js'),
    prefix: '/js/',
    decorateReply: false,
  });

  await app.register(fastifyStatic, {
    root: path.join(rootDir, 'pages'),
    prefix: '/pages/',
    decorateReply: false,
  });

  await app.register(fastifyStatic, {
    root: path.join(rootDir, 'node_modules', 'gsap', 'dist'),
    prefix: '/node_modules/gsap/dist/',
    decorateReply: false,
  });

  app.get('/', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return reply.send(createReadStream(path.join(rootDir, 'index.html')));
  });

  app.get('/index.html', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return reply.send(createReadStream(path.join(rootDir, 'index.html')));
  });
}
