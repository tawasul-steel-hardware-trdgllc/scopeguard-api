// ScopeGuard backend — deploy this separately (Render, Railway, Fly.io, etc.)
// It's the only place your Anthropic API key should ever live.
//
// Setup:
//   1. npm install express cors
//   2. Set environment variable ANTHROPIC_API_KEY on your hosting platform
//   3. Deploy. Note the public URL it gives you (e.g. https://scopeguard-api.onrender.com)
//   4. Put that URL into BACKEND_URL in the app's App.js

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

  const prompt = `You are a contracts reviewer helping an independent freelancer understand a contract or scope-of-work document before they sign it. Analyze the following text.

Return ONLY valid JSON (no markdown fences, no preamble) matching exactly this shape:
{
  "flags": [
    {
      "severity": "high" | "mid" | "low",
      "quote": "exact short substring copied verbatim from the source text (max ~12 words) that this finding refers to",
      "issue": "short title, max 6 words",
      "suggestion": "1-2 sentence plain-English explanation of the risk and what to ask for instead"
    }
  ],
  "email_subject": "short subject line for a follow-up email to the client",
  "email_draft": "a polite, professional email (150-220 words) the freelancer can send to the client raising the top issues and proposing fixes, signed off generically as [Your Name]"
}

Rules:
- Find 3 to 6 real issues. Focus on: vague/unlimited scope, missing or weak payment terms, unfavorable IP assignment, missing termination/kill-fee clauses, one-sided non-competes, missing deposit, unclear revision limits.
- The "quote" field MUST be an exact verbatim substring from the source text so it can be located with a string match. Keep quotes short (under 12 words).
- If the text has no real issues, return fewer flags and say so honestly in the email draft.
- Do not invent clauses that are not in the text.

TEXT TO ANALYZE:
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
        max_tokens: 1500,
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
