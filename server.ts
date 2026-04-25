import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import cors from "cors";
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Basic Security Headers
  app.use(helmet({
    contentSecurityPolicy: false, // Vite handles this in dev, and for our simplicity here
  }));
  app.use(cors());
  app.use(express.json());

  // 2. Rate Limiting (20 requests per minute per IP)
  const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    skip: (req) => req.body && req.body.tutorMode === "question",
    message: { error: "Too many requests. Please slow down and focus on your studies!" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // API health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // 3. AI Tutor Endpoint with Security and Safety
  app.post("/api/tutor", limiter, async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        console.error("CRITICAL: GEMINI_API_KEY is not set in environment variables.");
        return res.status(500).json({ error: "Teacher is missing their key! Please check the API configuration." });
      }

      const { input, profile, tutorMode } = req.body;

      // Input Validation
      const maxChars = tutorMode === "lesson" ? 1000 : 2000;
      if (!input || typeof input !== "string" || input.length > maxChars) {
        return res.status(400).json({ error: `Invalid input. Keep ${tutorMode === "lesson" ? "lesson topics" : "questions"} under ${maxChars} characters.` });
      }

      if (!profile || !tutorMode) {
        return res.status(400).json({ error: "Missing session data." });
      }

      // Safety Filter Check (Basic offensive language check before AI)
      const offensiveTerms = ["badword1", "badword2"]; // Placeholder for actual list
      if (offensiveTerms.some(term => input.toLowerCase().includes(term))) {
        return res.status(400).json({ error: "Let's keep the focus on learning! Please use appropriate language." });
      }

      // Quick greeting check for "hello" behavior
      const normalizedInput = input.trim().toLowerCase();
      const greetings = ["hello", "hi", "mambo", "niaje", "hey", "hujambo", "sasa", "habari"];
      const isGreeting = greetings.some(g => normalizedInput.includes(g)) && normalizedInput.length < 20;

      if (isGreeting) {
        let greetingResponse = "";
        if (profile.languageMix === "Formal Swahili") {
          greetingResponse = "Hujambo rafiki! Mimi ni Mwalimu AI. Napenda kukusaidia kusoma STEM. Tafadhali niambie mada unayotaka kusomea leo au niulize swali lolote la kisayansi.";
        } else if (profile.languageMix === "Mixed (Sheng/English)") {
          greetingResponse = "Sasa rafiki! Naitwa Mode Mwalimu. Tuko pamoja kumsaka huyu STEM. Niambie ile topic unataka tuchase leo au niulize swali yoyote. Ready ku-rock?";
        } else {
          greetingResponse = "Hello there! I am Teacher Mwalimu. I'm here to help you master STEM subjects. Please provide a topic for our lesson or ask me any question you have!";
        }
        return res.json({ text: greetingResponse });
      }

      const modelId = "gemini-1.5-flash"; 
      
      let systemPrompt = "";
      if (tutorMode === "lesson") {
        const totalSeconds = (profile.studyHours * 3600) + (profile.studyMinutes * 60);
        systemPrompt = `
          You are 'Mwalimu AI', an expert educational STEM tutor for Kenyan students.
          Student Level: ${profile.educationLevel} (${profile.specificLevel})
          Subject: ${profile.subjects[0] || "General Science"}
          Language Preference: ${profile.languageMix}
          
          AI SAFETY RULES:
          1. ONLY answer STEM-related questions (Math, Physics, Chemistry, Biology, CS, Aviation, Agriculture).
          2. Do NOT provide harmful, illegal, or inappropriate content.
          3. Keep responses age-appropriate for ${profile.educationLevel} students.
          4. If the request is not related to STEM, politely redirect to learning.

          STRICT TIMING RULE:
          The lesson content MUST be concise enough to be presented in EXACTLY ${profile.studyHours} hours and ${profile.studyMinutes} minutes (Total: ${totalSeconds} seconds). 

          STRUCTURE:
          ## 🧊 Lesson Content (Use Kenyan analogies e.g. matatus, mahindi, kiberiti)
          ## 🌍 Practical Example
          ## 🎯 Practice Questions
          ## 🎯 Quick Check
          [NOTE]Brief plain text summary (no asterisks)[/NOTE]
        `;
      } else {
        systemPrompt = `
          You are 'Mwalimu AI', answering a specific STEM question briefly for a Kenyan student.
          Student Level: ${profile.educationLevel} (${profile.specificLevel})
          Subject: ${profile.subjects[0] || "General Science"}
          
          AI SAFETY RULES:
          1. ONLY answer STEM-related questions.
          2. Stay educational and professional.

          Format:
          ## Background Information
          ## Answer (Bold **important concepts**)
        `;
      }

      const result = await genAI.models.generateContent({
        model: modelId,
        config: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
          ],
        },
        contents: [input]
      });

      const text = result.text || "";

      // Output Validation (Is it educational?)
      if (text.length < 2) {
        console.error("AI returned short or empty response:", JSON.stringify(result, null, 2));
        throw new Error("Empty AI response");
      }

      res.json({ text });
    } catch (error: any) {
      console.error("AI Error Details:", error);
      const errorMessage = error?.message || "Unknown AI error";
      res.status(500).json({ 
        error: "Pole sana, the AI system is resting.",
        details: errorMessage.includes("API_KEY") ? "API Key issue" : "System glitch",
        suggestion: "Check if your Gemini API key is correctly set in the environment."
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
