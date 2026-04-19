import React, { useState, useEffect } from "react";
import { LogOut, Search, Clock, CheckCircle2, XCircle, Code, Eye, Terminal, Users, FileText, RefreshCw } from "lucide-react";

interface Submission {
  id: string;
  userId: string;
  username: string;
  round: number;
  questionId: string;
  code: string;
  output: string;
  expectedOutput: string;
  status: "correct" | "wrong";
  attemptCount: number;
  timestamp: number;
}

interface UserData {
  id: string;
  username: string;
  role: string;
  violations: number;
  isLocked: boolean;
  isQualified: boolean;
  totalScore: number;
  quizScore: number;
  debugScore: number;
  round3Score: number;
  completedQuestions: string[];
}

export default function AdminReview({ isEmbedded = false }: { isEmbedded?: boolean }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null);
  const [activeTab, setActiveTab] = useState<"submissions" | "users">("submissions");

  // Filters
  const [filterRound, setFilterRound] = useState<"all" | "2" | "3">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "correct" | "wrong">("all");
  const [filterUsername, setFilterUsername] = useState("");

  const getToken = (): string => {
    try {
      const saved = localStorage.getItem("contest_user");
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.id || "";
      }
    } catch (e) {
      console.error("Failed to get token:", e);
    }
    return "";
  };

  const handleLogout = () => {
    localStorage.removeItem("contest_user");
    window.location.href = "/";
  };

  const fetchUsers = async () => {
    const token = getToken();
    if (!token) {
      console.warn("[Admin2] No token found, skipping users fetch");
      return;
    }
    try {
      const res = await fetch("/admin2/users", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        console.log("[Admin2] Users fetched:", data.length);
        setUsers(data);
      } else {
        console.error("[Admin2] Users fetch failed:", res.status);
        // Fallback to old API
        const fallbackRes = await fetch("/api/participants");
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          console.log("[Admin2] Fallback participants fetched:", fallbackData.length);
          setUsers(fallbackData.map((p: any) => ({
            id: p.userId,
            username: p.username,
            role: "user",
            violations: p.violations || 0,
            isLocked: p.isLocked || false,
            isQualified: p.isQualified ?? true,
            totalScore: p.score || 0,
            quizScore: p.quizScore || 0,
            debugScore: p.debugScore || 0,
            round3Score: p.round3Score || 0,
            completedQuestions: p.completedQuestions || []
          })));
        }
      }
    } catch (err) {
      console.error("[Admin2] Failed to fetch users", err);
    }
  };

  const fetchSubmissions = async () => {
    const token = getToken();
    if (!token) {
      console.warn("[Admin2] No token found, skipping submissions fetch");
      return;
    }
    try {
      const res = await fetch("/admin2/submissions", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        console.log("[Admin2] Submissions fetched:", data.length);
        setSubmissions(data);
      } else {
        console.error("[Admin2] Submissions fetch failed:", res.status);
        // Fallback to old API
        const fallbackRes = await fetch("/api/submissions");
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          console.log("[Admin2] Fallback submissions fetched:", fallbackData.length);
          setSubmissions(fallbackData);
        }
      }
    } catch (err) {
      console.error("[Admin2] Failed to fetch submissions", err);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchSubmissions();
    const interval = setInterval(() => {
      fetchUsers();
      fetchSubmissions();
    }, 5000);
    if (!isEmbedded && window.location.pathname !== "/admin-review") {
      window.history.replaceState(null, "", "/admin-review");
    }
    return () => clearInterval(interval);
  }, [isEmbedded]);

  const filtered = submissions.filter(sub => {
    if (filterRound !== "all" && sub.round?.toString() !== filterRound) return false;
    if (filterStatus !== "all" && sub.status !== filterStatus) return false;
    if (filterUsername && !sub.username?.toLowerCase().includes(filterUsername.toLowerCase())) return false;
    return true;
  }).sort((a, b) => b.timestamp - a.timestamp);

  const filteredUsers = users.filter(u => {
    if (filterUsername && !u.username?.toLowerCase().includes(filterUsername.toLowerCase())) return false;
    return true;
  });

  return (
    <div className={`${isEmbedded ? 'h-[600px] mt-8 bg-transparent' : 'min-h-screen bg-[#0a0a0a]'} text-white flex flex-col font-sans`}>
      {!isEmbedded && (
        <header className="bg-[#1a1a1a] border-b border-white/10 p-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 text-blue-500 rounded-lg">
              <Eye size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold uppercase tracking-wider text-blue-500">Admin-2 Monitor</h1>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Submission Review Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { fetchUsers(); fetchSubmissions(); }}
              className="flex items-center gap-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 px-4 py-2 rounded-lg transition border border-blue-500/20 font-bold uppercase text-xs"
            >
              <RefreshCw size={16} /> Refresh
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-600/10 hover:bg-red-600/20 text-red-500 px-4 py-2 rounded-lg transition border border-red-500/20 font-bold uppercase text-xs"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </header>
      )}

      {isEmbedded && (
        <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
          <Code size={20} className="text-blue-500" /> Submitted Code Review
        </h2>
      )}

      {/* Stats Bar */}
      <div className={`grid grid-cols-4 gap-4 ${isEmbedded ? 'mb-4' : 'p-4'}`}>
        <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-4">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Total Users</div>
          <div className="text-2xl font-bold text-blue-400">{users.length}</div>
        </div>
        <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-4">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Total Submissions</div>
          <div className="text-2xl font-bold text-purple-400">{submissions.length}</div>
        </div>
        <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-4">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Correct</div>
          <div className="text-2xl font-bold text-green-400">{submissions.filter(s => s.status === "correct").length}</div>
        </div>
        <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-4">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Wrong</div>
          <div className="text-2xl font-bold text-red-400">{submissions.filter(s => s.status === "wrong").length}</div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className={`flex gap-2 ${isEmbedded ? 'mb-4' : 'px-4 pb-4'}`}>
        <button
          onClick={() => setActiveTab("submissions")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
            activeTab === "submissions"
              ? "bg-purple-600/20 text-purple-400 border border-purple-500/30"
              : "bg-[#1a1a1a] text-gray-500 border border-white/10 hover:text-gray-300"
          }`}
        >
          <FileText size={14} /> Submissions ({submissions.length})
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
            activeTab === "users"
              ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
              : "bg-[#1a1a1a] text-gray-500 border border-white/10 hover:text-gray-300"
          }`}
        >
          <Users size={14} /> Users ({users.length})
        </button>
      </div>

      {activeTab === "users" ? (
        /* USERS TABLE */
        <div className={`flex-1 overflow-hidden flex flex-col ${isEmbedded ? '' : 'px-4 pb-6'}`}>
          <div className="flex-1 flex flex-col bg-[#1a1a1a] rounded-xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-white/10 bg-[#111] flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2 bg-black/40 px-3 py-2 rounded-lg border border-white/5">
                <Search size={16} className="text-gray-500" />
                <input
                  type="text"
                  placeholder="Search username..."
                  className="bg-transparent border-none outline-none text-sm w-32 md:w-48 text-white placeholder-gray-600"
                  value={filterUsername}
                  onChange={e => setFilterUsername(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-[#0a0a0a] sticky top-0 uppercase text-xs font-bold text-gray-500 tracking-widest z-10">
                  <tr>
                    <th className="px-4 py-3 border-b border-white/10">Username</th>
                    <th className="px-4 py-3 border-b border-white/10">Total Score</th>
                    <th className="px-4 py-3 border-b border-white/10">Quiz</th>
                    <th className="px-4 py-3 border-b border-white/10">Debug</th>
                    <th className="px-4 py-3 border-b border-white/10">R3</th>
                    <th className="px-4 py-3 border-b border-white/10">Violations</th>
                    <th className="px-4 py-3 border-b border-white/10">Status</th>
                    <th className="px-4 py-3 border-b border-white/10">Qualified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.map(u => (
                    <tr key={u.id} className="hover:bg-white/5 transition">
                      <td className="px-4 py-3 font-medium">{u.username}</td>
                      <td className="px-4 py-3 font-mono text-blue-400 font-bold">{u.totalScore || 0}</td>
                      <td className="px-4 py-3 font-mono text-gray-400">{u.quizScore || 0}</td>
                      <td className="px-4 py-3 font-mono text-gray-400">{u.debugScore || 0}</td>
                      <td className="px-4 py-3 font-mono text-gray-400">{u.round3Score || 0}</td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-bold ${(u.violations || 0) > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                          {u.violations || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.isLocked ? (
                          <span className="text-red-500 bg-red-500/10 px-2 py-1 rounded text-xs uppercase font-bold tracking-wider">Locked</span>
                        ) : (
                          <span className="text-green-500 bg-green-500/10 px-2 py-1 rounded text-xs uppercase font-bold tracking-wider">Active</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.isQualified ? (
                          <CheckCircle2 size={16} className="text-green-500" />
                        ) : (
                          <XCircle size={16} className="text-red-500" />
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-600 italic">No users found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* SUBMISSIONS VIEW */
        <div className={`flex-1 overflow-hidden flex flex-col md:flex-row gap-6 ${isEmbedded ? '' : 'px-4 pb-6'}`}>
          <div className="flex-[3] flex flex-col bg-[#1a1a1a] rounded-xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-white/10 bg-[#111] flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2 bg-black/40 px-3 py-2 rounded-lg border border-white/5">
                <Search size={16} className="text-gray-500" />
                <input
                  type="text"
                  placeholder="Search username..."
                  className="bg-transparent border-none outline-none text-sm w-32 md:w-48 text-white placeholder-gray-600"
                  value={filterUsername}
                  onChange={e => setFilterUsername(e.target.value)}
                />
              </div>
              
              <select
                className="bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm text-gray-300 outline-none"
                value={filterRound}
                onChange={e => setFilterRound(e.target.value as any)}
              >
                <option value="all">All Rounds</option>
                <option value="2">Round 2</option>
                <option value="3">Round 3</option>
              </select>

              <select
                className="bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm text-gray-300 outline-none"
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as any)}
              >
                <option value="all">All Status</option>
                <option value="correct">Correct</option>
                <option value="wrong">Wrong Answer</option>
              </select>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-[#0a0a0a] sticky top-0 uppercase text-xs font-bold text-gray-500 tracking-widest z-10">
                  <tr>
                    <th className="px-4 py-3 border-b border-white/10">User</th>
                    <th className="px-4 py-3 border-b border-white/10">Round</th>
                    <th className="px-4 py-3 border-b border-white/10">Question ID</th>
                    <th className="px-4 py-3 border-b border-white/10">Status</th>
                    <th className="px-4 py-3 border-b border-white/10">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map(sub => (
                    <tr 
                      key={sub.id} 
                      onClick={() => setSelectedSub(sub)}
                      className={`cursor-pointer transition hover:bg-white/5 ${selectedSub?.id === sub.id ? 'bg-blue-600/10 hover:bg-blue-600/20' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium">{sub.username}</td>
                      <td className="px-4 py-3 text-gray-400">R{sub.round}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs truncate max-w-[100px]">{sub.questionId}</td>
                      <td className="px-4 py-3">
                        {sub.status === 'correct' ? (
                          <span className="flex items-center gap-1 text-green-500 bg-green-500/10 px-2 py-1 rounded w-max text-xs uppercase font-bold tracking-wider">
                            <CheckCircle2 size={14} /> Correct
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-500 bg-red-500/10 px-2 py-1 rounded w-max text-xs uppercase font-bold tracking-wider">
                            <XCircle size={14} /> Wrong
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {new Date(sub.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-600 italic">No submissions found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {selectedSub ? (
            <div className="flex-[4] bg-[#1a1a1a] rounded-xl border border-white/10 flex flex-col overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-white/10 bg-[#111] grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest">Username</span>
                  <span className="text-lg font-bold">{selectedSub.username}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest">Attempt</span>
                  <span className="text-lg font-mono text-blue-400">{selectedSub.attemptCount}</span>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto p-6 space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/10 pb-2">
                    <Code size={14} /> Submitted Code
                  </div>
                  <pre className="bg-black/50 p-4 rounded-lg font-mono text-sm text-gray-300 overflow-x-auto border border-white/5">
                    {selectedSub.code}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/10 pb-2">
                    <Terminal size={14} /> Output Log
                  </div>
                  <pre className="bg-black/50 p-4 rounded-lg font-mono text-sm text-gray-300 overflow-x-auto border border-white/5 whitespace-pre-wrap">
                    {selectedSub.output || <span className="italic text-gray-600">No output</span>}
                  </pre>
                </div>

                {selectedSub.expectedOutput && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/10 pb-2">
                      <CheckCircle2 size={14} /> Expected Output
                    </div>
                    <pre className="bg-blue-900/10 p-4 rounded-lg font-mono text-sm text-blue-300/80 overflow-x-auto border border-blue-500/20 whitespace-pre-wrap">
                      {selectedSub.expectedOutput}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-[4] bg-[#1a1a1a] rounded-xl border border-white/10 flex items-center justify-center shadow-2xl">
              <div className="flex flex-col items-center text-gray-600 gap-4">
                <Code size={64} className="opacity-20" />
                <p className="font-bold uppercase tracking-widest text-sm">Select a submission to view details</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
