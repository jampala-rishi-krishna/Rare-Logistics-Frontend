import { Router, type IRouter } from "express";
const HealthCheckResponse = { parse: (value: { status: string }) => value };

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
