import React, { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { Question, ContestState, Participant } from "../types";
import socket from "../lib/socket";
import { Play, Send, Clock, AlertCircle, CheckCircle2, LogOut, Loader2, SkipForward, RefreshCw, Trophy, Code } from "lucide-react";
import Modal from "./Modal";
import WaitingRoom from "./WaitingRoom";


export default function UserPanel({ username, userId, contestState, participants, questions }: { username: string, userId: string, contestState: ContestState, participants: Participant[], questions: Question[] }) {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean, title: string, message: string }>({
    isOpen: false,
    title: "",
    message: ""
  });

  const handleLogout = () => {
    localStorage.removeItem("contest_user");
    window.location.reload();
  };

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [code, setCode] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("javascript");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [logicAnswers, setLogicAnswers] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [quizTimeLeft, setQuizTimeLeft] = useState(20);
  const [roundTimeLeft, setRoundTimeLeft] = useState(300);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{ output: string, error: string | null } | null>(null);
  const [validationResult, setValidationResult] = useState<{ passed: boolean, pointsEarned: number } | null>(null);
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(false);
  const [isConsoleVisible, setIsConsoleVisible] = useState(true);
  const hasInitializedIndex = useRef(false);

  const roundQuestions = questions.filter(q => q.round === contestState.currentRound);
  const currentQ = roundQuestions[currentQuestionIndex] || roundQuestions[0];

  const participant = participants.find(p => p.userId === userId);
  const allSolved = roundQuestions.length > 0 && roundQuestions.every(q => 
    participant?.completedQuestions.includes(q.id)
  );

  useEffect(() => {
    const preventDefault = (e: any) => e.preventDefault();
    document.addEventListener("contextmenu", preventDefault);
    document.addEventListener("copy", preventDefault);
    document.addEventListener("cut", preventDefault);
    document.addEventListener("paste", preventDefault);

    const handleVisibilityChange = () => {
      if (document.hidden && contestState?.status === "active") {
        socket.emit("tabSwitch", { userId });
        setAlertModal({
          isOpen: true,
          title: "⚠ Warning",
          message: "Tab switch detected! This is being monitored."
        });
      }
    };

    const handleBlur = () => {
      if (contestState?.status === "active") {
        socket.emit("tabSwitch", { userId });
        setAlertModal({
          isOpen: true,
          title: "⚠ Warning",
          message: "Tab switch detected! This is being monitored."
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    const enterFullscreen = async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
          socket.emit("fullscreenEnter");
          setAlertModal({ isOpen: false, title: "", message: "" });
        }
      } catch (err) {
        console.error("Fullscreen request failed:", err);
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && contestState?.status === "active") {
        setIsFullscreen(false);
        socket.emit("fullscreenExit", { userId });
        setAlertModal({
          isOpen: true,
          title: "⚠ Warning",
          message: "Fullscreen exited! This is monitored. Please re-enter fullscreen to continue."
        });
      } else if (document.fullscreenElement) {
        setIsFullscreen(true);
        socket.emit("fullscreenEnter");
      }
    };

    const onForceFullscreen = () => {
      setAlertModal({
        isOpen: true,
        title: "🔒 Fullscreen Mode",
        message: "Round starting. Fullscreen mode enabled. Do not exit."
      });
      enterFullscreen();
    };

    const onExitFullscreen = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(console.error);
      }
    };

    socket.on("forceFullscreen", onForceFullscreen);
    socket.on("exitFullscreen", onExitFullscreen);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    // Initial check
    if (contestState?.status === "active" && !document.fullscreenElement) {
      setIsFullscreen(false);
      socket.emit("fullscreenExit", { userId });
      setAlertModal({
        isOpen: true,
        title: "🔒 Fullscreen Required",
        message: "The contest is active. You must be in fullscreen mode to participate."
      });
    }

    return () => {
      document.removeEventListener("contextmenu", preventDefault);
      document.removeEventListener("copy", preventDefault);
      document.removeEventListener("cut", preventDefault);
      document.removeEventListener("paste", preventDefault);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      socket.off("forceFullscreen", onForceFullscreen);
      socket.off("exitFullscreen", onExitFullscreen);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [contestState?.status, userId]);

  useEffect(() => {
    setCurrentQuestionIndex(0);
    hasInitializedIndex.current = false;
  }, [contestState.currentRound]);

  useEffect(() => {
    if (roundQuestions.length > 0 && participant && !hasInitializedIndex.current) {
      const firstUnsolvedIndex = roundQuestions.findIndex(q => !participant.completedQuestions.includes(q.id));
      if (firstUnsolvedIndex !== -1) {
        setCurrentQuestionIndex(firstUnsolvedIndex);
        hasInitializedIndex.current = true;
      }
    }
  }, [questions, participants, contestState.currentRound, participant]);

  useEffect(() => {
    if (currentQ) {
      const participant = participants.find(p => p.userId === userId);
      const isSolved = participant?.completedQuestions.includes(currentQ.id) || false;
      
      setHasSubmitted(isSolved);
      setValidationResult(isSolved ? { passed: true, pointsEarned: currentQ.points } : null);
    }
  }, [currentQ?.id, participants]);

  useEffect(() => {
    if (currentQ) {
      const isLogicCompletion = currentQ.type === "logic-completion" || (currentQ.round === 3 && /\[BLANK\]/i.test(currentQ.starterCode || ""));
      if (currentQ.type === "debug") {
        setCode(currentQ.buggyCode || "");
        setSelectedLanguage(currentQ.language || "javascript");
      } else if (currentQ.type === "code-completion" && !isLogicCompletion) {
        setCode(currentQ.starterCode || "");
        setSelectedLanguage(currentQ.language || "javascript");
      } else if (isLogicCompletion) {
        // Enforce the object type so rendering functions correctly rely on it
        currentQ.type = "logic-completion";
        const blankCount = (currentQ.starterCode?.match(/\[BLANK\]/ig) || []).length;
        setLogicAnswers(new Array(blankCount).fill(""));
      } else {
        setSelectedOption(null);
        setQuizTimeLeft(currentQ.duration || 30);
      }
      
      setExecutionResult(null);
      setAttempts(0);
      setTimeLeft(currentQ.bonusDuration || 30);
      setQuestionStartTime(Date.now());
    }
  }, [currentQ?.id]);

  useEffect(() => {
    if (contestState?.status === "active" && contestState.startTime) {
      const interval = setInterval(() => {
        const now = Date.now();
        const elapsedRound = Math.floor((now - contestState.startTime!) / 1000);
        const totalRoundDuration = contestState.currentRound === 1 ? contestState.round1Duration : 
                             contestState.currentRound === 2 ? contestState.round2Duration : 
                             contestState.round3Duration;
        const remainingRound = Math.max(0, totalRoundDuration - elapsedRound);
        setRoundTimeLeft(remainingRound);

        if (currentQ && !hasSubmitted) {
          const elapsedQuestion = Math.floor((now - questionStartTime) / 1000);
          
          // Bonus Timer
          const bonusDuration = currentQ.bonusDuration || 30;
          const remainingBonus = Math.max(0, bonusDuration - elapsedQuestion);
          setTimeLeft(Math.min(remainingBonus, remainingRound));

          // Quiz Timer (MCQ)
          if (currentQ.type === "mcq") {
            const qDuration = currentQ.duration || 30;
            const remainingQuiz = Math.max(0, qDuration - elapsedQuestion);
            setQuizTimeLeft(Math.min(remainingQuiz, remainingRound));
          }
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [contestState?.status, contestState?.startTime, contestState?.currentRound, contestState?.round1Duration, contestState?.round2Duration, currentQ, hasSubmitted, questionStartTime]);

  useEffect(() => {
    if (quizTimeLeft === 0 && !hasSubmitted && currentQ?.type === "mcq" && contestState?.status === "active") {
      // Force submit if an option is selected, otherwise just move to next
      if (selectedOption) {
        handleQuizSubmit();
      } else {
        setHasSubmitted(true);
        setValidationResult({ passed: false, pointsEarned: 0 });
        setTimeout(nextQuestion, 2000);
      }
    }
  }, [quizTimeLeft, hasSubmitted, currentQ?.type, contestState?.status, selectedOption]);

  if (roundQuestions.length === 0) {
    return (
      <div className="h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-blue-500" size={48} />
          <p className="text-gray-400 animate-pulse">Preparing Round {contestState.currentRound} questions...</p>
        </div>
      </div>
    );
  }

  if (!currentQ) {
    return (
      <div className="h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-blue-500" size={48} />
          <p className="text-gray-400 animate-pulse">Loading question...</p>
        </div>
      </div>
    );
  }

  const handleQuizSubmit = () => {
    if (!currentQ || !selectedOption || hasSubmitted) return;
    
    const isCorrect = selectedOption === currentQ.answer;
    let pointsEarned = isCorrect ? currentQ.points : 0;
    
    if (isCorrect && currentQ.bonusPoints && currentQ.bonusDuration) {
      const timeTaken = Math.floor((Date.now() - questionStartTime) / 1000);
      if (timeTaken <= currentQ.bonusDuration) {
        pointsEarned += currentQ.bonusPoints;
      }
    }
    
    socket.emit("submitSolution", {
      questionId: currentQ.id,
      pointsEarned,
    });
    
    setHasSubmitted(true);
    setValidationResult({ passed: isCorrect, pointsEarned });
    
    if (isCorrect) {
      setAlertModal({
        isOpen: true,
        title: "Correct!",
        message: `You earned ${pointsEarned} points.`
      });
    } else {
      setAlertModal({
        isOpen: true,
        title: "Wrong Answer",
        message: `The correct answer was: ${currentQ.answer}`
      });
    }

    // Auto move to next question after a short delay
    setTimeout(() => {
      setAlertModal(prev => ({ ...prev, isOpen: false }));
      nextQuestion();
    }, 2000);
  };

  const handleLogicSubmit = async () => {
    if (!currentQ || hasSubmitted || isValidating) return;

    setIsValidating(true);
    const timeTaken = Math.floor((Date.now() - questionStartTime) / 1000);

    const isCorrect = currentQ.correctAnswers?.every((ans, i) => 
      (logicAnswers[i] || "").trim() === (ans || "").trim()
    );

    let pointsEarned = 0;
    if (isCorrect) {
      pointsEarned = currentQ.points;
      if (timeTaken <= (currentQ.bonusDuration || 30)) {
        pointsEarned += (currentQ.bonusPoints || 0);
      }
      
      fetch("/api/log-submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          username,
          round: contestState.currentRound,
          questionId: currentQ.id,
          code: currentQ.starterCode ? currentQ.starterCode.split(/\[BLANK\]/i).reduce((acc, part, i) => acc + part + (logicAnswers[i] || ""), "") : logicAnswers.join(", "),
          output: "",
          expectedOutput: currentQ.correctAnswers?.join(", ") || "",
          status: "correct",
          attemptCount: attempts + 1
        })
      }).catch(console.error);
      
      socket.emit("submitSolution", {
        questionId: currentQ.id,
        pointsEarned,
      });
      setHasSubmitted(true);
      setValidationResult({ passed: true, pointsEarned });
      setAlertModal({
        isOpen: true,
        title: "Correct! ✅",
        message: `Well done! You earned ${pointsEarned} points.`
      });
    } else {
      setAlertModal({
        isOpen: true,
        title: "Incorrect ❌",
        message: "Some of your answers are incorrect. Please try again."
      });

      fetch("/api/log-submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          username,
          round: contestState.currentRound,
          questionId: currentQ.id,
          code: currentQ.starterCode ? currentQ.starterCode.split(/\[BLANK\]/i).reduce((acc, part, i) => acc + part + (logicAnswers[i] || ""), "") : logicAnswers.join(", "),
          output: "Wrong Answer",
          expectedOutput: currentQ.correctAnswers?.join(", ") || "",
          status: "wrong",
          attemptCount: attempts + 1
        })
      }).catch(console.error);
      
      setAttempts(prev => prev + 1); // Logic questions attempt count increase
    }
    setIsValidating(false);
  };

  const renderOutputConsole = () => {
    if (currentQ.type === "mcq" || !isConsoleVisible) return null;
    
    return (
      <div className="h-48 md:h-64 bg-[#0a0a0a] border-t border-white/10 flex flex-col shrink-0">
        <div className="px-4 py-2 bg-[#1a1a1a] border-b border-white/5 flex justify-between items-center">
          <div className="flex gap-4">
            <span className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Output Console</span>
            {currentQ.expectedOutput && (
              <span className="text-[10px] uppercase font-bold text-blue-500/50 tracking-widest hidden md:inline">Validation Mode: Expected Output</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {executionResult && (
              <button 
                onClick={() => setExecutionResult(null)}
                className="text-[10px] text-gray-500 hover:text-white transition"
              >
                Clear
              </button>
            )}
            <button 
              onClick={() => setIsConsoleVisible(false)}
              className="text-[10px] text-gray-500 hover:text-white transition"
            >
              Hide
            </button>
          </div>
        </div>
        <div className="flex-1 p-4 font-mono text-sm overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase font-bold text-gray-600 tracking-widest mb-2">Actual Output</h4>
            {isExecuting || isValidating ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs">Executing code...</span>
              </div>
            ) : executionResult ? (
              <div className="space-y-2">
                {executionResult.output && (
                  <div className="text-gray-300 whitespace-pre-wrap bg-white/5 p-3 rounded-lg border border-white/5 text-xs">{executionResult.output}</div>
                )}
                {executionResult.error && (
                  <div className="text-red-400 whitespace-pre-wrap bg-red-500/5 p-3 rounded-lg border border-red-500/10 text-xs">
                    <span className="font-bold">Error:</span> {executionResult.error}
                  </div>
                )}
                {!executionResult.output && !executionResult.error && (
                  <div className="text-gray-500 italic p-3 text-xs">Program finished with no output.</div>
                )}
              </div>
            ) : (
              <div className="text-gray-600 italic p-3 text-xs">Click "Run Code" or "Submit" to see output here.</div>
            )}
          </div>

          {currentQ.expectedOutput && (
            <div className="space-y-2 border-l border-white/5 pl-4">
              <h4 className="text-[10px] uppercase font-bold text-blue-500/50 tracking-widest mb-2">Expected Output</h4>
              <div className="text-blue-400/50 whitespace-pre-wrap bg-blue-500/5 p-3 rounded-lg border border-blue-500/10 text-xs">
                {currentQ.expectedOutput}
              </div>
              {executionResult && !executionResult.error && (
                <div className={`text-[10px] font-bold uppercase mt-2 ${
                  (executionResult.output || "").trim() === (currentQ.expectedOutput || "").trim() 
                    ? "text-green-500" 
                    : "text-red-500"
                }`}>
                  { (executionResult.output || "").trim() === (currentQ.expectedOutput || "").trim() 
                    ? "✓ Match" 
                    : "✗ Mismatch"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderLogicCompletion = () => {
    if (!currentQ || !currentQ.starterCode) return null;
    const parts = currentQ.starterCode.split(/\[BLANK\]/i);
    return (
      <pre className={`font-mono text-lg leading-relaxed bg-black/40 p-8 rounded-2xl border border-white/5 overflow-x-auto ${contestState.currentRound === 2 ? "select-none" : ""}`}>
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            <span className="text-blue-300">{part}</span>
            {i < parts.length - 1 && (
              <input
                type="text"
                value={logicAnswers[i] || ""}
                onChange={(e) => {
                  const newAnswers = [...logicAnswers];
                  newAnswers[i] = e.target.value;
                  setLogicAnswers(newAnswers);
                }}
                disabled={hasSubmitted}
                className={`mx-1 px-2 py-0.5 rounded border-b-2 transition-all outline-none w-24 text-center font-bold ${
                  hasSubmitted 
                    ? "bg-green-500/20 border-green-500 text-green-400" 
                    : "bg-white/5 border-blue-500/50 focus:border-blue-400 focus:bg-white/10 text-white"
                }`}
                placeholder="..."
              />
            )}
          </React.Fragment>
        ))}
      </pre>
    );
  };

  const nextQuestion = () => {
    setCurrentQuestionIndex(prev => {
      if (prev < roundQuestions.length - 1) {
        return prev + 1;
      }
      return prev;
    });
  };

  const isLastQuestion = roundQuestions.length > 0 && currentQuestionIndex === roundQuestions.length - 1;

  const runCode = async () => {
    if (!currentQ || isExecuting) return;
    
    setIsExecuting(true);
    setExecutionResult(null);
    
    let codeToRun = code;
    if (currentQ.type === "logic-completion") {
      const parts = currentQ.starterCode.split(/\[BLANK\]/i);
      codeToRun = parts.reduce((acc, part, i) => {
        return acc + part + (logicAnswers[i] || "");
      }, "");
    }
    
    try {
      const data = await fetchJson("/api/round2/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeToRun,
          questionId: currentQ.id,
          isSubmit: false
        }),
      });

      setExecutionResult({ output: data.output, error: data.error });
    } catch (err: any) {
      console.error(err);
      setExecutionResult({ output: "", error: `Error: ${err.message}` });
    } finally {
      setIsExecuting(false);
    }
  };

  const fetchJson = async (url: string, options?: RequestInit) => {
    try {
      const res = await fetch(url, options);
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Server error: ${res.status}`);
        }
        return data;
      } else {
        const text = await res.text();
        if (!res.ok) {
          throw new Error(`Server error: ${res.status}. ${text.slice(0, 100)}`);
        }
        return text;
      }
    } catch (err: any) {
      console.error(`Fetch error for ${url}:`, err);
      throw err;
    }
  };

  const validateCode = async () => {
    if (!currentQ) return;
    const maxAttempts = currentQ?.maxAttempts || 3;
    if (attempts >= maxAttempts || hasSubmitted) return;
    
    const timeTaken = Math.floor((Date.now() - questionStartTime) / 1000);
    
    setIsValidating(true);
    setExecutionResult(null);

    let codeToRun = code;
    if (currentQ.type === "logic-completion") {
      const parts = currentQ.starterCode.split(/\[BLANK\]/i);
      codeToRun = parts.reduce((acc, part, i) => {
        return acc + part + (logicAnswers[i] || "");
      }, "");
    }

    try {
      // For Round 2 or questions with expectedOutput, use the execution endpoint
      if (contestState.currentRound === 2 || currentQ.expectedOutput) {
        const data = await fetchJson("/api/round2/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: codeToRun,
            language: currentQ.language || "javascript",
            questionId: currentQ.id,
            isSubmit: true,
            logicAnswers: currentQ.type === "logic-completion" ? logicAnswers : undefined
          }),
        });

        setExecutionResult({ output: data.output, error: data.error });
        
        if (data.success) {
          let pointsEarned = currentQ.points;
          const bonusDuration = currentQ.bonusDuration || 30;
          const bonusPoints = currentQ.bonusPoints || 0;
          if (timeTaken > 0 && timeTaken <= bonusDuration) {
            pointsEarned += bonusPoints;
          }

          fetch("/api/log-submission", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              username,
              round: contestState.currentRound,
              questionId: currentQ.id,
              code: codeToRun,
              output: data.output || "Success",
              expectedOutput: currentQ.expectedOutput || "",
              status: "correct",
              attemptCount: attempts + 1
            })
          }).catch(console.error);

          setValidationResult({ passed: true, pointsEarned });
          socket.emit("submitSolution", {
            questionId: currentQ.id,
            pointsEarned: pointsEarned,
          });
          setHasSubmitted(true);
          
          setAlertModal({
            isOpen: true,
            title: "Success",
            message: "Correct! Code executed and output matched."
          });
          
          setTimeout(() => {
            setAlertModal(prev => ({ ...prev, isOpen: false }));
            if (!isLastQuestion) {
              nextQuestion();
            }
          }, 2000);
        } else {
          const newAttempts = attempts + 1;
          setAttempts(newAttempts);
          const maxAttempts = currentQ?.maxAttempts || 3;
          setValidationResult({ passed: false, pointsEarned: 0 });

          fetch("/api/log-submission", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              username,
              round: contestState.currentRound,
              questionId: currentQ.id,
              code: codeToRun,
              output: data.error || data.output || "Wrong Answer",
              expectedOutput: currentQ.expectedOutput || "",
              status: "wrong",
              attemptCount: newAttempts
            })
          }).catch(console.error);
          
          if (newAttempts >= maxAttempts) {
            // Three strikes rule: allocate zero points and move to next
            socket.emit("submitSolution", {
              questionId: currentQ.id,
              pointsEarned: 0,
            });
            setHasSubmitted(true);
            
            setAlertModal({
              isOpen: true,
              title: "Attempts Exhausted",
              message: "You've used all attempts. Moving to next question with 0 points."
            });

            setTimeout(() => {
              setAlertModal(prev => ({ ...prev, isOpen: false }));
              if (!isLastQuestion) {
                nextQuestion();
              }
            }, 2000);
          } else {
            setAlertModal({
              isOpen: true,
              title: "Failed",
              message: data.error ? `Error: ${data.error}` : "Output did not match expected output."
            });
          }
        }
        return;
      }

      // Original validation for other rounds (Round 3 code completion etc)
      const data = await fetchJson("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeToRun,
          questionId: currentQ.id,
          timeTaken,
          language: currentQ.language || "javascript",
        }),
      });

      setValidationResult(data);
      
      if (data.passed) {
        fetch("/api/log-submission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            username,
            round: contestState.currentRound,
            questionId: currentQ.id,
            code: codeToRun,
            output: "Passed pattern matching / logic execution",
            expectedOutput: currentQ.correctPatterns ? currentQ.correctPatterns.join(" | ") : "",
            status: "correct",
            attemptCount: attempts + 1
          })
        }).catch(console.error);

        socket.emit("submitSolution", {
          questionId: currentQ.id,
          pointsEarned: data.pointsEarned,
        });
        setHasSubmitted(true);
        
        setAlertModal({
          isOpen: true,
          title: "Success",
          message: "Compiled Successfully"
        });
        
        setTimeout(() => {
          setAlertModal(prev => ({ ...prev, isOpen: false }));
          if (!isLastQuestion) {
            nextQuestion();
          }
        }, 2000);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        const maxAttempts = currentQ?.maxAttempts || 3;

        fetch("/api/log-submission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            username,
            round: contestState.currentRound,
            questionId: currentQ.id,
            code: codeToRun,
            output: "Failed pattern matching / logic execution",
            expectedOutput: currentQ.correctPatterns ? currentQ.correctPatterns.join(" | ") : "",
            status: "wrong",
            attemptCount: newAttempts
          })
        }).catch(console.error);
        
        if (newAttempts >= maxAttempts) {
          // Three strikes rule: allocate zero points and move to next
          socket.emit("submitSolution", {
            questionId: currentQ.id,
            pointsEarned: 0,
          });
          setHasSubmitted(true);
          
          setAlertModal({
            isOpen: true,
            title: "Attempts Exhausted",
            message: "You've used all attempts. Moving to next question with 0 points."
          });

          setTimeout(() => {
            setAlertModal(prev => ({ ...prev, isOpen: false }));
            if (!isLastQuestion) {
              nextQuestion();
            }
          }, 2000);
        } else {
          setAlertModal({
            isOpen: true,
            title: "Failed",
            message: "Compilation Failed"
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      setExecutionResult({ output: "", error: `Error: ${err.message}` });
      setAlertModal({
        isOpen: true,
        title: "Error",
        message: err.message
      });
    } finally {
      setIsValidating(false);
    }
  };

  const isCurrentDone = hasSubmitted || attempts >= (currentQ?.maxAttempts || 3);
  const isFinished = (isLastQuestion && isCurrentDone) || (contestState?.status === "active" && roundTimeLeft === 0);

  if (participant?.isLocked) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-red-500 space-y-4 p-6">
        <div className="p-4 bg-red-500/10 rounded-full text-red-500 animate-pulse">
          <AlertCircle size={64} />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-white">Access Restricted</h2>
          <p className="max-w-md mx-auto text-gray-400">🚫 You have been locked by admin due to suspicious activity. Please contact the event organizers.</p>
        </div>
        <button
          onClick={handleLogout}
          className="mt-8 flex items-center gap-2 bg-white/5 hover:bg-white/10 text-gray-400 px-6 py-2 rounded-xl transition border border-white/10 font-bold"
        >
          <LogOut size={18} /> Logout
        </button>
      </div>
    );
  }

  if (contestState?.status === "active") {
    if (roundQuestions.length === 0 && contestState.currentRound !== 3) {
      return (
        <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-gray-500 space-y-4 p-6">
          <div className="p-4 bg-orange-500/10 rounded-full text-orange-500">
            <AlertCircle size={48} />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white">No Questions for Round {contestState.currentRound}</h2>
            <p className="max-w-xs mx-auto">The administrator hasn't added any questions for this round yet. Please wait or contact the admin.</p>
          </div>
          <button
            onClick={handleLogout}
            className="mt-8 flex items-center gap-2 bg-white/5 hover:bg-white/10 text-gray-400 px-6 py-2 rounded-xl transition border border-white/10 font-bold"
          >
            <LogOut size={18} /> Logout
          </button>
        </div>
      );
    }

    if (isFinished) {
      return (
        <div className="h-screen bg-[#0a0a0a] flex flex-col">
          <div className={`${roundTimeLeft === 0 ? "bg-red-600/10 border-red-500/20" : "bg-blue-600/10 border-blue-500/20"} border-b p-3 text-center transition-colors duration-500`}>
            <p className={`${roundTimeLeft === 0 ? "text-red-400" : "text-blue-400"} text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2`}>
              {roundTimeLeft === 0 ? <Clock size={14} /> : <Trophy size={14} />}
              {roundTimeLeft === 0 ? "Time's Up! " : ""}Round {contestState.currentRound} Complete! Check your standing on the leaderboard.
            </p>
          </div>
          <div className="flex-1 overflow-hidden">
            <WaitingRoom 
              participants={participants} 
              username={username} 
              userId={userId} 
              socketConnected={socket.connected} 
              instanceId={contestState.instanceId || null} 
            />
          </div>
        </div>
      );
    }

    if (!currentQ) {
      return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-gray-500">
          <Loader2 size={32} className="animate-spin" />
        </div>
      );
    }

    const isQualified = participant?.isQualified ?? true;

    if (contestState.currentRound === 2 && !isQualified) {
      return (
        <div className="h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#1a1a1a] p-8 rounded-2xl border border-white/10 text-center space-y-6">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="text-red-500" size={40} />
            </div>
            <h1 className="text-2xl font-bold">Not Qualified</h1>
            <p className="text-gray-400">
              We're sorry, but you have not qualified for Round 2 based on your performance in the Quiz Round.
            </p>
            <div className="pt-4">
              <button
                onClick={handleLogout}
                className="w-full bg-white/5 hover:bg-white/10 py-3 rounded-xl font-bold transition flex items-center justify-center gap-2"
              >
                <LogOut size={18} /> Logout
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (contestState.currentRound === 3 && currentQ.type !== "logic-completion") {
      // Fallback if round 3 is active but question type is not logic-completion
      // This might happen during migration or if admin adds other types to R3
    }

    return (
      <div className="h-screen bg-[#0a0a0a] text-white flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#1a1a1a] border-b border-white/10 p-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-blue-500 tracking-widest">Round {contestState.currentRound}</span>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{currentQ.title}</h2>
                {contestState.instanceId && (
                  <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-gray-500 font-mono">
                    Room: {contestState.instanceId}
                  </span>
                )}
              </div>
            </div>
              {currentQ.type !== "mcq" && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-blue-600/10 border border-blue-500/20 rounded-lg px-3 py-1.5">
                    <Code size={14} className="text-blue-400" />
                    <span className="bg-transparent text-xs font-bold text-blue-400 uppercase tracking-widest outline-none">
                      Language: {currentQ.language || "javascript"}
                    </span>
                  </div>
                </div>
              )}
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase font-bold text-green-500 tracking-widest">Total Score</span>
                <div className="flex items-center gap-2 text-green-400">
                  <Trophy size={18} />
                  <span className="font-mono text-lg text-white">
                    {(participant?.quizScore || 0) + (participant?.debugScore || 0) + (participant?.round3Score || 0)}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase font-bold text-blue-500 tracking-widest">Round Time</span>
                <div className="flex items-center gap-2 text-blue-400">
                  <Clock size={18} className={roundTimeLeft <= 60 ? "text-red-500 animate-pulse" : ""} />
                  <span className={`font-mono text-lg ${roundTimeLeft <= 60 ? "text-red-500" : "text-white"}`}>
                    {Math.floor(roundTimeLeft / 60)}:{(roundTimeLeft % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              </div>
              {currentQ.type !== "mcq" ? (
                <>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">
                      {contestState.currentRound === 2 ? "Attempts Left" : "Attempts"}
                    </span>
                    <span className={`font-mono text-lg ${attempts >= (currentQ?.maxAttempts || 3) - 1 ? "text-red-500" : "text-white"}`}>
                      {contestState.currentRound === 2 
                        ? Math.max(0, (currentQ?.maxAttempts || 3) - attempts) 
                        : `${attempts}/${currentQ?.maxAttempts || 3}`}
                    </span>
                  </div>
                  {currentQ.bonusPoints && currentQ.bonusPoints > 0 && (
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Bonus (+{currentQ.bonusPoints} pts)</span>
                      <div className="flex items-center gap-2 text-gray-400">
                        <Clock size={18} className={timeLeft <= 10 ? "text-orange-500 animate-pulse" : ""} />
                        <span className={`font-mono text-lg ${timeLeft <= 10 ? "text-orange-500" : "text-white"}`}>{timeLeft}s</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase font-bold text-orange-500 tracking-widest">Quiz Timer</span>
                    <div className="flex items-center gap-2 text-orange-400">
                      <Clock size={18} className={quizTimeLeft <= 5 ? "text-red-500 animate-pulse" : ""} />
                      <span className={`font-mono text-lg ${quizTimeLeft <= 5 ? "text-red-500" : "text-white"}`}>{quizTimeLeft}s</span>
                    </div>
                  </div>
                  {currentQ.bonusPoints && currentQ.bonusPoints > 0 && (
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Bonus (+{currentQ.bonusPoints} pts)</span>
                      <div className="flex items-center gap-2 text-gray-400">
                        <Clock size={18} className={timeLeft <= 10 ? "text-orange-500 animate-pulse" : ""} />
                        <span className={`font-mono text-lg ${timeLeft <= 10 ? "text-orange-500" : "text-white"}`}>{timeLeft}s</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowLogoutModal(true)}
                className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 px-4 py-2 rounded-lg transition border border-red-500/30"
              >
                <LogOut size={18} />
              </button>
              {currentQ.type !== "mcq" ? (
                <div className="flex gap-2">
                  {contestState.currentRound !== 2 && contestState.currentRound !== 3 && currentQ.type !== "logic-completion" && (
                    <button
                      onClick={runCode}
                      disabled={isExecuting || isValidating}
                      className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded-lg transition disabled:opacity-50 font-bold"
                    >
                      {isExecuting ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                      Run Code
                    </button>
                  )}
                  <button
                    onClick={validateCode}
                    disabled={isValidating || isExecuting || hasSubmitted || attempts >= (currentQ?.maxAttempts || 3)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition disabled:opacity-50 font-bold"
                  >
                    {isValidating ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    {hasSubmitted ? "Solved" : (contestState.currentRound === 2 || contestState.currentRound === 3 || currentQ.type === "logic-completion" ? "Run & Submit" : "Submit")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleQuizSubmit}
                  disabled={!selectedOption || hasSubmitted}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition disabled:opacity-50 font-bold"
                >
                  <Send size={18} />
                  {hasSubmitted ? "Submitted" : "Submit Answer"}
                </button>
              )}
              {hasSubmitted && !isLastQuestion && (
                <button
                  onClick={nextQuestion}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-6 py-2 rounded-lg transition font-bold"
                >
                  Next Question <SkipForward size={18} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {currentQ.type === "logic-completion" ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 p-8 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-8">
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Task Description</h3>
                    <p className={`text-xl text-gray-200 leading-relaxed ${contestState.currentRound === 2 ? "select-none" : ""}`}>{currentQ.description}</p>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Code Snippet</h3>
                    {renderLogicCompletion()}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8">
                    <div className="p-6 bg-purple-600/5 rounded-2xl border border-purple-500/20 space-y-3">
                      <h4 className="text-purple-400 font-bold text-xs uppercase tracking-widest">Scoring Details</h4>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Base Points</span>
                        <span className="text-white font-mono">{currentQ.points}</span>
                      </div>
                      {currentQ.bonusPoints && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Time Bonus (within {currentQ.bonusDuration}s)</span>
                          <span className="text-green-400 font-mono">+{currentQ.bonusPoints}</span>
                        </div>
                      )}
                    </div>

                    {hasSubmitted && (
                      <div className="p-6 bg-green-600/10 rounded-2xl border border-green-500/30 flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center text-green-500">
                          <CheckCircle2 size={24} />
                        </div>
                        <div>
                          <p className="text-green-400 font-bold">Task Completed!</p>
                          <p className="text-gray-400 text-sm">You've successfully filled in the logic.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {renderOutputConsole()}
            </div>
          ) : (
            <>
              {/* Question Details */}
              <div className={`${currentQ.type === "mcq" ? "w-full" : "w-full lg:w-96"} bg-[#111] border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col ${isDetailsCollapsed ? "h-12" : "h-1/3 lg:h-full"} transition-all duration-300 relative`}>
                <button 
                  onClick={() => setIsDetailsCollapsed(!isDetailsCollapsed)}
                  className="lg:hidden absolute top-3 right-4 text-gray-500 hover:text-white z-10"
                >
                  {isDetailsCollapsed ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                </button>
                
                <div className={`p-6 space-y-6 overflow-y-auto max-w-4xl mx-auto w-full flex-1 ${isDetailsCollapsed ? "hidden lg:block" : ""}`}>
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                      {currentQ.type === "mcq" ? "Question" : "Task Description"}
                    </h3>
                    <p className={`text-white text-xl font-medium leading-relaxed whitespace-pre-wrap ${contestState.currentRound === 2 ? "select-none" : ""}`}>{currentQ.description}</p>
                  </div>
                  
                  {currentQ.type === "mcq" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                      {currentQ.options?.map((option, idx) => (
                        <button
                          key={idx}
                          onClick={() => !hasSubmitted && setSelectedOption(option)}
                          className={`p-6 rounded-2xl border-2 text-left transition-all text-lg font-medium ${
                            selectedOption === option 
                              ? "bg-blue-600/20 border-blue-500 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.2)]" 
                              : "bg-white/5 border-white/10 hover:border-white/20 text-gray-300"
                          } ${hasSubmitted ? "cursor-not-allowed opacity-80" : ""}`}
                        >
                          <div className="flex items-start gap-4">
                            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm shrink-0 mt-1 ${
                              selectedOption === option ? "border-blue-500 bg-blue-500 text-white" : "border-white/20"
                            }`}>
                              {String.fromCharCode(65 + idx)}
                            </div>
                            <span className="whitespace-pre-wrap">{option}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="p-4 bg-blue-600/10 rounded-xl border border-blue-500/20 space-y-2 max-w-xs">
                    <h4 className="text-blue-400 font-bold text-xs uppercase tracking-widest">Scoring</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Base Points</span>
                      <span className="text-white font-mono">{currentQ.points}</span>
                    </div>
                    {currentQ.type !== "mcq" && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Time Bonus (+30s)</span>
                        <span className="text-green-400 font-mono">+30</span>
                      </div>
                    )}
                  </div>

                  {validationResult && !validationResult.passed && (
                    <div className="bg-red-900/20 border border-red-500/50 p-4 rounded-xl flex items-start gap-3 max-w-md">
                      <AlertCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-red-400 font-bold text-sm">Incorrect</p>
                        <p className="text-red-300/70 text-xs">
                          {currentQ.type === "mcq" ? "That was not the correct answer." : "Your code doesn't meet the logic requirements. Try again!"}
                        </p>
                      </div>
                    </div>
                  )}

                  {hasSubmitted && validationResult?.passed && (
                    <div className="bg-green-900/20 border border-green-500/50 p-4 rounded-xl flex items-start gap-3 max-w-md">
                      <CheckCircle2 size={20} className="text-green-500 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-green-400 font-bold text-sm">Correct!</p>
                        <p className="text-green-300/70 text-xs">Earned {validationResult?.pointsEarned} points.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Editor - For debug and code-completion */}
              {currentQ.type !== "mcq" && (
                <div className="flex-1 flex flex-col relative">
                  <div className="flex-1 relative">
                    <Editor
                      height="100%"
                      theme="vs-dark"
                      language={currentQ.language || "javascript"}
                      value={code}
                      onChange={(val) => setCode(val || "")}
                      onMount={(editor, monaco) => {
                        if (contestState.currentRound === 2) {
                          editor.onKeyDown((e: any) => {
                            // Prevent Ctrl+C, Ctrl+X, Cmd+C, Cmd+X
                            if ((e.ctrlKey || e.metaKey) && (e.keyCode === monaco.KeyCode.KeyC || e.keyCode === monaco.KeyCode.KeyX)) {
                              e.preventDefault();
                              e.stopPropagation();
                            }
                          });
                          
                          // Also disable via actions to be sure
                          editor.addAction({
                            id: 'disable-copy',
                            label: 'Copy Disabled',
                            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC],
                            run: () => null
                          });
                          editor.addAction({
                            id: 'disable-cut',
                            label: 'Cut Disabled',
                            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX],
                            run: () => null
                          });
                        }
                      }}
                      options={{
                        fontSize: 16,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        readOnly: hasSubmitted || attempts >= (currentQ?.maxAttempts || 3),
                        padding: { top: 20 },
                        contextmenu: contestState.currentRound !== 2 // Disable right-click in Round 2
                      }}
                    />
                  </div>
                  
                  {/* Output Console for Code-based Questions */}
                  {renderOutputConsole()}
                  
                  {!isConsoleVisible && (
                    <button 
                      onClick={() => setIsConsoleVisible(true)}
                      className="absolute bottom-4 right-4 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg flex items-center gap-2 transition-all active:scale-95"
                    >
                      <Code size={14} />
                      Show Console
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <Modal
          isOpen={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
          title="Confirm Logout"
          footer={
            <>
              <button
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition font-bold"
              >
                Logout
              </button>
            </>
          }
        >
          <p>Are you sure you want to logout? Any progress will be lost.</p>
        </Modal>

        <Modal
          isOpen={alertModal.isOpen}
          onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
          title={alertModal.title}
          footer={
            <div className="flex gap-3">
              {alertModal.title === "⚠ Warning" && !isFullscreen && (
                <button
                  onClick={() => {
                    document.documentElement.requestFullscreen().catch(console.error);
                    setAlertModal({ ...alertModal, isOpen: false });
                  }}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl transition font-bold"
                >
                  Re-enter Fullscreen
                </button>
              )}
              <button
                onClick={() => {
                  if (alertModal.title.includes("Fullscreen")) {
                    document.documentElement.requestFullscreen().catch(err => {
                      console.log("Fullscreen request failed via OK button:", err);
                    });
                  }
                  setAlertModal({ ...alertModal, isOpen: false });
                }}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition font-bold"
              >
                OK
              </button>
            </div>
          }
        >
          <p>{alertModal.message}</p>
        </Modal>
      </div>
    );
  }

  return null;
}
