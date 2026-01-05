import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { text, apiKey } = await request.json();

        if (!text || typeof text !== 'string') {
            return NextResponse.json(
                { error: 'Text is required' },
                { status: 400 }
            );
        }

        if (!apiKey || typeof apiKey !== 'string') {
            return NextResponse.json(
                { error: 'API key is required' },
                { status: 400 }
            );
        }

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
                        content: 'You are a professional Japanese to English translator. Translate the following Japanese text to natural, fluent English. Return only the translation without any explanations or additional text.'
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

