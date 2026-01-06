import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { text, apiKey, engine, sourceLanguage = 'ja', targetLanguage = 'en' } = await request.json();

        if (!text || typeof text !== 'string') {
            return NextResponse.json(
                { error: 'Text is required' },
                { status: 400 }
            );
        }

        // Only OpenAI requires API key (Google Translate is client-side only)
        if ((!engine || engine === 'openai') && (!apiKey || typeof apiKey !== 'string')) {
            return NextResponse.json(
                { error: 'API key is required for OpenAI translation' },
                { status: 400 }
            );
        }

        // Google Translate is client-side only
        if (engine === 'google') {
            return NextResponse.json(
                { error: 'Google Translate is only available client-side' },
                { status: 400 }
            );
        }

        // Language names for prompt (fallback to codes if not found)
        const languageNames: Record<string, string> = {
            'ja': 'Japanese',
            'ru': 'Russian',
            'en': 'English',
            'de': 'German',
            'es': 'Spanish',
            'fr': 'French',
            'zh': 'Chinese',
        };
        const sourceLangName = languageNames[sourceLanguage] || sourceLanguage;
        const targetLangName = languageNames[targetLanguage] || targetLanguage;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-5.2',
                messages: [
                    {
                        role: 'system',
                        content: `You are a professional translator. Translate the following ${sourceLangName} text to natural, fluent ${targetLangName}. Return only the translation without any explanations or additional text.`
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                temperature: 0.3,
                max_completion_tokens: 1000,
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
                // Check if it's a quota issue vs rate limit
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
                { error: errorData.error?.message || 'Translation failed' },
                { status: response.status }
            );
        }

        const data = await response.json();
        const translation = data.choices?.[0]?.message?.content?.trim();

        if (!translation) {
            return NextResponse.json(
                { error: 'No translation received' },
                { status: 500 }
            );
        }

        return NextResponse.json({ translation });
    } catch (error) {
        console.error('Translation error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

