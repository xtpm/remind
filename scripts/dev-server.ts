import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parse } from "node:url";
import { createServer as createViteServer } from "vite";

type ApiHandler = (req: any, res: any) => Promise<void>;

type ApiResponse = ServerResponse & {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

const apiRoutes: Array<{
  pattern: RegExp;
  load: () => Promise<{ default: ApiHandler }>;
  params?: (match: RegExpMatchArray) => Record<string, string>;
}> = [
  {
    pattern: /^\/api\/auth\/login$/,
    load: () => import("../api/auth/login"),
  },
  {
    pattern: /^\/api\/auth\/signup$/,
    load: () => import("../api/auth/signup"),
  },
  {
    pattern: /^\/api\/auth\/session$/,
    load: () => import("../api/auth/session"),
  },
  {
    pattern: /^\/api\/auth\/logout$/,
    load: () => import("../api/auth/logout"),
  },
  {
    pattern: /^\/api\/reminders$/,
    load: () => import("../api/reminders/index"),
  },
  {
    pattern: /^\/api\/reminders\/([^/]+)$/,
    load: () => import("../api/reminders/[id]"),
    params: (match) => ({ id: decodeURIComponent(match[1]) }),
  },
  {
    pattern: /^\/api\/settings$/,
    load: () => import("../api/settings"),
  },
];

function enhanceResponse(res: ServerResponse): ApiResponse {
  const apiRes = res as ApiResponse;

  apiRes.status = (code: number) => {
    apiRes.statusCode = code;
    return apiRes;
  };

  apiRes.json = (body: unknown) => {
    if (!apiRes.hasHeader("Content-Type")) {
      apiRes.setHeader("Content-Type", "application/json");
    }
    apiRes.end(JSON.stringify(body));
  };

  return apiRes;
}

function collectBody(req: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("error", reject);
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve(undefined);
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
  });
}

async function start() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });

  const server = createServer(async (req, res) => {
    const pathname = parse(req.url ?? "").pathname ?? "/";
    const route = apiRoutes.find((item) => pathname.match(item.pattern));

    if (route) {
      const match = pathname.match(route.pattern)!;
      const apiReq = req as IncomingMessage & {
        body?: unknown;
        query: Record<string, string>;
      };
      apiReq.query = route.params?.(match) ?? {};
      apiReq.body = await collectBody(req);

      try {
        const mod = await route.load();
        await mod.default(apiReq, enhanceResponse(res));
      } catch (error) {
        console.error(error);
        enhanceResponse(res).status(500).json({ error: "server error" });
      }
      return;
    }

    vite.middlewares(req, res);
  });

  server.listen(5173, "127.0.0.1", () => {
    console.log("local app: http://127.0.0.1:5173/");
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
