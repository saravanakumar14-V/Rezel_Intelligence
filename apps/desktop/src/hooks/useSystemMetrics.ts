import { useState, useEffect, useRef } from "react";
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

/**
 * useSystemMetrics
 *
 * Polls the Tauri `get_system_info` command every second.
 * Returns null while the first response is still in-flight.
 * Falls back gracefully when running outside Tauri (e.g. browser dev).
 */
export function useSystemMetrics(): SystemMetrics | null {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;

    const poll = async () => {
      try {
        const data = await invoke<SystemMetrics>("get_system_info");
        if (alive) setMetrics(data);
      } catch {
        // Running in a browser dev context without Tauri — use mock data
        if (alive) {
          setMetrics({
            cpu_usage: Math.random() * 40 + 10,
            total_memory: 16 * 1024 * 1024 * 1024,
            used_memory: (4 + Math.random() * 4) * 1024 * 1024 * 1024,
          });
        }
      }
    };

    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      alive = false;
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, []);

  return metrics;
}
