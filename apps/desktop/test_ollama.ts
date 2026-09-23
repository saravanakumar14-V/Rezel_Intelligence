import { ProviderRegistry } from './src/lib/ai/providers/ProviderRegistry';
import { ProviderRouter } from './src/lib/ai/providers/ProviderRouter';
import { OllamaVendorPackage } from './src/lib/ai/providers/adapters/OllamaAdapter';
import { ModelCatalog } from './src/lib/ai/providers/ModelCatalog';

async function testOllama() {
  console.log('1. Registering Provider and Setting up...');
  const ollama = new OllamaVendorPackage({ endpoint: 'http://127.0.0.1:11434' });
  ProviderRegistry.registerPackage(ollama);
  
  const taskProfile = {
    id: 'test-task',
    category: 'CONVERSATION',
    requiredCapabilities: { toolCalling: true }, 
  };

  console.log('2. Calling ProviderRouter.selectChatProvider with LOCAL routing...');
  try {
    const route = await ProviderRouter.selectChatProvider(taskProfile as any, 'LOCAL');
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
