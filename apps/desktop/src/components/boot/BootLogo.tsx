import { motion } from "framer-motion";

export default function BootLogo() {
  return (
    <motion.h1
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1 }}
      className="text-7xl font-bold tracking-[0.5rem] text-cyan-400"
      style={{
        textShadow: "0 0 25px #00E5FF",
      }}
    >
      REZEL
    </motion.h1>
  );
}