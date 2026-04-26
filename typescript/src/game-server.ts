import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

import { registerPrivateDocs } from "./private-docs.js";

type GameServerConfig = {
  SERVICE_NAME: string;
  SERVICE_PORT: number;
  PRIVATE_DOCS_ENABLED?: boolean;
  PRIVATE_DOCS_PREFIX?: string;
  PRIVATE_DOCS_TOKEN?: string | null;
  AI_ENGINE_API_KEY?: string | null;
};

type CatalogSnapshot = {
  source: string;
  categories: unknown[];
};

type GenerationJobLike = {
  start(logger: FastifyBaseLogger): void;
  stop(): void;
};

type RuntimeGenerationWorkerLike = {
  bindLogger(logger: FastifyBaseLogger): void;
  dispose(): void;
};

type ServiceMetricsLike = {
  recordGenerationStored(): void;
  recordGenerationDuplicate(reason: string): void;
  recordGenerationFailed(): void;
  recordAiAuthCircuitState(state: unknown): void;
  recordGenerationProcessStarted(requested: number): void;
  recordGenerationProcessCompleted(snapshot: unknown): void;
  recordBatch(result: unknown): void;
  recordOutboundRequest(metric: unknown): void;
  recordIngestedDocuments(total: number): void;
  recordIncomingRequest(input: {
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
    requestBytes: number;
    responseBytes: number;
  }): void;
  recordLog(level: string, code: string, payload: Record<string, unknown>): void;
};

type GenerationServiceLike = {
  refreshCatalogs(): Promise<CatalogSnapshot>;
};

type BuildGameServerInput<
  TConfig extends GameServerConfig,
  TGenerationService extends GenerationServiceLike,
  TGenerationJob extends GenerationJobLike,
  TRuntimeGenerationWorker extends RuntimeGenerationWorkerLike,
  TMetrics extends ServiceMetricsLike,
> = {
  config: TConfig;
  generationService: TGenerationService;
  generationJob: TGenerationJob;
  runtimeGenerationWorker: TRuntimeGenerationWorker;
  metrics: TMetrics;
  disconnect: () => Promise<void>;
  registerHealthRoutes: (app: FastifyInstance) => Promise<void>;
  registerGameRoutes: (
    app: FastifyInstance,
    generationService: TGenerationService,
    onIngestedDocuments?: (total: number) => void,
    runtimeGenerationWorker?: TRuntimeGenerationWorker
  ) => Promise<void>;
  registerMonitoringRoutes: (
    app: FastifyInstance,
    metrics: TMetrics,
    generationService: TGenerationService
  ) => Promise<void>;
};

type BuiltGameServer<
  TConfig extends GameServerConfig,
  TGenerationService extends GenerationServiceLike,
  TGenerationJob extends GenerationJobLike,
  TRuntimeGenerationWorker extends RuntimeGenerationWorkerLike,
  TMetrics extends ServiceMetricsLike,
> = {
  app: FastifyInstance;
  config: TConfig;
  generationJob: TGenerationJob;
  generationService: TGenerationService;
  runtimeGenerationWorker: TRuntimeGenerationWorker;
  metrics: TMetrics;
};

type StartGameServerInput<
  TConfig extends GameServerConfig,
  TGenerationService extends GenerationServiceLike,
  TGenerationJob extends GenerationJobLike,
  TRuntimeGenerationWorker extends RuntimeGenerationWorkerLike,
  TMetrics extends ServiceMetricsLike,
> = BuiltGameServer<TConfig, TGenerationService, TGenerationJob, TRuntimeGenerationWorker, TMetrics> & {
  gameType: string;
};

export async function buildGameServer<
  TConfig extends GameServerConfig,
  TGenerationService extends GenerationServiceLike,
  TGenerationJob extends GenerationJobLike,
  TRuntimeGenerationWorker extends RuntimeGenerationWorkerLike,
  TMetrics extends ServiceMetricsLike,
