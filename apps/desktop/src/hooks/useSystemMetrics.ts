import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * SystemMetrics
 *
 * Mirrors the `SystemMetrics` struct serialised by the Rust backend.
 * Memory values are in bytes (u64 on the Rust side).
 */
export interface SystemMetrics {
  cpu_usage: number;    // 0–100 %
  total_memory: number; // bytes
  used_memory: number;  // bytes
}

const POLL_INTERVAL_MS = 1000;

let currentMetrics: SystemMetrics | null = null;
let subscribers: Set<React.Dispatch<React.SetStateAction<SystemMetrics | null>>> = new Set();
let timerId: ReturnType<typeof setInterval> | null = null;

const poll = async () => {
  try {
    const data = await invoke<SystemMetrics>("get_system_info");
    currentMetrics = data;
  } catch {
    // Running in a browser dev context without Tauri — use mock data
    currentMetrics = {
      cpu_usage: Math.random() * 40 + 10,
      total_memory: 16 * 1024 * 1024 * 1024,
      used_memory: (4 + Math.random() * 4) * 1024 * 1024 * 1024,
    };
  }
  subscribers.forEach((sub) => sub(currentMetrics));
};

/**
 * useSystemMetrics
 *
 * Polls the Tauri `get_system_info` command every second.
 * Centralized store prevents multiple polling intervals when multiple components use this hook.
 * Returns null while the first response is still in-flight.
 */
export function useSystemMetrics(): SystemMetrics | null {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(currentMetrics);

  useEffect(() => {
    subscribers.add(setMetrics);

    if (subscribers.size === 1) {
      poll();
      timerId = setInterval(poll, POLL_INTERVAL_MS);
    }

    return () => {
      subscribers.delete(setMetrics);
      if (subscribers.size === 0 && timerId !== null) {
        clearInterval(timerId);
        timerId = null;
        currentMetrics = null;
      }
    };
  }, []);

  return metrics;
}
