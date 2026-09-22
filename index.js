const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

app.post('/review', async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Missing contract text' });
  }
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: no API key set' });
  }

  const prompt = `You review freelance contracts. Analyze the text below.

Return ONLY valid JSON, no markdown fences, no preamble, matching exactly:
{
  "flags": [
    {"severity": "high"|"mid"|"low", "quote": "exact short verbatim substring, max 12 words", "issue": "short title, max 6 words", "suggestion": "1-2 sentence risk + what to ask for instead"}
  ],
  "email_subject": "short subject line",
  "email_draft": "polite professional email, 130-180 words, signed [Your Name]"
}

Find 3-6 real issues. Focus on: vague/unlimited scope, weak payment terms, unfavorable IP assignment, missing termination/kill-fee, one-sided non-competes, missing deposit, unclear revision limits. "quote" must be an exact verbatim substring so it can be string-matched. Don't invent clauses not present.

TEXT:
"""
${text}
"""`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1100,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: 'Anthropic API error', detail: errText });
    }

    const data = await response.json();
    const rawText = data.content.map(b => b.text || '').join('\n').trim();
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: 'Review failed', detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ScopeGuard API listening on port ${PORT}`));