>(
  input: BuildGameServerInput<
    TConfig,
    TGenerationService,
    TGenerationJob,
    TRuntimeGenerationWorker,
    TMetrics
  >
): Promise<
  BuiltGameServer<TConfig, TGenerationService, TGenerationJob, TRuntimeGenerationWorker, TMetrics>
> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  await app.register(swagger, {
    openapi: {
      info: {
        title: `${input.config.SERVICE_NAME} API`,
        version: "0.1.0",
      },
    },
  });

  await registerPrivateDocs(app, input.config);

  input.runtimeGenerationWorker.bindLogger(app.log);

  app.addHook("onRequest", async (request) => {
    const requestAny = request as typeof request & {
      _startedAt?: number;
      _requestBytes?: number;
      _correlationId?: string;
    };
    requestAny._startedAt = Date.now();

    const contentLength = Number(request.headers["content-length"] ?? 0);
    requestAny._requestBytes = Number.isFinite(contentLength) ? contentLength : 0;

    const inboundCorrelationId = String(request.headers["x-correlation-id"] ?? "").trim();
    requestAny._correlationId = inboundCorrelationId || randomUUID();
    request.headers["x-correlation-id"] = requestAny._correlationId;
  });

  app.addHook("onResponse", async (request, reply) => {
    if (request.url === "/health") {
      return;
    }

    const requestAny = request as typeof request & {
      _startedAt?: number;
      _requestBytes?: number;
      _correlationId?: string;
    };

    const responseContentLength = Number(reply.getHeader("content-length") ?? 0);
    const responseBytes = Number.isFinite(responseContentLength) ? responseContentLength : 0;
    const route = (request.routeOptions.url ?? "UNMATCHED") as string;
    const correlationId = requestAny._correlationId ?? randomUUID();
    const durationMs = Math.max(0, Date.now() - (requestAny._startedAt ?? Date.now()));

    reply.header("x-correlation-id", correlationId);

    input.metrics.recordIncomingRequest({
      method: request.method,
      route,
      statusCode: reply.statusCode,
      durationMs,
      requestBytes: requestAny._requestBytes ?? 0,
      responseBytes,
    });

    app.log.info({
      correlation_id: correlationId,
      service: input.config.SERVICE_NAME,
      route,
      status_code: reply.statusCode,
      duration_ms: durationMs,
      error_code: reply.statusCode >= 500 ? "upstream_or_internal_error" : undefined,
    });
  });

  await input.registerHealthRoutes(app);
  await input.registerGameRoutes(
    app,
    input.generationService,
    (total) => input.metrics.recordIngestedDocuments(total),
    input.runtimeGenerationWorker
  );
  await input.registerMonitoringRoutes(app, input.metrics, input.generationService);

  app.addHook("onClose", async () => {
    input.runtimeGenerationWorker.dispose();
    input.generationJob.stop();
    await input.disconnect();
  });

  return {
    app,
    config: input.config,
    generationJob: input.generationJob,
    generationService: input.generationService,
    runtimeGenerationWorker: input.runtimeGenerationWorker,
    metrics: input.metrics,
  };
}

export async function startGameServer<
  TConfig extends GameServerConfig,
  TGenerationService extends GenerationServiceLike,
  TGenerationJob extends GenerationJobLike,
  TRuntimeGenerationWorker extends RuntimeGenerationWorkerLike,
  TMetrics extends ServiceMetricsLike,
>(
  input: StartGameServerInput<
    TConfig,
    TGenerationService,
    TGenerationJob,
    TRuntimeGenerationWorker,
    TMetrics
  >
): Promise<void> {
  const catalogs = await input.generationService.refreshCatalogs();
  input.metrics.recordLog("info", "catalogs_initialized", {
    source: catalogs.source,
    categories: catalogs.categories.length,
  });

  await input.app.listen({ host: "0.0.0.0", port: input.config.SERVICE_PORT });
  input.generationJob.start(input.app.log);
  input.app.log.info(
    { service: input.config.SERVICE_NAME, gameType: input.gameType },
    "Service started"
  );
}