import { ProviderRegistryImpl } from './dist/lib/ai/providers/ProviderRegistry.js';
import { ProviderRouterImpl } from './dist/lib/ai/providers/ProviderRouter.js';
import { OllamaPackage } from './dist/lib/ai/providers/adapters/OllamaAdapter.js';

// Setup singletons since we are bypassing React context
const ProviderRegistry = new ProviderRegistryImpl();
const ProviderRouter = new ProviderRouterImpl();

async function testOllama() {
  console.log('1. Registering Provider and Setting up...');
  const ollama = new OllamaPackage({ endpoint: 'http://127.0.0.1:11434' });
  ProviderRegistry.registerPackage(ollama);
  
  // Inject the registry into router
  // We don't have to inject if they use global registry, but we'll see if it works.

  const taskProfile = {
    id: 'test-task',
    category: 'CONVERSATION',
    requiredCapabilities: { toolCalling: true }, 
  };

  console.log('2. Calling ProviderRouter.selectChatProvider with LOCAL routing...');
  try {
    const route = await ProviderRouter.selectChatProvider(taskProfile, 'LOCAL');
    console.log('\n✅ Selected Provider:', route.vendor);
    console.log('✅ Selected Model:', route.model.id);
    
    if (route.model.id === 'qwen3:4b' || route.model.id === 'gemma3:4b' || route.model.id === 'smollm2:135m') {
      console.log('🎉 SUCCESS: Model selected is an actual installed model!');
    } else {
      console.log('❌ FAILURE: Selected model was not one of the installed models!');
    }
    
    console.log('\n3. Performing real Ollama chat request with', route.model.id);
    const stream = route.adapter.chat(route.model.id, [
      { role: 'user', content: 'Say hello world in exactly two words, nothing else.' }
    ]);
    
    let result = '';
    for await (const chunk of stream) {
      if (chunk.type === 'text') result += chunk.text;
    }
    console.log('Response:', result);
    console.log('✅ Real Ollama request complete.');

  } catch (err) {
    console.error('Test failed:', err);
  }
}

testOllama();
