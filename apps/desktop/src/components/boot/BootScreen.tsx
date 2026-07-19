import { useEffect, useState } from "react";
import BootLogo from "./BootLogo";
import BootMessages from "./BootMessages";
import BootProgress from "./BootProgress";
import BootTransition from "./BootTransition";
import HomeScreen from "../home/HomeScreen";

const messages = [
  "Initializing Kernel...",
  "Loading Memory...",
  "Starting Intelligence...",
  "Connecting Modules...",
  "Preparing Interface...",
  "WELCOME."
];

export default function BootScreen() {
  const [progress, setProgress] = useState(0);
  const [index, setIndex] = useState(0);
  const [bootComplete, setBootComplete] = useState(false);


  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((p) => {
        const next = p + 2;

        if (next % 20 === 0 && index < messages.length - 1) {
          setIndex((i) => i + 1);
        }

        if (next >= 100) {
          clearInterval(timer);
          return 100;
        }

        return next;
      });
    }, 120);

    return () => clearInterval(timer);
  }, [index]);
 
  useEffect(() => {
  if (progress === 100) {
    const timer = setTimeout(() => {
      setBootComplete(true);
    }, 800);

    return () => clearTimeout(timer);
  }
}, [progress]);

if (bootComplete) {
  return <HomeScreen />;
}

 return (
  <BootTransition>
    <div className="w-screen h-screen bg-[#02030A] flex flex-col items-center justify-center">
      <BootLogo />
      <BootMessages message={messages[index]} />
      <BootProgress progress={progress} />
    </div>
  </BootTransition>
 )
}