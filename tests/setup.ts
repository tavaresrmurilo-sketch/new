// Ambiente isolado de teste: banco próprio e integrações externas desligadas.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/mixtour_test?schema=public";
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";
process.env.APP_URL = "http://localhost:3000";
process.env.EMAIL_PROVIDER = "none";
process.env.GEOCODER = "none";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = "./storage/test-uploads";
process.env.STRIPE_SECRET_KEY = "";
process.env.STRIPE_WEBHOOK_SECRET = "";
process.env.CRON_SECRET = "test-cron-secret";
