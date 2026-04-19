export interface Question {
  id: string;
  round: 1 | 2 | 3;
  type: "mcq" | "debug" | "code-completion" | "logic-completion";
  title: string;
  description: string;
  options?: string[]; // For mcq
  answer?: string; // For mcq
  buggyCode?: string; // For debug
  starterCode?: string; // For code-completion and logic-completion
  correctPatterns?: string[]; // For debug and code-completion
  correctAnswers?: string[]; // For logic-completion
  expectedOutput?: string; // For debug
  testInput?: string;
  points: number;
  bonusPoints?: number;
  bonusDuration?: number;
  duration?: number;
  maxAttempts?: number;
  language?: string;
}

export interface User {
  id: string;
  username: string;
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

export interface Participant {
  id: string;
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

export interface ContestState {
  status: "waiting" | "active" | "ended";
  currentRound: number;
  startTime: number | null;
  round1Duration: number;
  round2Duration: number;
  round3Duration: number;
  qualificationMode: "all" | "topN" | "manual";
  qualifyCount: number;
  qualificationRound: 2 | 3; // Which round we are qualifying for
  instanceId?: string;
  appUrl?: string;
  currentQuestionIndex?: number;
  countdown?: number;
}
