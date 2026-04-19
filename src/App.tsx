/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import socket from "./lib/socket";
import { Participant, ContestState, User, Question } from "./types";
import AdminPanel from "./components/AdminPanel";
import UserPanel from "./components/UserPanel";
import WaitingRoom from "./components/WaitingRoom";
import Leaderboard from "./components/Leaderboard";
import MatrixBackground from "./components/MatrixBackground";
import AdminReview from "./components/AdminReview";
import {
  Terminal,
  Shield,
  User as UserIcon,
  ChevronRight,
  LogIn,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  LogOut,
  Server,
  ArrowLeft
} from "lucide-react";

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem("contest_user");
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      // Migration: if it has userId but not id, map it
      if (parsed && parsed.userId && !parsed.id) {
        parsed.id = parsed.userId;
      }
      return parsed;
    } catch (e) {
      console.error("Failed to parse saved user:", e);
      return null;
    }
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [adminExists, setAdminExists] = useState(false);
  const [formData, setFormData] = useState({ username: "", password: "", role: "user" as "admin" | "user" | "admin_viewer" });
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [contestState, setContestState] = useState<ContestState | null>(null);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const hasJoined = React.useRef(false);

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
      console.log("[APP] Fetching questions...");
      const data = await fetchJson(`/api/questions`);
      if (Array.isArray(data)) {
        console.log("[APP] Questions updated:", data.length);
        setQuestions(data);
      }
    } catch (err) {
      console.error("Error fetching questions:", err);
    }
  };

  useEffect(() => {
    console.log("[APP] Round changed to:", contestState?.currentRound);
    fetchQuestions();
  }, [contestState?.currentRound, contestState?.status]);

  const fetchInstance = async () => {
    try {
      const data = await fetchJson("/api/instance");
      if (data && data.instanceId) {
        setInstanceId(data.instanceId);
      }
    } catch (err) {
      console.error("Error fetching instance:", err);
    }
  };

  useEffect(() => {
    fetchInstance();
  }, []);

  useEffect(() => {
    console.log("[APP] User state changed:", user?.username, user?.role, user?.id);
  }, [user]);

  useEffect(() => {
    console.log("[APP] Participants state changed:", participants.length);
  }, [participants]);

  useEffect(() => {
    console.log("[APP] Contest state changed:", contestState?.status);
  }, [contestState]);

  useEffect(() => {
    checkAdmin();

    const onConnect = () => {
      console.log("Socket connected:", socket.id);
      setSocketConnected(true);
      socket.emit("requestState");
      fetchInstance(); // Re-fetch on reconnect

      // Re-join if user is a participant
      const savedUser = localStorage.getItem("contest_user");
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          const userId = parsed.id || parsed.userId;
          if (parsed.role === "user" && userId) {
            console.log("[APP] Re-joining on connect:", parsed.username);
            socket.emit("join", { userId, username: parsed.username });
          }
        } catch (e) {
          console.error("Failed to parse user for re-join:", e);
        }
      }
    };

    const onDisconnect = () => {
      console.log("Socket disconnected");
      setSocketConnected(false);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    socket.on("participantsUpdate", (data: Participant[]) => {
      console.log("Participants updated:", data.length);
      setParticipants(data);

      // Update local user state if locked status changed
      if (user && user.role === "user") {
        const me = data.find(p => p.userId === user.id);
        if (me && me.isLocked !== user.isLocked) {
          setUser(prev => prev ? { ...prev, isLocked: me.isLocked } : null);
        }
      }
    });

    socket.on("contestState", (state) => {
      console.log("Contest state updated:", state.status, state.instanceId);
      setContestState(state);
    });

    socket.on("forceFullscreen", () => {
      try {
        const saved = localStorage.getItem("contest_user");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.role === "user") {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
              elem.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message}`);
              });
            }
          }
        }
      } catch (e) {
        console.error("forceFullscreen error", e);
      }
    });

    socket.on("exitFullscreen", () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => {
          console.error(`Error attempting to exit full-screen mode: ${err.message}`);
        });
      }
    });

    socket.on("adminRegistered", () => {
      console.log("[SOCKET] Admin registered, updating status...");
      setAdminExists(true);
    });

    socket.on("error", (msg) => {
      console.error("[SOCKET] Error received:", msg);
      setError(msg);
      if (msg.includes("Session not found")) {
        setUser(null);
        localStorage.removeItem("contest_user");
      }
    });

    // If already connected, trigger onConnect manually
    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("participantsUpdate");
      socket.off("contestState");
    };
  }, []);

  useEffect(() => {
    if (user) {
      socket.emit("requestState");
    }
  }, [user]);

  useEffect(() => {
    if (user && user.role === "user" && socketConnected) {
      console.log("[APP] Emitting join for user:", user.username);
      socket.emit("join", { userId: user.id, username: user.username });
    }
  }, [user, socketConnected]);

  useEffect(() => {
    if (contestState?.instanceId) {
      setInstanceId(contestState.instanceId);
    }
  }, [contestState]);

  const checkAdmin = async () => {
    try {
      console.log("[AUTH] Checking if admin exists...");
      const data = await fetchJson("/api/auth/admin-exists");
      if (data && typeof data.exists === "boolean") {
        console.log("[AUTH] Admin exists:", data.exists);
        setAdminExists(data.exists);
      }
    } catch (err) {
      console.error("[AUTH] Error checking admin:", err);
    }
  };

  const handleAuth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError("");

    console.log(`[AUTH] Starting auth. Role: ${formData.role}`);

    setIsAuthLoading(true);

    let endpoint = "/api/auth/login";
    if (formData.role === "user") {
      endpoint = "/api/auth/join";
    } else if (isRegistering) {
      endpoint = "/api/auth/register";
    }

    console.log(`[AUTH] Attempting ${formData.role} auth at ${endpoint}`, formData);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn("[AUTH] Request timed out after 15s");
      controller.abort();
    }, 15000);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(formData),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      console.log(`[AUTH] Response received. Status: ${res.status}`);

      const contentType = res.headers.get("content-type");
      let data;

      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
        console.log("[AUTH] JSON data parsed:", data);
      } else {
        const text = await res.text();
        console.error("[AUTH] Non-JSON response received:", text);
        setError(`Server error: ${res.status}. Please check server logs.`);
        return;
      }

      if (res.ok) {
        console.log("[AUTH] Success, setting user:", data);
        if (!data || !data.id) {
          console.error("[AUTH] Invalid user data received:", data);
          setError("Invalid user data received from server");
          return;
        }
        setUser(data);
        try {
          localStorage.setItem("contest_user", JSON.stringify(data));
        } catch (storageErr) {
          console.warn("[AUTH] Failed to save user to localStorage:", storageErr);
        }
      } else {
        console.warn("[AUTH] Failed:", data.error);
        setError(data.error || "Authentication failed");
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error("[AUTH] Error:", err);
      if (err.name === 'AbortError') {
        setError("Request timed out. Please try again.");
      } else {
        setError("Connection error. Check your server.");
      }
    } finally {
      console.log("[AUTH] handleAuth finished. Setting loading to false.");
      setIsAuthLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("contest_user");
    window.location.reload();
  };

  console.log(`[APP] Rendering. User: ${user?.username}, Role: ${user?.role}, Contest Status: ${contestState?.status}`);

  useEffect(() => {
    if (!user || user.role === "admin" || contestState?.status !== "active") return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        socket.emit("cheatingViolation", { type: "Tab Switch" });
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && contestState?.status === "active") {
        socket.emit("cheatingViolation", { type: "Fullscreen Exit" });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [user, contestState?.status]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(""), 10000); // Clear error after 10s
      return () => clearTimeout(timer);
    }
  }, [error]);

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4 relative overflow-hidden">
        <MatrixBackground />
        <div className="max-w-md w-full space-y-8 relative z-10">
          <div className="text-center space-y-4">
            <div className="inline-flex p-3 bg-blue-600/20 rounded-2xl text-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]">
              <Terminal size={48} />
            </div>
            <h1 className="text-4xl font-black tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]">
              Code <span className="text-blue-600">Smith</span>
            </h1>
            <p className="text-gray-500 font-mono tracking-widest text-xs">Think. Debug. Code. Succeed.</p>
          </div>

          <form onSubmit={handleAuth} className="bg-[#1a1a1a] p-8 rounded-3xl border border-white/10 space-y-6 shadow-2xl">
            <div className="flex bg-[#0a0a0a] p-1 rounded-xl mb-6">
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(false);
                  setFormData({ ...formData, role: "user" });
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${formData.role === "user" ? "bg-green-600 text-white" : "text-gray-500 hover:text-gray-300"}`}
              >
                Participant
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormData({ ...formData, role: "admin" });
                  // If no admin exists, default to registering
                  if (adminExists === false) {
                    setIsRegistering(true);
                  }
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${formData.role === "admin" ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-300"}`}
              >
                Admin 1
              </button>
            </div>

            {contestState && (
              <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold uppercase tracking-widest ${contestState.status === 'active' ? 'bg-green-600/10 border-green-500/30 text-green-500' :
                contestState.status === 'ended' ? 'bg-red-600/10 border-red-500/30 text-red-500' :
                  'bg-blue-600/10 border-blue-500/30 text-blue-500'
                }`}>
                <span>Contest Status</span>
                <span className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${contestState.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-current'}`} />
                  {contestState.status === 'active' ? `Round ${contestState.currentRound} Active` :
                    contestState.status === 'ended' ? 'Contest Ended' : 'Waiting to Start'}
                </span>
              </div>
            )}

            {error && (
              <div className="bg-red-900/20 border border-red-500/50 p-3 rounded-xl flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">
                  {formData.role === "admin" ? "Admin Username" : "Your Name"}
                </label>
                <input
                  type="text"
                  placeholder={formData.role === "admin" ? "Enter admin username" : "Enter your full name"}
                  className="w-full bg-[#2a2a2a] border border-white/10 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                  value={formData.username || ""}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                />
              </div>

              {formData.role === "admin" && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase ml-1">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="w-full bg-[#2a2a2a] border border-white/10 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition pr-10"
                      value={formData.password || ""}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {adminExists === false ? (
                    <div className="flex items-center gap-2 mt-3 p-2 bg-blue-600/10 border border-blue-500/20 rounded-lg">
                      <input
                        type="checkbox"
                        id="reg"
                        checked={isRegistering}
                        onChange={(e) => setIsRegistering(e.target.checked)}
                        className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="reg" className="text-[10px] text-blue-400 uppercase font-black tracking-wider cursor-pointer select-none">
                        Register as the Primary Admin
                      </label>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-500 uppercase font-bold ml-1">
                      <Shield size={12} className="text-blue-500" />
                      Admin already registered
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isAuthLoading}
              className={`w-full ${formData.role === 'admin' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'} py-4 rounded-xl font-bold text-lg transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isAuthLoading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                formData.role === "admin" ? <LogIn size={20} /> : <UserPlus size={20} />
              )}
              {isAuthLoading ? "Processing..." : (formData.role === "admin" ? (isRegistering ? "Create Admin" : "Admin Login") : "Join Contest")}
            </button>

            <div className="flex items-center justify-center gap-2 pt-2">
              <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
              <span className="text-[10px] uppercase font-bold text-gray-600 tracking-widest">
                {socketConnected ? 'Server Connected' : 'Connecting to Server...'}
              </span>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-red-900/90 backdrop-blur-md border border-red-500/50 p-4 rounded-2xl flex items-start gap-3 text-red-200 shadow-2xl shadow-red-950/50">
            <AlertCircle size={20} className="shrink-0 mt-0.5 text-red-400" />
            <div className="flex-1">
              <p className="text-sm font-bold uppercase tracking-wider text-red-400 mb-1">System Error</p>
              <p className="text-sm leading-relaxed">{error}</p>
            </div>
            <button
              onClick={() => setError("")}
              className="p-1 hover:bg-white/10 rounded-lg transition text-red-400"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      )}
      {user.role === "admin" ? (
        <AdminPanel user={user} participants={participants} contestState={contestState} socketConnected={socketConnected} instanceId={instanceId} />
      ) : user.role === "admin_viewer" ? (
        <AdminReview />
      ) : (
        (() => {
          if (user.role === "user" && user.isLocked) {
            return (
              <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-[#1a1a1a] p-8 rounded-3xl border border-red-500/30 text-center space-y-6 shadow-2xl shadow-red-900/20">
                  <div className="inline-flex p-4 bg-red-600/20 rounded-full text-red-500 animate-pulse">
                    <Shield size={64} />
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-3xl font-black uppercase tracking-tighter text-red-500">Account Locked</h1>
                    <p className="text-gray-400 text-sm">Your account has been locked due to multiple anti-cheating violations. Please contact the administrator to unlock your session.</p>
                  </div>
                  <div className="pt-4">
                    <button
                      onClick={logout}
                      className="w-full bg-red-600 hover:bg-red-700 py-3 rounded-xl font-bold transition flex items-center justify-center gap-2"
                    >
                      <LogOut size={20} /> Logout
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          if (!contestState) {
            return (
              <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400 p-4">
                <div className="flex flex-col items-center gap-6 max-w-xs w-full">
                  <div className="relative">
                    <div className="w-12 h-12 border-4 border-orange-500/20 rounded-full" />
                    <div className="absolute inset-0 w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="font-mono text-sm tracking-widest uppercase text-white">Connecting to contest</p>
                    <p className="text-xs text-zinc-500">Establishing real-time connection with the server...</p>
                  </div>

                  <div className="w-full pt-4 border-t border-zinc-800/50 flex flex-col gap-3">
                    <button
                      onClick={() => socket.emit("requestState")}
                      className="w-full py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs font-bold uppercase tracking-wider transition"
                    >
                      Retry Connection
                    </button>
                    <button
                      onClick={() => {
                        localStorage.removeItem("contest_user");
                        setUser(null);
                      }}
                      className="w-full py-2 rounded-lg border border-zinc-800 hover:bg-zinc-900 text-xs font-bold uppercase tracking-wider transition text-zinc-500"
                    >
                      Return to Login
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          if (contestState.status === "waiting") {
            return <WaitingRoom participants={participants} username={user.username} userId={user.id} socketConnected={socketConnected} instanceId={instanceId} />;
          }

          const participant = participants.find(p => p.userId === user.id);
          const roundQuestions = questions.filter(q => q.round === contestState.currentRound);
          const allSolved = roundQuestions.length > 0 && roundQuestions.every(q =>
            participant?.completedQuestions.includes(q.id)
          );

          if (allSolved) {
            return (
              <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
                <div className="bg-green-600/10 border-b border-green-500/20 p-3 text-center">
                  <p className="text-green-500 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                    <CheckCircle2 size={14} /> Round {contestState.currentRound} Complete! You've solved all questions.
                  </p>
                </div>
                <div className="flex-1">
                  <WaitingRoom participants={participants} username={user.username} userId={user.id} socketConnected={socketConnected} instanceId={instanceId} />
                </div>
              </div>
            );
          }

          if (contestState?.status === "ended") {
            return <Leaderboard participants={participants} currentUserId={user?.id} />;
          }

          return <UserPanel username={user.username} userId={user.id} contestState={contestState} participants={participants} questions={questions} />;
        })()
      )}
    </div>
  );
}

