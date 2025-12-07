import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import serverless from "serverless-http";
import { 
  createEmergency,
  acceptEmergency,
  rejectEmergency
} from "../controllers/emergencyController.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.post("/emergency", createEmergency);
app.post("/emergency/:id/accept", acceptEmergency);
app.post("/emergency/:id/reject", rejectEmergency);

// ❌ Jangan pakai app.listen()
// Vercel butuh export handler, bukan menjalankan server
export const handler = serverless(app);

export default app;
