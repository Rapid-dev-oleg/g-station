import { runKimiAgent } from '../src/server/ai/kimi-agent';
(async () => {
  console.error('CALC_AGENT =', process.env.CALC_AGENT);
  const { output } = await runKimiAgent({ prompt: 'Ответь ровно одним словом: ОК' });
  console.log('OUTPUT:', JSON.stringify(output.slice(0, 200)));
  process.exit(0);
})();
