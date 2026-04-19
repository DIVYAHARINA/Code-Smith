import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { v4 as uuidv4 } from "uuid";
import os from "os";
import { promisify } from "util";

const execAsync = promisify(exec);

// Types
interface Question {
  id: string;
  round: 1 | 2 | 3;
  type: "mcq" | "debug" | "code-completion" | "logic-completion";
  title: string;
  description: string;
  options?: string[]; // For quiz
  answer?: string; // For quiz
  buggyCode?: string; // For debug
  starterCode?: string; // For code-completion and logic-completion
  correctPatterns?: string[]; // For debug/completion
  correctAnswers?: string[]; // For logic-completion
  expectedOutput?: string; // For debug
  testInput?: string;
  hiddenTestCases?: { input: string; expectedOutput: string }[];
  points: number;
  language?: string;
  bonusPoints?: number;
  bonusDuration?: number;
  duration?: number;
  maxAttempts?: number;
}

interface User {
  id: string;
  username: string;
  password?: string;
  role: "admin" | "user" | "admin_viewer";
  violations: number;
  isLocked: boolean;
  isFullscreen: boolean;
  isQualified: boolean;
  totalScore: number;
  quizScore: number;
  debugScore: number;
  round3Score: number;
  roundScores: Record<number, number>;
  completedQuestions: string[];
}

interface Participant {
  id: string; // socket.id
  userId: string;
  username: string;
  score: number;
  quizScore: number;
  debugScore: number;
  round3Score: number;
  violations: number;
  isLocked: boolean;
  isFullscreen: boolean;
  isQualified: boolean;
  currentRound: number;
  completedQuestions: string[];
  isOnline: boolean;
}

interface ContestState {
  status: "waiting" | "active" | "ended";
  currentRound: number;
  startTime: number | null;
  round1Duration: number;
  round2Duration: number;
  round3Duration: number;
  qualificationMode: "all" | "topN" | "manual";
  qualifyCount: number;
  qualificationRound: number;
}

// Initial Data
const DATA_FILE = path.join(process.cwd(), "data.json");

const initialData = {
  questions: [
    {
      id: uuidv4(),
      round: 1,
      type: "mcq",
      title: "JavaScript Basics",
      description: "What is the result of typeof null?",
      options: ["object", "null", "undefined", "string"],
      answer: "object",
      points: 50
    },
    {
      id: uuidv4(),
      round: 1,
      type: "mcq",
      title: "CSS Selectors",
      description: "Which property is used to change the background color?",
      options: ["color", "bgcolor", "background-color", "background"],
      answer: "background-color",
      points: 50
    },
    {
      id: uuidv4(),
      round: 2,
      type: "debug",
      title: "Fix the Loop",
      description: "The loop should print numbers from 1 to 5, but it's currently infinite or wrong.",
      buggyCode: "for (let i = 1; i < 5; i--) {\n  console.log(i);\n}",
      correctPatterns: ["i++", "i <= 5", "i < 6"],
      expectedOutput: "1\n2\n3\n4\n5",
      hiddenTestCases: [
        { input: "", expectedOutput: "1\n2\n3\n4\n5" },
        { input: "3", expectedOutput: "1\n2\n3\n4\n5" },
        { input: "5", expectedOutput: "1\n2\n3\n4\n5" }
      ],
      points: 100,
      language: "javascript"
    },
    {
      id: uuidv4(),
      round: 3,
      type: "code-completion",
      title: "Complete the Function",
      description: "Complete the function to return the sum of two numbers.",
      starterCode: "function sum(a, b) {\n  // Your code here\n}",
      correctPatterns: ["return a + b", "return b + a"],
      points: 150,
      language: "javascript"
    }
  ] as Question[],
  round3Questions: [
    {
      id: uuidv4(),
      title: "Array Mapping",
      description: "Fill in the missing logic to double each number in the array.",
      codeSnippet: "const numbers = [1, 2, 3];\nconst doubled = numbers.[BLANK]((num) => num [BLANK] 2);",
      correctAnswers: ["map", "*"],
      points: 100,
      bonusPoints: 20,
      bonusDuration: 30
    },
    {
      id: uuidv4(),
      title: "Filter Logic",
      description: "Fill in the missing logic to filter even numbers.",
      codeSnippet: "const numbers = [1, 2, 3, 4, 5, 6];\nconst evens = numbers.filter(num => num [BLANK] 2 [BLANK] 0);",
      correctAnswers: ["%", "==="],
      points: 100,
      bonusPoints: 20,
      bonusDuration: 30
    }
  ] as any[],
  participants: [] as Participant[],
  users: [] as User[],
  state: {
    status: "waiting",
    currentRound: 0,
    startTime: null,
    round1Duration: 300,
    round2Duration: 600,
    round3Duration: 900,
    qualificationMode: "all",
    qualifyCount: 10,
    qualificationRound: 2,
    currentQuestionIndex: -1,
    countdown: 0
  } as ContestState,
  submissions: [] as any[],
};

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
}

function getData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      console.log("[DATA] Data file missing, creating new one");
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
      return JSON.parse(JSON.stringify(initialData));
    }
    const content = fs.readFileSync(DATA_FILE, "utf-8");
    if (!content.trim()) {
      console.log("[DATA] Data file empty, resetting");
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
      return JSON.parse(JSON.stringify(initialData));
    }
    const data = JSON.parse(content);

    // Migration: Move round3Questions to questions if they exist
    if (data.round3Questions && data.round3Questions.length > 0) {
      console.log("[DATA] Migrating round3Questions to main questions array");
      const migrated = data.round3Questions.map((q: any) => ({
        ...q,
        round: 3,
        type: "logic-completion",
        starterCode: q.codeSnippet,
        // correctAnswers is already there
      }));
      data.questions = [...(data.questions || []), ...migrated];
      data.round3Questions = [];
      saveData(data);
    }

    // Ensure all keys exist and merge state to prevent missing fields
    return {
      questions: data.questions || [],
      participants: data.participants || [],
      users: data.users || [],
      submissions: data.submissions || [],
      state: { ...initialData.state, ...(data.state || {}) }
    };
  } catch (err) {
    console.error("[DATA] Error reading data file:", err);
    // If corrupted, try to recover what we can or return initial
    return JSON.parse(JSON.stringify(initialData));
  }
}

