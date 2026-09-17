import { httpServerHandler } from "cloudflare:node";

let serverHandlerPromise;

function syncWorkerEnv(env) {
  globalThis.__CF_ENV = env;
  for (const [key, value] of Object.entries(env || {})) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      process.env[key] = String(value);
    }
  }
  if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
}

async function getServerHandler(env) {
  syncWorkerEnv(env);
  if (!serverHandlerPromise) {
    serverHandlerPromise = import("./server.js").then(({ default: serverModule }) => {
      const app = serverModule?.app;
      if (!app) throw new Error("Express app export not found");
      app.listen(8787);
      return httpServerHandler({ port: 8787 });
    });
  }
  return serverHandlerPromise;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const dynamic = url.pathname.startsWith("/api/") ||
      ["/", "/health", "/render-test", "/hello", "/register", "/test-qr"].includes(url.pathname);

    if (!dynamic) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
    }

    const handler = await getServerHandler(env);
    return handler(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    syncWorkerEnv(env);
    const db = (await import("./config/db.js")).default;
    const resetModule = (await import("./services/resetTodayIncomeService.js")).default;
    const productModule = (await import("./services/productIncomeService.js")).default;

    await db();

    if (event.cron === "30 18 * * *") {
      await resetModule.resetTodayIncome();
    } else {
      await productModule.creditProductIncome();
    }
  },
};
