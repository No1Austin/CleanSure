import accountingRoutes from './routes/accountingRoutes.js';
import {webhook} from './lib/stripeCheckout.js';
import lifecycle from './routes/lifecycle.js';
import cleanerAccountRoutes from "./routes/cleanerAccountRoutes.js";
import cleanerApplicationRoutes from "./routes/cleanerApplicationRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import crmRoutes from "./routes/crmRoutes.js";
import jobOfferRoutes from "./routes/jobOfferRoutes.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "dotenv/config";

const app = express();
// Trust the known reverse proxy in production.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet());

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "http://localhost:5173"
}));

app.post('/api/stripe/webhook',express.raw({type:'application/json'}),webhook);
app.use(express.json({ limit: "100kb" }));

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100
}));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    application: "CleanSure",
    status: "running"
  });
});

app.use("/api/bookings", bookingRoutes);
app.use("/api/cleaner-applications", cleanerApplicationRoutes);
app.use("/api/cleaner-account", cleanerAccountRoutes);
app.use("/api/crm", crmRoutes);
app.use("/api/job-offers", jobOfferRoutes);

app.use('/api/lifecycle',lifecycle);
app.use('/api/accounting',accountingRoutes);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`CleanSure API running on port ${PORT}`);
});