function saveData(newData: any) {
  try {
    const rawData = fs.readFileSync(DATA_FILE, "utf-8");
    const parsedData = JSON.parse(rawData);
    
    // Explicitly update all root keys including submissions
    const finalData = {
      ...parsedData,
      questions: newData.questions || parsedData.questions || [],
      participants: newData.participants || parsedData.participants || [],
      users: newData.users || parsedData.users || [],
      submissions: newData.submissions || parsedData.submissions || [],
      state: newData.state || parsedData.state || {}
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(finalData, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to merge data.json", err);
    // If we can't read the file, try a direct write as fallback
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(newData, null, 2), "utf-8");
    } catch (e) {
      console.error("[DATA] Error saving data file fallback:", e);
    }
  }
}

const INSTANCE_ID = uuidv4().slice(0, 8);

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

const EXEC_TIMEOUT = 3000; // 3 seconds

async function runLocalCode(language: string, code: string, input?: string): Promise<{ output: string; error: string | null }> {
  console.log(`[STRICT_VERIFY] VERSION_1775465789_v6 - Executing ${language}`);
  const runId = uuidv4().slice(0, 8);
  const tmpDir = path.join(process.cwd(), "temp", runId);
  
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  let fileName = "";
  let compileCmd = "";
  let runCmd = "";
  let cleanupFiles: string[] = [];

  try {
    if (language === "python") {
      fileName = "solution.py";
      runCmd = `python "${path.join(tmpDir, fileName)}"`;
      fs.writeFileSync(path.join(tmpDir, fileName), code);
    } else if (language === "c") {
      fileName = "solution.c";
      const exeName = process.platform === "win32" ? "solution.exe" : "./solution";
      
      // Final Hardcoded Fix for Windows
      const gccPath = '"C:\\MinGW\\bin\\gcc.exe"';
      console.log(`[STRICT_VERIFY] VERSION_1775465789_v5 - HARDCODED PATH: ${gccPath}`);

      compileCmd = `${gccPath} "${path.join(tmpDir, fileName)}" -o "${path.join(tmpDir, exeName)}"`;
      runCmd = `"${path.join(tmpDir, exeName)}"`;
      fs.writeFileSync(path.join(tmpDir, fileName), code);
    } else if (language === "java") {
      // Find class name or default to Main
      const classNameMatch = code.match(/public\s+class\s+([a-zA-Z0-9_$]+)/);
      const className = classNameMatch ? classNameMatch[1] : "Main";
      fileName = `${className}.java`;
      compileCmd = `javac "${path.join(tmpDir, fileName)}"`;
      runCmd = `java -cp "${tmpDir}" ${className}`;
      fs.writeFileSync(path.join(tmpDir, fileName), code);
    } else if (language === "javascript") {
      fileName = "solution.js";
      runCmd = `node "${path.join(tmpDir, fileName)}"`;
      fs.writeFileSync(path.join(tmpDir, fileName), code);
    } else {
      return { output: "", error: "Unsupported language" };
    }

    // Compilation step if needed
    if (compileCmd) {
      try {
        await execAsync(compileCmd, { timeout: 10000 });
      } catch (err: any) {
        return { output: "", error: `[SERVER_V6] Compilation Error: ${err.stderr || err.message}` };
      }
    }

    // Execution step
    return new Promise((resolve) => {
      const process = exec(runCmd, { timeout: EXEC_TIMEOUT }, (err: any, stdout, stderr) => {
        if (err && err.killed) {
          resolve({ output: "", error: "Execution Timed Out (3s)" });
        } else {
          resolve({ 
            output: stdout.trim(), 
            error: stderr.trim() || (err ? err.message : null) 
          });
        }
      });

      if (input) {
        process.stdin?.write(input);
        process.stdin?.end();
      }
    });

  } catch (err: any) {
    return { output: "", error: err.message };
  } finally {
    // Cleanup in background
    setTimeout(() => {
      try {
        if (fs.existsSync(tmpDir)) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      } catch (cleanupErr) {
        console.error("Cleanup error:", cleanupErr);
      }
    }, 5000); // Wait a bit before cleanup to ensure process is dead
  }
}

