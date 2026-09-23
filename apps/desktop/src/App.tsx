import { BootScreen } from './components/boot';
import { VoiceProvider } from './providers/VoiceProvider';
import { HardwareProvider } from './providers/HardwareProvider';
function App() {
  return (
    <HardwareProvider>
      <VoiceProvider>
        <BootScreen />
      </VoiceProvider>
    </HardwareProvider>
  );
}

export default App;
