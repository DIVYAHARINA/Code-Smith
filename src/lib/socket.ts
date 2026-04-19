import { io } from "socket.io-client";

const socket = io({
  path: "/socket.io",
  transports: ["polling", "websocket"],
  reconnectionAttempts: 20,
  reconnectionDelay: 1000,
  autoConnect: true,
  withCredentials: true
});

export default socket;
