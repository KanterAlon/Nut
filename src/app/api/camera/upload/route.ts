import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const image = formData.get('image');
  if (!image || !(image instanceof File)) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 });
  }

  const buffer = Buffer.from(await image.arrayBuffer());
  const base64 = buffer.toString('base64');

  try {
    const aiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Identifica el producto o texto principal de esta imagen y responde solo con un término breve para buscar.',
              },
              {
                type: 'input_image',
                image_base64: base64,
              },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const message = await aiRes.text();
      throw new Error(`OpenAI status ${aiRes.status}: ${message}`);
    }

    const aiJson = await aiRes.json();
    const responseText = aiJson.output_text || '';

    return NextResponse.json({ ai: { response: responseText } });
  } catch (err) {
    console.error('Camera AI error', err);
    return NextResponse.json({ ai: { response: '' }, error: 'AI error' }, { status: 500 });
  }
}
