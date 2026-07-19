import { motion } from "framer-motion";

type Props = {
  children: React.ReactNode;
};

export default function BootTransition({ children }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
      className="relative w-screen h-screen overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle,#00e5ff22_0%,transparent_70%)]" />

      {/* Scan Line */}
      <motion.div
        className="absolute left-0 w-full h-1 bg-cyan-400/30 blur-sm"
        initial={{ y: -20 }}
        animate={{ y: "100vh" }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "linear",
        }}
      />

      {children}
    </motion.div>
  );
}