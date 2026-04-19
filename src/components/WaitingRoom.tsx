import React, { useState } from "react";
import { Participant } from "../types";
import { Users, Loader2, LogOut, RefreshCw, Trophy } from "lucide-react";
import Modal from "./Modal";
import socket from "../lib/socket";

export default function WaitingRoom({ participants, username, userId, socketConnected, instanceId }: { participants: Participant[], username: string, userId: string, socketConnected: boolean, instanceId: string | null }) {
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("contest_user");
    window.location.reload();
  };

  const sortedParticipants = [...participants].sort((a, b) => {
    const scoreA = (a.quizScore || 0) + (a.debugScore || 0) + (a.round3Score || 0);
    const scoreB = (b.quizScore || 0) + (b.debugScore || 0) + (b.round3Score || 0);
    return scoreB - scoreA;
  });

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-4 gap-4">
      <div className="max-w-md w-full bg-[#1a1a1a] rounded-2xl border border-white/10 p-8 space-y-8 shadow-2xl relative">
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
          <span className="text-[10px] uppercase font-bold text-gray-600 tracking-widest">
            {socketConnected ? 'Connected' : 'Reconnecting...'}
          </span>
          {instanceId && (
            <span className="text-[10px] uppercase font-bold text-gray-700 tracking-widest border-l border-white/10 pl-2">
              ID: {instanceId}
            </span>
          )}
        </div>
        <button 
          onClick={() => setShowLogoutModal(true)}
          className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-lg border border-red-500/20 transition-all text-sm font-medium"
          title="Logout"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>

        <div className="text-center space-y-2">
          <div className="inline-flex p-4 bg-blue-600/20 rounded-full text-blue-500 mb-2 relative group">
            <Loader2 size={32} className="animate-spin" />
            <button 
              onClick={() => socket.emit("requestState")}
              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-blue-600/40 rounded-full transition-opacity"
              title="Refresh Status"
            >
              <RefreshCw size={16} className="text-white" />
            </button>
          </div>
          <h1 className="text-3xl font-bold">Waiting Room</h1>
          <p className="text-gray-400">The contest will start shortly...</p>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center text-sm font-medium text-gray-500 uppercase tracking-wider">
            <span className="flex items-center gap-2"><Trophy size={16} /> Leaderboard</span>
            <span>{participants.length} Active</span>
          </div>
          
          <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
            {sortedParticipants.map((p, index) => (
              <div 
                key={p.userId} 
                className={`p-3 rounded-xl border flex justify-between items-center transition-all ${
                  p.userId === userId 
                    ? "bg-blue-600/10 border-blue-500/50" 
                    : "bg-white/5 border-white/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 font-mono w-4">{index + 1}.</span>
                  <span className="font-medium">{p.username}</span>
                </div>
                <span className="text-blue-400 font-mono font-bold">{(p.quizScore || 0) + (p.debugScore || 0) + (p.round3Score || 0)} pts</span>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-white/5">
          <p className="text-center text-xs text-gray-500 italic">
            Tip: Do not switch tabs or close this window once the contest starts.
          </p>
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
    </div>
  );
}