async function startServer() {
  const data = getData();
  // Mark all participants as offline on boot
  data.participants.forEach((p: any) => {
    p.isOnline = false;
    p.id = "";
  });
  saveData(data);

  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const httpServer = createServer(app);

  // --- ADMIN 2 EXTENSION (NON-BREAKING) ---
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ message: "Token missing" });
    
    const data = getData();
    const user = data.users.find((u: any) => u.id === token);
    
    if (!user) return res.status(403).json({ message: "Invalid token" });
    
    req.user = user;
    next();
  };

  function allowAdmin2(req: any, res: any, next: any) {
    if (req.user.role === "admin" || req.user.role === "admin_viewer" || req.user.role === "admin2") {
      next();
    } else {
      return res.status(403).json({ message: "Access denied" });
    }
  }

  // Admin 2 Specific Routes
  app.get("/admin2/users", authenticateToken, allowAdmin2, (req, res) => {
    const data = getData();
    // Return all users for Admin 2 to see
    res.json(data.users.filter((u: any) => u.role === "user"));
  });

  app.get("/admin2/submissions", authenticateToken, allowAdmin2, (req, res) => {
    const data = getData();
    res.json(data.submissions || []);
  });

  app.get("/admin2/submissions/:userId", authenticateToken, allowAdmin2, (req, res) => {
    const data = getData();
    const userSubmissions = (data.submissions || []).filter((s: any) => s.userId === req.params.userId);
    res.json(userSubmissions);
  });
  // ------------------------------------------

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    transports: ["polling", "websocket"]
  });

  // Auth API
  app.get("/api/auth/admin-exists", (req, res) => {
    const data = getData();
    const adminExists = data.users.some((u: any) => u.role === "admin");
    res.json({ exists: adminExists });
  });

  app.get("/api/instance", (req, res) => {
    res.json({ instanceId: INSTANCE_ID, appUrl: process.env.APP_URL });
  });

  app.get("/api/participants", (req, res) => {
    const data = getData();
    res.json(data.participants);
  });

  app.post("/api/log-submission", (req, res) => {
    const data = getData();
    if (!data.submissions) data.submissions = [];
    data.submissions.push({
      ...req.body,
      id: uuidv4(),
      timestamp: Date.now()
    });
    saveData(data);
    res.json({ success: true });
  });

  app.get("/api/submissions", (req, res) => {
    const data = getData();
    res.json(data.submissions || []);
  });

  app.post("/api/auth/join", (req, res) => {
    try {
      console.log("[AUTH] Join request received:", req.body);
      const { username: rawUsername } = req.body;
      const username = rawUsername?.trim();

      if (!username) {
        console.warn("[AUTH] Join failed: Username missing");
        return res.status(400).json({ error: "Name is required" });
      }

      const data = getData();
      let user = data.users.find((u: any) => u.username?.toLowerCase() === username.toLowerCase() && u.role === "user");

      if (!user) {
        // Create new participant user
        user = {
          id: uuidv4(),
          username,
          role: "user",
          violations: 0,
          isLocked: false,
          totalScore: 0,
          quizScore: 0,
          debugScore: 0,
          round3Score: 0,
          roundScores: {},
          completedQuestions: []
        };
        data.users.push(user);
        saveData(data);
        console.log(`[AUTH] New participant created: ${username} (${user.id})`);
      } else {
        console.log(`[AUTH] Existing participant re-joined: ${username} (${user.id})`);
      }

      console.log(`[AUTH] Sending join response for ${username}`);
      return res.status(200).json(user);
    } catch (err) {
      console.error("[AUTH] Join error:", err);
      return res.status(500).json({ error: "Internal server error during join" });
    }
  });

  app.post("/api/auth/register", (req, res) => {
    try {
      console.log("[AUTH] Received registration request:", req.body);
      const { username: rawUsername, password: rawPassword, role } = req.body;
      const username = rawUsername?.trim();
      const password = rawPassword?.trim();

      console.log(`[AUTH] Registering user: "${username}", role: ${role}`);

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      const data = getData();

      if (role === "admin" && data.users.some((u: any) => u.role === "admin")) {
        console.warn("[AUTH] Admin registration blocked: admin already exists");
        return res.status(400).json({ error: "Admin already exists" });
      }

      if (role === "admin_viewer" && data.users.some((u: any) => u.role === "admin_viewer")) {
        console.warn("[AUTH] Admin viewer registration blocked: admin_viewer already exists");
        return res.status(400).json({ error: "Admin 2 already exists. Please login instead." });
      }

      if (data.users.some((u: any) => u.username?.toLowerCase() === username.toLowerCase() && u.role === role)) {
        console.warn(`[AUTH] Registration blocked: username ${username} already taken for role ${role}`);
        return res.status(400).json({ error: "Username already taken" });
      }

      const newUser: User = {
        id: uuidv4(),
        username,
        password,
        role,
        violations: 0,
        isLocked: false,
        isFullscreen: true,
        isQualified: true, // Default to true initially
        totalScore: 0,
        quizScore: 0,
        debugScore: 0,
        round3Score: 0,
        roundScores: {},
        completedQuestions: []
      };
      data.users.push(newUser);
      saveData(data);
      console.log(`[AUTH] User ${username} registered successfully as ${role}`);

      if (role === "admin") {
        io.emit("adminRegistered");
      }

      const { password: _, ...userWithoutPassword } = newUser;
      res.json(userWithoutPassword);
    } catch (err) {
      console.error("[AUTH] Registration error:", err);
      res.status(500).json({ error: "Internal server error during registration" });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    try {
      const { username: rawUsername, password: rawPassword } = req.body;
      const username = rawUsername?.trim();
      const password = rawPassword?.trim();

      console.log(`[AUTH] Login attempt for user: "${username}"`);

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      const data = getData();
      console.log(`[AUTH] Current registered users count: ${data.users.length}`);
      if (data.users.length > 0) {
        console.log(`[AUTH] Registered usernames: ${data.users.map((u: any) => u.username).join(", ")}`);
      }

      const user = data.users.find((u: any) => {
        const storedUsername = u.username?.toString().trim();
        const storedPassword = u.password?.toString().trim();
        return storedUsername?.toLowerCase() === username.toLowerCase() && storedPassword === password;
      });

      if (!user) {
        console.warn(`[AUTH] Login failed for user: "${username}" (Invalid credentials)`);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      console.log(`[AUTH] Login successful for user: ${username}, role: ${user.role}`);
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (err) {
      console.error("[AUTH] Login error:", err);
      res.status(500).json({ error: "Internal server error during login" });
    }
  });

  // API Routes
  app.get("/api/questions", (req, res) => {
    const data = getData();
    const round = parseInt(req.query.round as string);
    if (!isNaN(round) && round > 0) {
      return res.json(data.questions.filter((q: any) => q.round === round));
    }
    res.json(data.questions);
  });

  app.post("/api/questions", (req, res) => {
    const data = getData();
    const newQuestion = { ...req.body, id: uuidv4() };
    data.questions.push(newQuestion);
    saveData(data);
    res.json(newQuestion);
  });

  app.put("/api/questions/:id", (req, res) => {
    const data = getData();
    const index = data.questions.findIndex((q: any) => q.id === req.params.id);
    if (index !== -1) {
      data.questions[index] = { ...req.body, id: req.params.id };
      saveData(data);
      res.json(data.questions[index]);
    } else {
      res.status(404).json({ error: "Question not found" });
    }
  });

  app.delete("/api/questions/:id", (req, res) => {
    const data = getData();
    data.questions = data.questions.filter((q: any) => q.id !== req.params.id);
    saveData(data);
    res.json({ success: true });
  });

  // Round 3 API
  app.get("/api/round3/questions", (req, res) => {
    const data = getData();
    res.json(data.round3Questions);
  });

  app.post("/api/round3/questions", (req, res) => {
    const data = getData();
    const newQuestion = { ...req.body, id: uuidv4() };
    data.round3Questions.push(newQuestion);
    saveData(data);
    res.json(newQuestion);
  });

  app.put("/api/round3/questions/:id", (req, res) => {
    const data = getData();
    const index = data.round3Questions.findIndex((q: any) => q.id === req.params.id);
    if (index !== -1) {
      data.round3Questions[index] = { ...req.body, id: req.params.id };
      saveData(data);
      res.json(data.round3Questions[index]);
    } else {
      res.status(404).json({ error: "Question not found" });
    }
  });

  app.delete("/api/round3/questions/:id", (req, res) => {
    const data = getData();
    data.round3Questions = data.round3Questions.filter((q: any) => q.id !== req.params.id);
    saveData(data);
    res.json({ success: true });
  });

  app.post("/api/round3/submit", (req, res) => {
    const { questionId, answers, userId, timeTaken } = req.body;
    const data = getData();

    if (data.state.status !== "active" || data.state.currentRound !== 3) {
      return res.status(403).json({ error: "Round 3 is not active" });
    }

    const question = data.round3Questions.find((q: any) => q.id === questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });

    const user = data.users.find((u: any) => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.completedQuestions.includes(questionId)) {
      return res.status(400).json({ error: "Question already solved" });
    }

    const isCorrect = question.correctAnswers.every((ans: string, i: number) =>
      answers[i]?.trim() === ans.trim()
    );

    if (isCorrect) {
      let pointsEarned = question.points;
      if (timeTaken <= (question.bonusDuration || 30)) {
        pointsEarned += (question.bonusPoints || 0);
      }

      user.round3Score = (user.round3Score || 0) + pointsEarned;
      user.totalScore = (user.quizScore || 0) + (user.debugScore || 0) + (user.completionScore || 0) + (user.round3Score || 0);
      user.completedQuestions.push(questionId);
      user.roundScores[3] = (user.roundScores[3] || 0) + pointsEarned;

      const participant = data.participants.find((p: any) => p.userId === userId);
      if (participant) {
        participant.round3Score = user.round3Score;
        participant.score = user.totalScore;
        participant.completedQuestions.push(questionId);
      }

      saveData(data);
      io.emit("participantsUpdate", data.participants);
      return res.json({ passed: true, pointsEarned });
    } else {
      return res.json({ passed: false, pointsEarned: 0 });
    }
  });

  // Code Judge Logic
  const runPiston = async (language: string, code: string, input?: string): Promise<{ output: string; error: string | null }> => {
    return runLocalCode(language, code, input);
  };

  const runJS = (code: string, input?: string) => runPiston('javascript', code, input);

  const runPython = (code: string, input?: string) => runPiston('python', code, input);

  const runC = (code: string, input?: string) => runPiston('c', code, input);

  const runJava = (code: string, input?: string) => runPiston('java', code, input);

  const evaluateOutput = (userOutput: string, expectedOutput: string): boolean => {
    if (!expectedOutput) return true;
    const normalize = (s: string) => s.replace(/\r\n/g, "\n").trim().split("\n").map(line => line.trim()).filter(line => line).join("\n");
    return normalize(userOutput) === normalize(expectedOutput);
  };

  function injectInputIntoCode(code: string, language: string, testInput: string): string {
    if (!testInput) return code;
    const safeStr = JSON.stringify(testInput);

    if (language === "python") {
        return `import sys\nimport io\nsys.stdin = io.StringIO(${safeStr})\n` + code;
    }

    if (language === "java") {
        return code.replace(/new\s+Scanner\s*\(\s*System\.in\s*\)/g, 
            `new java.util.Scanner(new java.io.ByteArrayInputStream(${safeStr}.getBytes()))`);
    }

    if (language === "c") {
        let modifiedCode = code;
        const inputs = testInput.trim().split(/\\s+/);
        let inputIdx = 0;
        modifiedCode = modifiedCode.replace(/scanf\\s*\\(\\s*"([^"]+)"(.*?[^)])\\);/g, (match, formatStr, argsStr) => {
            const vars = argsStr.split(',').map((s: string) => s.trim().replace(/^&+/, '')).filter(Boolean);
            const formats = formatStr.match(/%./g) || [];
            let replaceStrs = [];
            for (let i = 0; i < vars.length; i++) {
                if (inputIdx < inputs.length) {
                    const val = inputs[inputIdx++];
                    const fmt = formats[i];
                    if (fmt === '%d' || fmt === '%i' || fmt === '%f' || fmt === '%lf') {
                         replaceStrs.push(`${vars[i]} = ${val};`);
                    } else if (fmt === '%s') {
                        replaceStrs.push(`strcpy(${vars[i]}, "${val}");`);
                    } else if (fmt === '%c') {
                        replaceStrs.push(`${vars[i]} = '${val}';`);
                    }
                }
            }
            if (replaceStrs.length > 0) return replaceStrs.join(" ");
            return match;
        });
        if (modifiedCode.includes("strcpy") && !modifiedCode.includes("<string.h>")) {
             modifiedCode = "#include <string.h>\\n" + modifiedCode;
        }
        return modifiedCode;
    }
    
    return code;
  }

  app.post("/api/round2/execute", async (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const { code, questionId, isSubmit, logicAnswers } = req.body;
    const data = getData();
    const question = data.questions.find((q: any) => q.id === questionId);

    if (!question) return res.status(404).json({ error: "Question not found" });

    // Enforce using the language configured by the admin contextually
    const language = question.language || "javascript";

    if (isSubmit && question.type === "logic-completion") {
      // Rule 1: Logic Presence (MANDATORY)
      const hasLoop = /for\s*\(|while\s*\(/.test(code);
      const hasIf = /if\s*\(/.test(code);
      const hasOperator = /[+\-%*/]/.test(code);
      
      if (!hasLoop && !hasIf && !hasOperator) {
        return res.json({ success: false, output: "Antigravity Violation", error: "No logic detected. Code must contain a loop, condition, or operator." });
      }

      // Rule 2: Hardcode Blocking
      const userInputs = (logicAnswers || []).join(" ");
      const hasPrint = /print|console\.log|System\.out|echo/i.test(userInputs);
      const expectedStr = question.expectedOutput ? question.expectedOutput.trim() : "";
      
      // Prevent direct expected output string if length > 0
      const hasHardcodedOutput = expectedStr && userInputs.includes(expectedStr) && expectedStr.length > 2;

      if (hasPrint || hasHardcodedOutput) {
        return res.json({ success: false, output: "Antigravity Violation", error: "Hardcoding detected. You must solve the logic without direct print statements or hardcoded output." });
      }

      // Rule 3: Blank Validation (only when no expectedOutput — if expectedOutput exists, let code execution verify)
      if (logicAnswers && question.correctAnswers && !question.expectedOutput) {
        const isCorrect = question.correctAnswers.every((ans: string, i: number) => 
          (logicAnswers[i] || "").trim() === (ans || "").trim()
        );
        if (!isCorrect) {
          return res.json({ success: false, output: "Validation Failed", error: "One or more [BLANK] inputs are incorrect." });
        }
      }
    }

    try {
      if (isSubmit && question.hiddenTestCases && question.hiddenTestCases.length > 0) {
        let allPassed = true;
        let lastOutput = "";
        let finalError = null;

        for (const testCase of question.hiddenTestCases) {
          const injectedCode = injectInputIntoCode(code, language, testCase.input);
          let result: { output: string; error: string | null };

          if (language === "java") {
            result = await runJava(injectedCode);
          } else if (language === "python") {
            result = await runPython(injectedCode);
          } else if (language === "c") {
            result = await runC(injectedCode);
          } else if (language === "javascript") {
            result = await runJS(injectedCode);
          } else {
            return res.status(400).json({ error: "Unsupported language for Round 2" });
          }

          const passed = evaluateOutput(result.output, testCase.expectedOutput);
          
          if (!passed || result.error) {
            allPassed = false;
            lastOutput = result.output;
            finalError = result.error || "Wrong Answer";
            break;
          }
          lastOutput = result.output;
        }

        res.json({
          success: allPassed,
          output: allPassed ? "Accepted" : "Wrong Answer",
          error: finalError
        });
        return;
      }

      let result: { output: string; error: string | null };
      if (language === "java") {
        result = await runJava(code, question.testInput);
      } else if (language === "python") {
        result = await runPython(code, question.testInput);
      } else if (language === "c") {
        result = await runC(code, question.testInput);
      } else if (language === "javascript") {
        result = await runJS(code, question.testInput);
      } else {
        return res.status(400).json({ error: "Unsupported language for Round 2" });
      }

      const passed = evaluateOutput(result.output, question.expectedOutput || "");

      res.json({
        success: passed,
        output: result.output,
        error: result.error
      });
    } catch (err: any) {
      res.status(500).json({ success: false, output: "", error: err.message });
    }
  });

  app.post("/api/run-code", async (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const { code, questionId } = req.body;
    const data = getData();
    const question = data.questions.find((q: any) => q.id === questionId);

    if (!question) return res.status(404).json({ error: "Question not found" });

    // Enforce using the language configured by the admin contextually
    const enforcedLanguage = question.language || "javascript";

    try {
      const result = await runLocalCode(enforcedLanguage, code, question.testInput);
      
      const passed = evaluateOutput(result.output, question.expectedOutput || "");

      res.json({
        success: passed,
        output: result.output,
        error: result.error,
        result: passed ? "Compiled Successfully" : "Compilation Failed"
      });
    } catch (err: any) {
      res.status(500).json({ success: false, output: "", error: err.message });
    }
  });

  // Smart Code Validation (Pattern Recognition)
  app.post("/api/validate", async (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const { code, questionId, timeTaken } = req.body;
    const data = getData();

    // Check if contest is active and round hasn't expired
    if (data.state.status !== "active") {
      return res.status(403).json({ error: "Contest is not active" });
    }

    const currentDuration = data.state.currentRound === 1 ? data.state.round1Duration :
      data.state.currentRound === 2 ? data.state.round2Duration :
        data.state.round3Duration;
    if (data.state.startTime && (Date.now() - data.state.startTime > currentDuration * 1000)) {
      return res.status(403).json({ error: "Round has already ended" });
    }

    const question = data.questions.find((q: any) => q.id === questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });

    const enforcedLanguage = question.language || "javascript";

    // (duplicate check removed - already checked above)

    // Smart logic: Check if code contains required patterns
    // Skip pattern matching for Round 2 if expectedOutput is provided
    const patterns = (question.round === 2 && question.expectedOutput) ? [] : (question.correctPatterns || []);
    const passedPatterns = patterns.length === 0 || patterns.every((pattern: string) => {
      if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
        const lastSlash = pattern.lastIndexOf("/");
        const regexStr = pattern.substring(1, lastSlash);
        const flags = pattern.substring(lastSlash + 1);
        try {
          return new RegExp(regexStr, flags || "i").test(code);
        } catch (e) {
          console.error(`Invalid regex pattern: ${pattern}`, e);
          return false;
        }
      }
      // Default to case-insensitive include
      return code.toLowerCase().includes(pattern.toLowerCase());
    });

    if (!passedPatterns) {
      return res.json({ passed: false, pointsEarned: 0, message: "Compilation Failed" });
    }

    // For logic-completion or code-completion, we only do pattern matching (no execution) unless expectedOutput is provided
    if ((question.type === "code-completion" || question.type === "logic-completion") && !question.expectedOutput) {
      let pointsEarned = question.points;
      const bonusDuration = question.bonusDuration || 30;
      const bonusPoints = question.bonusPoints || 0;

      if (timeTaken > 0 && timeTaken <= bonusDuration) {
        pointsEarned += bonusPoints;
      }
      return res.json({ passed: true, pointsEarned, message: "Success" });
    }

    // Now run the code judge (only for debug or if type is not specified)
    try {
      let result: { output: string; error: string | null };
      if (enforcedLanguage === "python") result = await runPython(code, question.testInput);
      else if (enforcedLanguage === "c") result = await runC(code, question.testInput);
      else if (enforcedLanguage === "java") result = await runJava(code, question.testInput);
      else if (enforcedLanguage === "javascript") result = await runJS(code, question.testInput);
      else {
        return res.json({ passed: false, pointsEarned: 0, message: "Unsupported language" });
      }

      const passedJudge = evaluateOutput(result.output, question.expectedOutput || "");

      if (!passedJudge) {
        return res.json({ passed: false, pointsEarned: 0, message: "Compilation Failed" });
      }

      let pointsEarned = question.points;
      // Bonus: configurable per question
      const bonusDuration = question.bonusDuration || 30;
      const bonusPoints = question.bonusPoints || 0;

      if (timeTaken > 0 && timeTaken <= bonusDuration) {
        pointsEarned += bonusPoints;
      }

      res.json({ passed: true, pointsEarned, message: "Compiled Successfully" });
    } catch (err) {
      res.json({ passed: false, pointsEarned: 0, message: "Compilation Failed" });
    }
  });

  // 404 for API routes
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
  });

  // Socket.IO Handling
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Send current state immediately on connection
    const initialState = getData().state;
    socket.emit("contestState", initialState);

    socket.on("requestState", () => {
      const data = getData();
      console.log(`[SOCKET] requestState from ${socket.id} on instance ${process.env.APP_URL}`);
      socket.emit("contestState", { ...data.state, appUrl: process.env.APP_URL });
      socket.emit("participantsUpdate", data.participants);
    });

    socket.on("join", ({ userId, username }) => {
      if (!userId) {
        console.warn("[SOCKET] Join attempted without userId");
        return;
      }
      console.log(`[SOCKET] User ${username} (${userId}) joining contest. Socket ID: ${socket.id}`);
      const data = getData();
      const user = data.users.find((u: any) => u.id === userId);

      if (!user && username !== "admin") {
        console.warn(`[SOCKET] Join blocked for non-existent user: ${username}`);
        socket.emit("error", "Session not found");
        return;
      }

      if (user?.isLocked) {
        console.warn(`[SOCKET] Join blocked for locked user: ${username}`);
        socket.emit("error", "Your account is locked due to multiple violations.");
        return;
      }

      // Find existing participant or create new one
      let participant = data.participants.find((p: any) => p.userId === userId);

      if (participant) {
        participant.id = socket.id;
        participant.isOnline = true;
        participant.username = username; // Update just in case
        // Sync scores from persistent user data
        if (user) {
          participant.score = user.totalScore || 0;
          participant.quizScore = user.quizScore || 0;
          participant.debugScore = user.debugScore || 0;
          participant.round3Score = user.round3Score || 0;
          participant.violations = user.violations || 0;
          participant.isLocked = user.isLocked || false;
          participant.completedQuestions = user.completedQuestions || [];
        }
      } else {
        participant = {
          id: socket.id,
          userId,
          username,
          score: user?.totalScore || 0,
          quizScore: user?.quizScore || 0,
          debugScore: user?.debugScore || 0,
          round3Score: user?.round3Score || 0,
          violations: user?.violations || 0,
          isLocked: user?.isLocked || false,
          isFullscreen: true,
          isQualified: user?.isQualified ?? true,
          currentRound: data.state.currentRound || 0,
          completedQuestions: user?.completedQuestions || [],
          isOnline: true,
        };
        data.participants.push(participant);
      }

      saveData(data);
      console.log(`[SOCKET] Participant joined. Total participants: ${data.participants.length}`);
      io.emit("participantsUpdate", data.participants);
      socket.emit("contestState", data.state);
    });

    socket.on("adminUpdateRoundDurations", ({ r1, r2, r3 }) => {
      const data = getData();
      data.state.round1Duration = r1;
      data.state.round2Duration = r2;
      data.state.round3Duration = r3;
      saveData(data);
      io.emit("contestState", data.state);
    });

    socket.on("adminUpdateQualificationSettings", ({ mode, count, round }) => {
      const data = getData();
      data.state.qualificationMode = mode;
      data.state.qualifyCount = count;
      if (round) data.state.qualificationRound = round;
      saveData(data);
      io.emit("contestState", data.state);
    });

    socket.on("adminSetManualQualification", (qualifiedUserIds: string[]) => {
      const data = getData();
      data.users.forEach((u: any) => {
        if (u.role === "user") {
          u.isQualified = qualifiedUserIds.includes(u.id);
        } else {
          u.isQualified = true;
        }
      });
      data.participants.forEach((p: any) => {
        const user = data.users.find((u: any) => u.id === p.userId);
        p.isQualified = user ? user.isQualified : false;
      });
      saveData(data);
      io.emit("participantsUpdate", data.participants);
    });

    socket.on("adminStartRound", (round: number) => {
      const data = getData();
      data.state.status = "active";
      data.state.currentRound = round;
      data.state.startTime = Date.now();

      // Qualification Logic
      if (round === data.state.qualificationRound) {
        if (data.state.qualificationMode === "all") {
          data.users.forEach((u: any) => u.isQualified = true);
          data.participants.forEach((p: any) => p.isQualified = true);
        } else if (data.state.qualificationMode === "topN") {
          const sortedUsers = [...data.users]
            .filter(u => u.role === "user")
            .sort((a: any, b: any) => {
              // Sort based on previous round's score
              if (round === 2) return b.quizScore - a.quizScore;
              if (round === 3) return (b.quizScore + b.debugScore) - (a.quizScore + a.debugScore);
              return b.totalScore - a.totalScore;
            });
          const topNIds = sortedUsers.slice(0, data.state.qualifyCount).map((u: any) => u.id);

          data.users.forEach((u: any) => {
            if (u.role === "user") {
              u.isQualified = topNIds.includes(u.id);
            } else {
              u.isQualified = true; // Admins always qualified
            }
          });
          data.participants.forEach((p: any) => {
            const user = data.users.find((u: any) => u.id === p.userId);
            p.isQualified = user ? user.isQualified : false;
          });
        } else if (data.state.qualificationMode === "manual") {
          // In manual mode, we assume isQualified is already set by adminSetManualQualification
          // We just sync participants one last time to be sure
          data.participants.forEach((p: any) => {
            const user = data.users.find((u: any) => u.id === p.userId);
            p.isQualified = user ? user.isQualified : false;
          });
        }
      }

      saveData(data);
      io.emit("contestState", data.state);
      io.emit("participantsUpdate", data.participants);
      io.emit("forceFullscreen");
    });

    socket.on("adminEndRound", () => {
      const data = getData();
      data.state.status = "waiting";
      saveData(data);
      io.emit("contestState", data.state);
      io.emit("exitFullscreen");
    });

    socket.on("submitSolution", ({ questionId, pointsEarned }) => {
      const data = getData();

      // Strict server-side check
      if (data.state.status !== "active") {
        socket.emit("error", "Round is not active. Submission rejected.");
        return;
      }

      const currentDuration = data.state.currentRound === 1 ? data.state.round1Duration :
        data.state.currentRound === 2 ? data.state.round2Duration :
          data.state.round3Duration;

      if (data.state.startTime && (Date.now() - data.state.startTime > currentDuration * 1000)) {
        data.state.status = "waiting";
        saveData(data);
        io.emit("contestState", data.state);
        io.emit("exitFullscreen");
        socket.emit("error", "Round has expired. Submission rejected.");
        return;
      }

      const participant = data.participants.find((p: any) => p.id === socket.id);
      if (participant && !participant.completedQuestions.includes(questionId)) {
        const question = data.questions.find((q: any) => q.id === questionId);
        if (!question) return;

        if (question.round === 1) {
          participant.quizScore += pointsEarned;
        } else if (question.round === 2) {
          participant.debugScore += pointsEarned;
        } else if (question.round === 3) {
          participant.round3Score = (participant.round3Score || 0) + pointsEarned;
        }
        participant.score = (participant.quizScore || 0) + (participant.debugScore || 0) + (participant.round3Score || 0);
        participant.completedQuestions.push(questionId);

        // Update persistent user data
        const user = data.users.find((u: any) => u.id === participant.userId);
        if (user) {
          if (question.round === 1) {
            user.quizScore += pointsEarned;
          } else if (question.round === 2) {
            user.debugScore += pointsEarned;
          } else if (question.round === 3) {
            user.round3Score = (user.round3Score || 0) + pointsEarned;
          }
          user.totalScore = (user.quizScore || 0) + (user.debugScore || 0) + (user.round3Score || 0);
          const round = data.state.currentRound;
          user.roundScores[round] = (user.roundScores[round] || 0) + pointsEarned;
          if (!user.completedQuestions) user.completedQuestions = [];
          user.completedQuestions.push(questionId);
        }

        saveData(data);
        io.emit("participantsUpdate", data.participants);
      }
    });

    socket.on("fullscreenExit", () => {
      const data = getData();
      const participant = data.participants.find((p: any) => p.id === socket.id);
      if (participant) {
        participant.isFullscreen = false;
        participant.violations++;

        const user = data.users.find((u: any) => u.id === participant.userId);
        if (user) {
          user.violations++;
          user.isFullscreen = false;
        }

        saveData(data);
        io.emit("participantsUpdate", data.participants);
        io.emit("adminAlert", {
          username: participant.username,
          type: "Fullscreen Exit",
          violations: participant.violations
        });
      }
    });

    socket.on("fullscreenEnter", () => {
      const data = getData();
      const participant = data.participants.find((p: any) => p.id === socket.id);
      if (participant) {
        participant.isFullscreen = true;
        const user = data.users.find((u: any) => u.id === participant.userId);
        if (user) user.isFullscreen = true;
        saveData(data);
        io.emit("participantsUpdate", data.participants);
      }
    });

    socket.on("tabSwitch", () => {
      const data = getData();
      const participant = data.participants.find((p: any) => p.id === socket.id);
      if (participant) {
        participant.violations++;

        const user = data.users.find((u: any) => u.id === participant.userId);
        if (user) {
          user.violations++;
          // NO AUTO LOCK per requirements
        }

        saveData(data);
        io.emit("participantsUpdate", data.participants);
        io.emit("adminAlert", {
          username: participant.username,
          type: "Tab Switch",
          violations: participant.violations
        });
      }
    });

    socket.on("adminResetViolations", (userId: string) => {
      const data = getData();
      const user = data.users.find((u: any) => u.id === userId);
      if (user) {
        user.violations = 0;
        const participant = data.participants.find((p: any) => p.userId === userId);
        if (participant) {
          participant.violations = 0;
        }
        saveData(data);
        io.emit("participantsUpdate", data.participants);
      }
    });

    socket.on("adminResetAllViolations", () => {
      const data = getData();
      data.users.forEach((u: any) => u.violations = 0);
      data.participants.forEach((p: any) => p.violations = 0);
      saveData(data);
      io.emit("participantsUpdate", data.participants);
    });

    socket.on("adminLockSuspicious", () => {
      const data = getData();
      data.participants.forEach((p: any) => {
        if (p.violations >= 3 && !p.isLocked) {
          p.isLocked = true;
          const user = data.users.find((u: any) => u.id === p.userId);
          if (user) user.isLocked = true;

          const targetSocket = io.sockets.sockets.get(p.id);
          if (targetSocket) {
            targetSocket.emit("error", "Your account has been locked due to multiple violations.");
          }
        }
      });
      saveData(data);
      io.emit("participantsUpdate", data.participants);
    });

    socket.on("adminLockUser", (userId: string) => {
      const data = getData();
      const user = data.users.find((u: any) => u.id === userId);
      if (user) {
        user.isLocked = true;
        const participant = data.participants.find((p: any) => p.userId === userId);
        if (participant) {
          participant.isLocked = true;
          // Find the socket and emit error
          const targetSocket = io.sockets.sockets.get(participant.id);
          if (targetSocket) {
            targetSocket.emit("error", "Your account has been locked by an administrator.");
          }
        }
        saveData(data);
        io.emit("participantsUpdate", data.participants);
      }
    });

    socket.on("adminUnlockUser", (userId: string) => {
      const data = getData();
      const user = data.users.find((u: any) => u.id === userId);
      if (user) {
        user.isLocked = false;
        const participant = data.participants.find((p: any) => p.userId === userId);
        if (participant) {
          participant.isLocked = false;
        }
        saveData(data);
        io.emit("participantsUpdate", data.participants);
      }
    });
    
    socket.on("adminDeleteParticipant", (userId: string) => {
      const data = getData();
      const pLen = data.participants.length;
      const uLen = data.users.length;
      
      const participant = data.participants.find((p: any) => p.userId === userId);
      if (participant && participant.id) {
        const targetSocket = io.sockets.sockets.get(participant.id);
        if (targetSocket) {
           targetSocket.emit("error", "Session not found");
        }
      }

      data.participants = data.participants.filter((p: any) => p.userId !== userId);
      data.users = data.users.filter((u: any) => u.id !== userId);
      
      if (data.participants.length !== pLen || data.users.length !== uLen) {
        console.log(`[ADMIN] User ${userId} (and participant entry) deleted by admin`);
        saveData(data);
        io.emit("participantsUpdate", data.participants);
      } else {
        console.warn(`[ADMIN] Delete attempted for non-existent user ${userId}`);
      }
    });

    socket.on("disconnect", () => {
      const data = getData();
      const participant = data.participants.find((p: any) => p.id === socket.id);
      if (participant) {
        participant.isOnline = false;
        participant.id = ""; // Clear socket id
        saveData(data);
        console.log(`[SOCKET] User ${participant.username} disconnected. Still in participants list.`);
        io.emit("participantsUpdate", data.participants);
      }
    });
  });

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global error:", err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(500).json({ error: "Internal server error" });
  });

  // Vite middleware
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

  httpServer.listen(8080, "0.0.0.0", () => {
    const localIP = getLocalIP();
    console.log("\n" + "=".repeat(50));
    console.log("🚀 CODE SMITH SERVER STARTED (V6 - NEW PORT)");
    console.log(`📡 Local Network Access: http://${localIP}:8080`);
    console.log(`🏠 Local Machine: http://localhost:8080`);
    console.log("=".repeat(50) + "\n");
  });

  // Auto-end round check
  setInterval(() => {
    const data = getData();
    if (data.state.status === "active" && data.state.startTime) {
      const currentDuration = data.state.currentRound === 1 ? data.state.round1Duration :
        data.state.currentRound === 2 ? data.state.round2Duration :
          data.state.round3Duration;
      if (Date.now() - data.state.startTime > currentDuration * 1000) {
        console.log(`[CONTEST] Round ${data.state.currentRound} auto-ended due to time limit.`);
        data.state.status = "waiting";
        saveData(data);
        io.emit("contestState", data.state);
        io.emit("exitFullscreen");
      }
    }
  }, 5000);
}

startServer();
