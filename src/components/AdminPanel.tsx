import React, { useState, useEffect } from "react";
import { Question, Participant, ContestState, User } from "../types";
import { Plus, Edit2, Trash2, Play, SkipForward, Users, Trophy, AlertTriangle, LogOut, RefreshCw, CheckCircle2, Code } from "lucide-react";
import socket from "../lib/socket";
import Modal from "./Modal";
import AdminReview from "./AdminReview";

export default function AdminPanel({ user, participants, contestState, socketConnected, instanceId }: { user: User, participants: Participant[], contestState: ContestState | null, socketConnected: boolean, instanceId: string | null }) {
  console.log("[ADMIN] AdminPanel rendering. Participants:", participants.length, "Status:", contestState?.status, "Connected:", socketConnected);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, round: number | null }>({ isOpen: false, round: null });
  const handleLogout = () => {
    localStorage.removeItem("contest_user");
    window.location.reload();
  };
  const [questions, setQuestions] = useState<Question[]>([]);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedQualifiers, setSelectedQualifiers] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [autoSelectN, setAutoSelectN] = useState(10);

  useEffect(() => {
    if (participants.length > 0) {
      setSelectedQualifiers(participants.filter(p => p.isQualified).map(p => p.userId));
    }
  }, [participants.length]);

  const handleAutoSelect = () => {
    const round = contestState?.qualificationRound || 2;
    const sorted = [...participants].sort((a, b) => {
      if (round === 2) return b.quizScore - a.quizScore;
      if (round === 3) return (b.quizScore + b.debugScore) - (a.quizScore + a.debugScore);
      return b.score - a.score;
    });
    const topN = sorted.slice(0, autoSelectN).map(p => p.userId);
    setSelectedQualifiers(topN);
  };

  const confirmManualQualification = () => {
    socket.emit("adminSetManualQualification", selectedQualifiers);
    setAlerts(prev => ["Manual qualification settings updated.", ...prev].slice(0, 10));
  };

  const [formData, setFormData] = useState<Partial<Question>>({
    title: "",
    description: "",
    buggyCode: "",
    starterCode: "",
    correctPatterns: [""],
    expectedOutput: "",
    testInput: "",
    language: "javascript",
    round: 1,
    type: "mcq",
    points: 50,
    bonusPoints: 0,
    bonusDuration: 0,
    duration: 30,
    maxAttempts: 3,
    options: ["", "", "", ""],
    answer: "",
  });

  useEffect(() => {
    console.log("[ADMIN] AdminPanel mounted");
    fetchQuestions();
    socket.on("adminAlert", (alert: { username: string, type: string, violations: number }) => {
      const msg = `${alert.username}: ${alert.type} (Violation #${alert.violations})`;
      setAlerts((prev) => [msg, ...prev].slice(0, 10));
    });

    return () => {
      socket.off("adminAlert");
    };
  }, []);

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

  const fetchQuestions = async () => {
    try {
      const data = await fetchJson("/api/questions");
      if (Array.isArray(data)) {
        setQuestions(data);
      }
    } catch (err) {
      console.error("Error fetching questions:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editingId ? "PUT" : "POST";
    const url = editingId ? `/api/questions/${editingId}` : "/api/questions";

    try {
      const data = await fetchJson(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      setIsAdding(false);
      setEditingId(null);
      setFormData({
        title: "",
        description: "",
        buggyCode: "",
        starterCode: "",
        correctPatterns: [""],
        expectedOutput: "",
        testInput: "",
        language: "javascript",
        round: 1,
        type: "mcq",
        points: 50,
        bonusPoints: 0,
        bonusDuration: 0,
        duration: 30,
        maxAttempts: 3,
        options: ["", "", "", ""],
        answer: "",
      });
      fetchQuestions();
    } catch (err: any) {
      console.error("Error submitting question:", err);
      setAlerts(prev => [`Error: ${err.message}`, ...prev].slice(0, 10));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetchJson(`/api/questions/${id}`, { method: "DELETE" });
      fetchQuestions();
    } catch (err: any) {
      console.error("Error deleting question:", err);
      setAlerts(prev => [`Error: ${err.message}`, ...prev].slice(0, 10));
    }
  };

  const startRound = (round: number) => {
    const roundQuestions = questions.filter(q => q.round === round);
    if (roundQuestions.length === 0) {
      setConfirmModal({ isOpen: true, round });
      return;
    }
    socket.emit("adminStartRound", round);
  };

  const confirmStartRound = () => {
    if (confirmModal.round !== null) {
      socket.emit("adminStartRound", confirmModal.round);
    }
    setConfirmModal({ isOpen: false, round: null });
  };
  const endRound = () => socket.emit("adminEndRound");
  const unlockUser = (userId: string) => socket.emit("adminUnlockUser", userId);
  const resetViolations = (userId: string) => socket.emit("adminResetViolations", userId);
  const lockUser = (userId: string) => socket.emit("adminLockUser", userId);
  const deleteParticipant = (userId: string, username: string) => {
    if (window.confirm(`Are you sure you want to delete participant "${username}"? They will lose all progress.`)) {
      socket.emit("adminDeleteParticipant", userId);
    }
  };

  const currentRound = contestState?.currentRound;

  return (
    <>
      <div className="min-h-screen bg-[#0a0a0a] text-white p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Question Management */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
              <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">Logged in as: <span className="text-blue-400 font-bold">{user.username}</span></p>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
                  <span className="text-[10px] uppercase font-bold text-gray-600 tracking-widest">
                    {socketConnected ? 'Server Connected' : 'Connecting to Server...'}
                  </span>
                  <button 
                    onClick={() => socket.emit("requestState")}
                    className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-gray-300 transition"
                    title="Refresh State"
                  >
                    <RefreshCw size={12} />
                  </button>
                  {instanceId && (
                    <span className="text-[10px] uppercase font-bold text-gray-700 tracking-widest border-l border-white/10 pl-2">
                      Instance: {instanceId}
                    </span>
                  )}
                </div>
                {(contestState as any)?.appUrl && window.location.origin !== (contestState as any).appUrl && (
                  <div className="flex items-center gap-2 text-[10px] text-orange-500 font-bold uppercase">
                    <AlertTriangle size={10} />
                    <span>URL Mismatch: Sync may fail. Use {(contestState as any).appUrl}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowLogoutModal(true)}
                className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 px-4 py-2 rounded-lg transition border border-red-500/30"
              >
                <LogOut size={20} /> Logout
              </button>
              <button
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition"
              >
                <Plus size={20} /> Add Question
              </button>
            </div>
          </div>

          <div className="space-y-8">
            {/* Live Participants & Monitoring Panel */}
            <div className="bg-[#1a1a1a] p-6 rounded-xl border border-white/10 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Users size={20} className="text-blue-500" /> Live Participants & Monitoring
                </h2>
                <div className="flex gap-2">
                  <button 
                    onClick={() => socket.emit("adminResetAllViolations")}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/20 transition-all text-xs font-bold uppercase tracking-wider"
                  >
                    <RefreshCw size={14} /> Reset All
                  </button>
                  <button 
                    onClick={() => socket.emit("adminLockSuspicious")}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-lg border border-red-500/20 transition-all text-xs font-bold uppercase tracking-wider"
                  >
                    <AlertTriangle size={14} /> Lock Suspicious
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-500 uppercase text-[10px] font-bold tracking-widest">
                      <th className="pb-3 px-2">Username</th>
                      <th className="pb-3 px-2">Score</th>
                      <th className="pb-3 px-2">Violations</th>
                      <th className="pb-3 px-2">Fullscreen</th>
                      <th className="pb-3 px-2">Status</th>
                      <th className="pb-3 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {participants.map((p) => {
                      const status = p.violations === 0 ? "Safe" : p.violations < 3 ? "Suspicious" : "High Risk";
                      const statusColor = p.violations === 0 ? "text-green-500" : p.violations < 3 ? "text-yellow-500" : "text-red-500";
                      const rowBg = p.violations >= 3 ? "bg-red-500/5" : p.violations > 0 ? "bg-yellow-500/5" : "";
                      const totalScore = (p.quizScore || 0) + (p.debugScore || 0) + (p.round3Score || 0);
                      
                      return (
                        <tr key={p.userId} className={`hover:bg-white/5 transition-colors ${rowBg} ${!p.isOnline ? "opacity-50" : ""}`}>
                          <td className="py-3 px-2 font-medium">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${p.isOnline ? "bg-green-500 animate-pulse" : "bg-blue-500"}`} />
                              {p.username}
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <span className="text-blue-400 font-mono font-bold">
                              {totalScore}
                            </span>
                          </td>
                          <td className="py-3 px-2">
                            <span className={`font-mono font-bold ${p.violations > 0 ? "animate-pulse" : ""}`}>
                              {p.violations}
                            </span>
                          </td>
                          <td className="py-3 px-2">
                            {p.isFullscreen ? (
                              <span className="text-green-500 flex items-center gap-1 text-[10px] font-bold uppercase">
                                <CheckCircle2 size={12} /> Active
                              </span>
                            ) : (
                              <span className="text-red-500 flex items-center gap-1 text-[10px] font-bold uppercase">
                                <AlertTriangle size={12} /> Exited
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${statusColor.replace("text", "bg")}`} />
                              <span className={`text-[10px] font-bold uppercase ${statusColor}`}>{status}</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => resetViolations(p.userId)}
                                title="Reset Violations"
                                className="p-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded transition border border-blue-500/30"
                              >
                                <RefreshCw size={14} />
                              </button>
                              <button 
                                onClick={() => deleteParticipant(p.userId, p.username)}
                                title="Delete Participant"
                                className="p-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-500 rounded transition border border-red-500/30"
                              >
                                <Trash2 size={14} />
                              </button>
                              {p.isLocked ? (
                                <button 
                                  onClick={() => unlockUser(p.userId)}
                                  title="Allow Continue"
                                  className="p-1.5 bg-green-600/20 hover:bg-green-700/30 text-green-400 rounded transition border border-green-500/30"
                                >
                                  <CheckCircle2 size={14} />
                                </button>
                              ) : (
                                <button 
                                  onClick={() => lockUser(p.userId)}
                                  title="Lock User"
                                  className="p-1.5 bg-red-600/20 hover:bg-red-700/30 text-red-400 rounded transition border border-red-500/30"
                                >
                                  <LogOut size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {participants.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-500 italic">No participants connected</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Question Management */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Code size={20} className="text-blue-500" /> Question Management (R1, R2, R3)
              </h2>
              {isAdding || editingId ? (
                <form onSubmit={handleSubmit} className="bg-[#1a1a1a] p-6 rounded-xl border border-white/10 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      placeholder="Title"
                      className="bg-[#2a2a2a] p-3 rounded-lg border border-white/10"
                      value={formData.title || ""}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                    <select
                      className="bg-[#2a2a2a] p-3 rounded-lg border border-white/10"
                      value={formData.round || 1}
                      onChange={(e) => {
                        const r = parseInt(e.target.value);
                        setFormData({ 
                          ...formData, 
                          round: r as any,
                          type: r === 1 ? "mcq" : r === 2 ? "debug" : "logic-completion"
                        });
                      }}
                      required
                    >
                      <option value={1}>Round 1 (Quiz)</option>
                      <option value={2}>Round 2 (Debug)</option>
                      <option value={3}>Round 3 (Logic)</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <select
                      className="bg-[#2a2a2a] p-3 rounded-lg border border-white/10"
                      value={formData.type || "mcq"}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                      required
                    >
                      <option value="mcq">MCQ</option>
                      <option value="debug">Debug</option>
                      <option value="code-completion">Code Completion</option>
                      <option value="logic-completion">Logic Completion (R3)</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Points"
                      className="bg-[#2a2a2a] p-3 rounded-lg border border-white/10"
                      value={formData.points || 50}
                      onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) })}
                      required
                    />
                  </div>
                  <textarea
                    placeholder="Question / Description"
                    className="w-full bg-[#2a2a2a] p-3 rounded-lg border border-white/10 h-20"
                    value={formData.description || ""}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                  />
                  
                  {formData.type === "mcq" ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm text-gray-400">MCQ Options</label>
                        <div className="grid grid-cols-1 gap-2">
                          {formData.options?.map((opt, i) => (
                            <div key={i} className="flex gap-2">
                              <textarea
                                placeholder={`Option ${i + 1}`}
                                className="flex-1 bg-[#2a2a2a] p-3 rounded-lg border border-white/10 h-20 resize-none"
                                value={opt || ""}
                                onChange={(e) => {
                                  const newOpts = [...(formData.options || [])];
                                  newOpts[i] = e.target.value;
                                  setFormData({ ...formData, options: newOpts });
                                }}
                                required
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const newOpts = (formData.options || []).filter((_, idx) => idx !== i);
                                  setFormData({ ...formData, options: newOpts });
                                }}
                                className="text-red-400 hover:text-red-300 p-2 self-start"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, options: [...(formData.options || []), ""] })}
                          className="text-blue-400 text-xs font-bold uppercase"
                        >
                          + Add Option
                        </button>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-gray-400">Correct Answer</label>
                        <select
                          className="w-full bg-[#2a2a2a] p-3 rounded-lg border border-white/10"
                          value={formData.answer || ""}
                          onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                          required
                        >
                          <option value="">Select Correct Answer</option>
                          {formData.options?.filter(opt => (opt || "").trim() !== "").map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <select
                          className="bg-[#2a2a2a] p-3 rounded-lg border border-white/10"
                          value={formData.language || "javascript"}
                          onChange={(e) => setFormData({ ...formData, language: e.target.value as any })}
                        >
                          <option value="javascript">JavaScript</option>
                          <option value="python">Python</option>
                          <option value="java">Java</option>
                          <option value="c">C</option>
                        </select>
                        <div className="space-y-2">
                          <label className="text-sm text-gray-400">Max Attempts</label>
                          <input
                            type="number"
                            placeholder="e.g. 3"
                            className="w-full bg-[#2a2a2a] p-3 rounded-lg border border-white/10"
                            value={formData.maxAttempts || 3}
                            onChange={(e) => setFormData({ ...formData, maxAttempts: parseInt(e.target.value) })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <textarea
                          placeholder="Expected Output (Required for R2/Debug/Output Verification)"
                          className="bg-[#2a2a2a] p-3 rounded-lg border border-white/10 h-20"
                          value={formData.expectedOutput || ""}
                          onChange={(e) => setFormData({ ...formData, expectedOutput: e.target.value })}
                          required={formData.round === 2 || formData.type === "debug" || formData.type === "code-completion" || formData.type === "logic-completion"}
                        />
                        <textarea
                          placeholder="Test Input (Optional)"
                          className="bg-[#2a2a2a] p-3 rounded-lg border border-white/10 h-20"
                          value={formData.testInput || ""}
                          onChange={(e) => setFormData({ ...formData, testInput: e.target.value })}
                        />
                      </div>
                      <textarea
                        placeholder={formData.type === "debug" ? "Buggy Code" : formData.type === "logic-completion" ? "Code with [BLANK]" : "Starter Code"}
                        className="w-full bg-[#2a2a2a] p-3 rounded-lg border border-white/10 font-mono h-32"
                        value={formData.type === "debug" ? (formData.buggyCode || "") : (formData.starterCode || "")}
                        onChange={(e) => setFormData({ ...formData, [formData.type === "debug" ? "buggyCode" : "starterCode"]: e.target.value })}
                        required
                      />
                      {formData.type === "logic-completion" ? (
                        <div className="space-y-2">
                          <label className="text-sm text-gray-400">Correct Answers (One per [BLANK])</label>
                          {formData.correctAnswers?.map((ans, i) => (
                            <div key={i} className="flex gap-2">
                              <input
                                placeholder={`Answer for [BLANK] ${i + 1}`}
                                className="flex-1 bg-[#2a2a2a] p-2 rounded-lg border border-white/10"
                                value={ans || ""}
                                onChange={(e) => {
                                  const newAns = [...(formData.correctAnswers || [])];
                                  newAns[i] = e.target.value;
                                  setFormData({ ...formData, correctAnswers: newAns });
                                }}
                                required
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const newAns = (formData.correctAnswers || []).filter((_, idx) => idx !== i);
                                  setFormData({ ...formData, correctAnswers: newAns });
                                }}
                                className="text-red-400 hover:text-red-300"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, correctAnswers: [...(formData.correctAnswers || []), ""] })}
                            className="text-purple-400 text-xs font-bold uppercase"
                          >
                            + Add Answer Field
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <label className="text-sm text-gray-400">Correct Patterns (Keywords/Logic to check)</label>
                          {formData.correctPatterns?.map((pattern, i) => (
                            <div key={i} className="flex gap-2">
                              <input
                                placeholder="e.g. i++ or for (let i = 0; ...)"
                                className="flex-1 bg-[#2a2a2a] p-2 rounded-lg border border-white/10"
                                value={pattern || ""}
                                onChange={(e) => {
                                  const newPatterns = [...(formData.correctPatterns || [])];
                                  newPatterns[i] = e.target.value;
                                  setFormData({ ...formData, correctPatterns: newPatterns });
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const newPatterns = (formData.correctPatterns || []).filter((_, idx) => idx !== i);
                                  setFormData({ ...formData, correctPatterns: newPatterns });
                                }}
                                className="text-red-400 hover:text-red-300"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, correctPatterns: [...(formData.correctPatterns || []), ""] })}
                            className="text-blue-400 text-xs font-bold uppercase"
                          >
                            + Add Pattern
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Base Points</label>
                      <input
                        type="number"
                        placeholder="Points"
                        className="w-full bg-[#2a2a2a] p-3 rounded-lg border border-white/10"
                        value={formData.points || 0}
                        onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Bonus Points (Optional)</label>
                      <input
                        type="number"
                        placeholder="Bonus Points"
                        className="w-full bg-[#2a2a2a] p-3 rounded-lg border border-white/10"
                        value={formData.bonusPoints || 0}
                        onChange={(e) => setFormData({ ...formData, bonusPoints: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Total Duration (Seconds)</label>
                      <input
                        type="number"
                        placeholder="e.g. 30"
                        className="w-full bg-[#2a2a2a] p-3 rounded-lg border border-white/10"
                        value={formData.duration || 0}
                        onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Bonus Window (Seconds)</label>
                      <input
                        type="number"
                        placeholder="e.g. 10"
                        className="w-full bg-[#2a2a2a] p-3 rounded-lg border border-white/10"
                        value={formData.bonusDuration || 0}
                        onChange={(e) => setFormData({ ...formData, bonusDuration: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => { setIsAdding(false); setEditingId(null); }}
                      className="px-4 py-2 text-gray-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button type="submit" className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded-lg">
                      {editingId ? "Update" : "Save"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid gap-4">
                  {questions.map((q) => (
                    <div key={q.id} className="bg-[#1a1a1a] p-4 rounded-xl border border-white/10 flex justify-between items-center">
                      <div>
                        <h3 className="font-semibold">{q.title}</h3>
                        <p className="text-xs text-gray-400 uppercase tracking-wider">
                          {q.round} • {q.points} pts 
                          {q.bonusPoints ? ` • +${q.bonusPoints} bonus (${q.bonusDuration}s)` : ""}
                          {q.duration ? ` • ${q.duration}s total` : ""}
                          {q.round === 2 ? ` • ${q.maxAttempts || 3} attempts` : ""}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditingId(q.id); setFormData(q); }}
                          className="p-2 hover:bg-white/10 rounded-lg text-blue-400"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(q.id)}
                          className="p-2 hover:bg-white/10 rounded-lg text-red-400"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {questions.length === 0 && (
                    <div className="bg-[#1a1a1a] p-8 text-center rounded-xl border border-white/10 text-gray-500 italic">
                      No questions added yet. Click "Add Question" to start.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Embedded Submission Review - synced with Admin 2 */}
            <AdminReview isEmbedded={true} />
          </div>
        </div>

        {/* Right: Contest Control & Live Data */}
        <div className="space-y-6">
          <div className="bg-[#1a1a1a] p-6 rounded-xl border border-white/10 space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Play size={20} className="text-green-500" /> Contest Control
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">R1 Duration (s)</label>
                  <input
                    type="number"
                    className="w-full bg-[#2a2a2a] p-2 rounded-lg border border-white/10 text-sm"
                    value={contestState?.round1Duration || 0}
                    onChange={(e) => socket.emit("adminUpdateRoundDurations", { 
                      r1: parseInt(e.target.value), 
                      r2: contestState?.round2Duration,
                      r3: contestState?.round3Duration
                    })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">R2 Duration (s)</label>
                  <input
                    type="number"
                    className="w-full bg-[#2a2a2a] p-2 rounded-lg border border-white/10 text-sm"
                    value={contestState?.round2Duration || 0}
                    onChange={(e) => socket.emit("adminUpdateRoundDurations", { 
                      r1: contestState?.round1Duration, 
                      r2: parseInt(e.target.value),
                      r3: contestState?.round3Duration
                    })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">R3 Duration (s)</label>
                  <input
                    type="number"
                    className="w-full bg-[#2a2a2a] p-2 rounded-lg border border-white/10 text-sm"
                    value={contestState?.round3Duration || 0}
                    onChange={(e) => socket.emit("adminUpdateRoundDurations", { 
                      r1: contestState?.round1Duration, 
                      r2: contestState?.round2Duration,
                      r3: parseInt(e.target.value)
                    })}
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-white/10">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold uppercase text-gray-500 tracking-widest">
                    R{contestState?.qualificationRound || 2} Qualification
                  </h3>
                  <select
                    className="bg-[#2a2a2a] p-1 rounded border border-white/10 text-[10px] font-bold uppercase text-blue-400"
                    value={contestState?.qualificationRound || 2}
                    onChange={(e) => socket.emit("adminUpdateQualificationSettings", { 
                      mode: contestState?.qualificationMode, 
                      count: contestState?.qualifyCount,
                      round: parseInt(e.target.value) 
                    })}
                  >
                    <option value={2}>For R2</option>
                    <option value={3}>For R3</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Mode</label>
                    <select
                      className="w-full bg-[#2a2a2a] p-2 rounded-lg border border-white/10 text-sm"
                      value={contestState?.qualificationMode || "all"}
                      onChange={(e) => socket.emit("adminUpdateQualificationSettings", { 
                        mode: e.target.value, 
                        count: contestState?.qualifyCount,
                        round: contestState?.qualificationRound
                      })}
                    >
                      <option value="all">Allow All</option>
                      <option value="topN">Top N Users</option>
                      <option value="manual">Manual Selection</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">N (Top Users)</label>
                    <input
                      type="number"
                      disabled={contestState?.qualificationMode !== "topN"}
                      className="w-full bg-[#2a2a2a] p-2 rounded-lg border border-white/10 text-sm disabled:opacity-50"
                      value={contestState?.qualifyCount || 10}
                      onChange={(e) => socket.emit("adminUpdateQualificationSettings", { 
                        mode: contestState?.qualificationMode, 
                        count: parseInt(e.target.value),
                        round: contestState?.qualificationRound
                      })}
                    />
                  </div>
                </div>

                {contestState?.qualificationMode === "manual" && (
                  <div className="space-y-3 pt-4 border-t border-white/5">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Smart Hybrid Selection</h4>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setSelectedQualifiers(participants.map(p => p.userId))}
                          className="text-[8px] bg-white/5 hover:bg-white/10 px-2 py-1 rounded uppercase font-bold"
                        >
                          Select All
                        </button>
                        <button 
                          onClick={() => setSelectedQualifiers([])}
                          className="text-[8px] bg-white/5 hover:bg-white/10 px-2 py-1 rounded uppercase font-bold"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[9px] uppercase font-bold text-gray-500">Auto Select Top N</label>
                        <input 
                          type="number"
                          className="w-full bg-[#2a2a2a] p-2 rounded-lg border border-white/10 text-xs"
                          value={autoSelectN}
                          onChange={(e) => setAutoSelectN(parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div className="flex items-end">
                        <button 
                          onClick={handleAutoSelect}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-bold text-[10px] transition h-[34px]"
                        >
                          APPLY AUTO
                        </button>
                      </div>
                    </div>
                    
                    <input 
                      type="text"
                      placeholder="Search users..."
                      className="w-full bg-[#2a2a2a] p-2 rounded-lg border border-white/10 text-xs"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />

                    <div className="max-h-[200px] overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                      {[...participants]
                        .filter(p => p.username.toLowerCase().includes(userSearch.toLowerCase()))
                        .sort((a, b) => {
                          const round = contestState?.qualificationRound || 2;
                          if (round === 2) return b.quizScore - a.quizScore;
                          if (round === 3) return (b.quizScore + b.debugScore) - (a.quizScore + a.debugScore);
                          return b.score - a.score;
                        })
                        .map((p) => {
                          const round = contestState?.qualificationRound || 2;
                          const displayScore = round === 2 ? p.quizScore : (p.quizScore + p.debugScore);
                          return (
                            <label key={p.userId} className="flex items-center justify-between p-2 rounded hover:bg-white/5 cursor-pointer group">
                              <div className="flex items-center gap-3">
                                <input 
                                  type="checkbox"
                                  checked={selectedQualifiers.includes(p.userId)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedQualifiers(prev => [...prev, p.userId]);
                                    } else {
                                      setSelectedQualifiers(prev => prev.filter(id => id !== p.userId));
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-white/10 bg-[#2a2a2a] text-blue-600 focus:ring-0 focus:ring-offset-0"
                                />
                                <span className="text-sm font-medium">{p.username}</span>
                              </div>
                              <span className="text-xs text-gray-500 font-mono">Score: {displayScore}</span>
                            </label>
                          );
                        })}
                    </div>

                    <button 
                      onClick={confirmManualQualification}
                      className="w-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 py-2 rounded-lg font-bold text-xs transition border border-blue-500/30"
                    >
                      CONFIRM QUALIFICATION
                    </button>
                  </div>
                )}
              </div>

              <p className="text-sm text-gray-400">Status: <span className="text-white uppercase font-mono">{contestState?.status || "Waiting"}</span></p>
              <p className="text-sm text-gray-400">Current Round: <span className="text-white">{currentRound || "None"}</span></p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => startRound(1)}
                disabled={contestState?.status === "active" && currentRound === 1}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 py-2 rounded-lg font-bold text-[10px] transition"
              >
                START R1
              </button>
              <button
                onClick={() => startRound(2)}
                disabled={contestState?.status === "active" && currentRound === 2}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-2 rounded-lg font-bold text-[10px] transition"
              >
                START R2
              </button>
              <button
                onClick={() => startRound(3)}
                disabled={contestState?.status === "active" && currentRound === 3}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 py-2 rounded-lg font-bold text-[10px] transition"
              >
                START R3
              </button>
            </div>
              <button
                onClick={endRound}
                disabled={contestState?.status !== "active"}
                className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 py-3 rounded-lg font-bold flex items-center justify-center gap-2"
              >
                END ROUND <SkipForward size={18} />
              </button>
            </div>
          </div>

          {alerts.length > 0 && (
            <div className="bg-red-900/20 border border-red-500/50 p-4 rounded-xl space-y-2">
              <h3 className="text-red-400 font-bold flex items-center gap-2">
                <AlertTriangle size={16} /> Anti-Cheat Alerts
              </h3>
              <div className="space-y-1">
                {alerts.map((a, i) => (
                  <p key={i} className="text-xs text-red-300/80">{a}</p>
                ))}
              </div>
            </div>
          )}
        </div>
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
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, round: null })}
        title="Empty Round Warning"
        footer={
          <>
            <button
              onClick={() => setConfirmModal({ isOpen: false, round: null })}
              className="px-4 py-2 text-gray-400 hover:text-white transition font-medium"
            >
              Cancel
            </button>
            <button
              onClick={confirmStartRound}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl transition font-bold"
            >
              Start Anyway
            </button>
          </>
        }
      >
        <p>Warning: There are no questions for Round {confirmModal.round}. Users will see an empty screen. Do you still want to start?</p>
      </Modal>
    </>
  );
}
