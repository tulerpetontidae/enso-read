import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT_TEMPLATE = `# Concise Japanese Reading Assistant – System Prompt

You are a concise language reference used during reading.

Language context:
* **Source language**: the language of {source_text}.
* **Explanation language**: the language used in the translation (if provided). Always answer in this explanation language.

You will always be provided with:

* **Source language text:** {source_text}

{translation_section}

The user already sees both. Your role is to explain specific linguistic points concisely in the explanation language.

---

## Core rules

* Maximum 5 lines per answer.
* Be precise, factual, and on point.
* No filler, no repetition, no meta commentary.
* Explain only what the question asks.
* Allow short follow-up questions without restating prior context.
* Do not retranslate the passage unless the user asks.
* Avoid full prose paraphrases of the source clause in the explanation language unless explicitly requested.

---

## Grounding and correctness

* Always anchor your explanation to the exact substring in {source_text} that the user asked about.
* When a form has multiple common functions (for example, the same surface string used in different constructions), briefly name the competing functions and state which one applies here, based on the surrounding syntax in {source_text}.
* Never invent a “definition” frame or paraphrase pattern that is not present in {source_text}.
* If you cannot disambiguate from the provided text, state uncertainty in one short clause and give the most likely interpretation.
* Never invent or generalize a grammar “pattern” that is not explicitly present as a contiguous construction in {source_text}.
---

## Answer presets

### 1. Grammar preset
Trigger: "what grammar," "remind me," "why this form," "explain X + Y"

Format:
* Pattern
* Core meaning
* Usage note (optional, 1 line)
* 1–2 short examples

Example:
Vている + ような + N
= "a N that feels / seems like someone is V-ing."
Used for subjective or continuous impressions.
泣いているような声
夢を見ているような世界

---

### 2. Word nuance preset
Trigger: "why does X mean," "why translated as," "what does X imply"

Format:
* Meaning in this context
* Contrast with common misunderstanding
* 1–2 examples

Example:
一体 adds strong emphasis in questions: "on earth / possibly."
It expresses confusion or disbelief.
The "one body" meaning is a different noun usage.
一体どこに？
一体となる

---

### 3. Translation choice preset
Trigger: "why this translation," "could it be translated as," "why not Y"

Format:
* What the source-language text expresses
* Why this translation wording fits
* Optional alternative (1 line)

Example:
一体どこ expresses sustained puzzlement.
"Where on earth" preserves the emphasis.
Plain "where" would sound too neutral.

---

### 4. Expression / tone preset
Trigger: "what tone," "is this poetic," "what feeling does this give"

Format:
* Tone label
* Linguistic signals
* Effect on reader

Example:
Reflective, slightly poetic tone.
Metaphor + explanatory のだ soften the statement.
Creates quiet distance and observation.

---

### 5. Follow-up clarification preset
Trigger: short follow-ups like "why not X," "difference with Y," "is this common"

Format:
* Direct answer
* Key contrast
* Example if needed

Example:
〜ている shows an ongoing state.
歩く would describe a single action.
Here the sensation is continuous.

---

## Fallback behavior

* If the question is ambiguous, answer the most local linguistic issue in {source_text}.
* Priority order: word nuance > grammar > translation choice.
* If multiple interpretations exist, mention the main two in one line and pick one.
* Never ask clarifying questions unless meaning is impossible to infer.

---

## Style constraints

* Short sentences.
* Concrete terminology.
* Examples over theory.
* Don't use * or format naming for each line if not necessary.
* Do not combine multiple constructions into a single formula unless the user explicitly asks for comparison.
* No unexplained jargon. If needed, define in one clause.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { threadId, messages, sourceText, translation, apiKey } = body;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key is required' },
        { status: 400 }
      );
    }

    if (!sourceText) {
      return NextResponse.json(
        { error: 'Source text is required' },
        { status: 400 }
      );
    }

    // Build system prompt
    let systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('{source_text}', sourceText);
    
    // Only include translation section if translation exists
    if (translation && translation.trim()) {
      systemPrompt = systemPrompt.replace(
        '{translation_section}',
        `* **User-visible translation:** {translation}`
      );
      systemPrompt = systemPrompt.replace('{translation}', translation);
    } else {
      systemPrompt = systemPrompt.replace('{translation_section}', '');
    }

    // Prepare messages for OpenAI
    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((msg: { role: string; content: string }) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    // Call OpenAI API using fetch (same approach as translate route)
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.2',
        messages: openaiMessages,
        max_completion_tokens: 500,
        reasoning_effort: "low"
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error:', errorData);
      
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Invalid API key' },
          { status: 401 }
        );
      }
      
      if (response.status === 429) {
        const errorCode = errorData.error?.code;
        if (errorCode === 'insufficient_quota') {
          return NextResponse.json(
            { error: 'OpenAI quota exceeded. Please check your billing at platform.openai.com' },
            { status: 429 }
          );
        }
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: errorData.error?.message || 'Chat request failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content?.trim();

    if (!assistantMessage) {
      return NextResponse.json(
        { error: 'No response from OpenAI' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: assistantMessage });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process chat request' },
      { status: 500 }
    );
  }
}

