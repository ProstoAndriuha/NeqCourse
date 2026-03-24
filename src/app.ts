import Fastify from 'fastify';
import sensible from '@fastify/sensible';

import { configureAuthContext } from './plugins/auth-context';
import { configureRateLimit } from './plugins/rate-limit';
import { registerAdminRoutes } from './routes/admin';
import { registerAuthRoutes } from './routes/auth';
import { registerCatalogRoutes } from './routes/catalog';
import { registerCheckoutRoutes } from './routes/checkout';
import { registerEnrollmentRoutes } from './routes/enrollments';
import { registerHealthRoutes } from './routes/health';
import { registerMeRoutes } from './routes/me';
import { registerPaymentRoutes } from './routes/payments';
import { registerProgressRoutes } from './routes/progress';
import { registerReviewRoutes } from './routes/reviews';
import { registerSiteRoutes } from './routes/site';
import { registerTeacherCourseRoutes } from './routes/teacher-courses';

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.register(sensible);
  configureRateLimit(app);
  configureAuthContext(app);
  app.register(registerHealthRoutes);
  app.register(registerAdminRoutes);
  app.register(registerAuthRoutes);
  app.register(registerMeRoutes);
  app.register(registerCatalogRoutes);
  app.register(registerCheckoutRoutes);
  app.register(registerPaymentRoutes);
  app.register(registerEnrollmentRoutes);
  app.register(registerProgressRoutes);
  app.register(registerReviewRoutes);
  app.register(registerTeacherCourseRoutes);
  app.register(registerSiteRoutes);

  return app;
}
