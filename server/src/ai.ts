export interface SentimentResult {
  sentiment: 'Positive' | 'Neutral' | 'Negative';
  score: number;
  reason: string;
}

/**
 * Evaluates sentiment of a news title.
 * Tries OpenAI first, then Hugging Face, and falls back to local rule-based engine.
 */
export async function analyzeSentiment(
  title: string,
  config: { openaiKey?: string; hfToken?: string }
): Promise<SentimentResult> {
  // 1. OpenAI Engine (GPT-4o-mini)
  if (config.openaiKey && config.openaiKey.trim() !== '') {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a financial sentiment analyzer. Analyze the sentiment of the provided financial news title. You MUST respond with a valid, raw JSON object ONLY, with no markdown formatting or backticks, with this schema: { "sentiment": "Positive" | "Neutral" | "Negative", "score": number (between 0.0 and 1.0), "reason": "string (brief explanation, max 20 words)" }'
            },
            {
              role: 'user',
              content: `Analyze this headline: "${title}"`
            }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      const content = data.choices[0].message.content;
      const parsed = JSON.parse(content);

      return {
        sentiment: parsed.sentiment || 'Neutral',
        score: typeof parsed.score === 'number' ? parsed.score : 0.5,
        reason: parsed.reason || 'Analyzed via OpenAI'
      };
    } catch (e) {
      console.error('OpenAI Sentiment error, falling back to other methods:', e);
    }
  }

  // 2. Hugging Face Engine (RoBERTa Text Classification)
  if (config.hfToken && config.hfToken.trim() !== '') {
    try {
      const model = 'cardiffnlp/twitter-roberta-base-sentiment-latest';
      const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.hfToken}`
        },
        body: JSON.stringify({ inputs: title })
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const predictions = data[0];
          // Find highest scoring prediction
          let topPred = predictions[0];
          for (const pred of predictions) {
            if (pred.score > topPred.score) {
              topPred = pred;
            }
          }

          let sentiment: 'Positive' | 'Neutral' | 'Negative' = 'Neutral';
          const label = topPred.label.toLowerCase();
          if (label.includes('pos')) sentiment = 'Positive';
          else if (label.includes('neg')) sentiment = 'Negative';

          return {
            sentiment,
            score: parseFloat(topPred.score.toFixed(2)),
            reason: `Sentiment classified as ${sentiment} via Hugging Face.`
          };
        }
      }
      throw new Error(`Hugging Face API returned status: ${response.status}`);
    } catch (e) {
      console.error('Hugging Face Sentiment error, falling back to local rules:', e);
    }
  }

  // 3. Rule-Based Local Sentiment Fallback
  return localRuleBasedSentiment(title);
}

/**
 * Baseline keyword matcher for fallback operations.
 */
function localRuleBasedSentiment(title: string): SentimentResult {
  const lower = title.toLowerCase();

  const positiveWords = ['surge', 'growth', 'breakout', 'up', 'gain', 'positive', 'bull', 'soar', 'strong', 'inflow', 'profit', 'rise', 'buying', 'adoption', 'partner', 'optimism', 'high', 'rally'];
  const negativeWords = ['threaten', 'down', 'headwind', 'pressure', 'negative', 'bear', 'drop', 'loss', 'sell', 'deficit', 'concern', 'fall', 'cut', 'slump', 'plunge', 'warn', 'fears', 'regulatory'];

  let posCount = 0;
  let negCount = 0;

  positiveWords.forEach(w => {
    if (lower.includes(w)) posCount++;
  });

  negativeWords.forEach(w => {
    if (lower.includes(w)) negCount++;
  });

  let sentiment: 'Positive' | 'Neutral' | 'Negative' = 'Neutral';
  let score = 0.50;
  let reason = 'Asset remains stable with neutral trading metrics.';

  if (posCount > negCount) {
    sentiment = 'Positive';
    score = Math.min(0.70 + (posCount * 0.05), 1.00);
    reason = 'Positive news catalyst or technical strength detected.';
  } else if (negCount > posCount) {
    sentiment = 'Negative';
    score = Math.min(0.70 + (negCount * 0.05), 1.00);
    reason = 'Bearish headwinds or market volatility fears detected.';
  }

  return {
    sentiment,
    score: parseFloat(score.toFixed(2)),
    reason: `${reason} (Local Baseline Model)`
  };
}
