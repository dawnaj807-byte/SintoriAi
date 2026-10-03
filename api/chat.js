import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSystemPrompt } from './intelligence.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method Not Allowed'
    });
  }

  try {
    if (!process.env.GEMINI_API_KEY) {
      console.error('Brak GEMINI_API_KEY');
      return res.status(500).json({
        error: 'Brak klucza GEMINI_API_KEY w Vercel Environment Variables.'
      });
    }

    const {
      contents,
      timeZone,
      modelName
    } = req.body || {};

    if (!Array.isArray(contents) || contents.length === 0) {
      return res.status(400).json({
        error: 'Brak poprawnego pola contents.'
      });
    }

    const genAI = new GoogleGenerativeAI(
      process.env.GEMINI_API_KEY
    );

    // ---------------------------------------------------------
    // OSTATNIA WIADOMOŚĆ UŻYTKOWNIKA
    // ---------------------------------------------------------

    const lastMessageObj = contents[contents.length - 1];

    const userText =
      lastMessageObj?.role === 'user'
        ? (lastMessageObj.parts || [])
            .map(part => part?.text || '')
            .join(' ')
            .trim()
            .toLowerCase()
        : '';

    // ---------------------------------------------------------
    // ROUTER SINTORI
    // ---------------------------------------------------------

    let aiEngine = 'gemini-3.5-flash';
    let thinkingLevel = 'low';

    const isGreeting =
      userText.length < 50 &&
      /^(siema|hej|cześć|czesc|witaj|hello|hi|elo|yo|co tam)\b/i.test(
        userText
      );

    const isSimple =
      userText.length < 100 &&
      /^(co to|kto to|gdzie|kiedy|ile|jaki|jaka|jakie|czy)\b/i.test(
        userText
      );

    const isCode =
      /python|javascript|typescript|java|c\+\+|c#|html|css|sql|lua|php|rust|golang|react|unity|roblox|minecraft|skrypt|kod|bug|błąd|error|debug|program|programowanie|algorytm|api|json|node\.?js|npm|git/i.test(
        userText
      );

    const isMath =
      /matematyka|matematycz|równanie|równania|pierwiastek|delta|funkcj|pochodn|całk|liczb|procent|ułam|geometr|trygonom|kombinat|prawdopodobieństw|logarytm|sinus|cosinus/i.test(
        userText
      );

    const isHard =
      userText.length > 700 ||
      /udowodnij|dowód|zaprojektuj|zaprojektować|zoptymalizuj|optymaliz|architektur|bardzo trud|szczegółowo|przeanalizuj|analiza|złożon|wydajność|skalowal|system|backend|infrastruktura/i.test(
        userText
      );

    // ---------------------------------------------------------
    // WYBÓR MODELU
    // ---------------------------------------------------------

    if (modelName && /pro/i.test(modelName)) {
      // Ręcznie wybrany tryb Pro
      aiEngine = 'gemini-3.1-pro-preview';
      thinkingLevel = 'high';

    } else if (isHard) {
      // Bardzo trudne zadania
      aiEngine = 'gemini-3.1-pro-preview';
      thinkingLevel = 'high';

    } else if (isCode || isMath) {
      // Kod / matematyka
      aiEngine = 'gemini-3.8-flash';
      thinkingLevel = 'high';

    } else if (isGreeting || isSimple) {
      // Proste pytania
      aiEngine = 'gemini-3.5-flash-lite';
      thinkingLevel = 'minimal';

    } else {
      // Normalna rozmowa
      aiEngine = 'gemini-3.5-flash';
      thinkingLevel = 'medium';
    }

    console.log(
      `[Sintori Router] model=${aiEngine} thinking=${thinkingLevel}`
    );

    // ---------------------------------------------------------
    // SYSTEM PROMPT
    // ---------------------------------------------------------

    const systemInstructionText = getSystemPrompt(
      modelName,
      timeZone
    );

    // ---------------------------------------------------------
    // MODEL
    // ---------------------------------------------------------

    const generativeModel = genAI.getGenerativeModel({
      model: aiEngine,
      systemInstruction: systemInstructionText,

      generationConfig: {
        maxOutputTokens: 8192,

        thinkingConfig: {
          thinkingLevel
        }
      }
    });

    // ---------------------------------------------------------
    // REQUEST
    // ---------------------------------------------------------

    const response = await generativeModel.generateContent({
      contents
    });

    const result = await response.response;

    const replyText = result.text();

    if (!replyText) {
      throw new Error('Gemini zwrócił pustą odpowiedź.');
    }

    console.log(
      `[Sintori] Odpowiedź wygenerowana przez ${aiEngine}`
    );

    return res.status(200).json({
      reply: replyText,
      model: aiEngine
    });

  } catch (error) {
    console.error('=== SINTORI API ERROR ===');
    console.error(error);
    console.error('Message:', error?.message);
    console.error('Stack:', error?.stack);

    return res.status(500).json({
      error: 'API Error',
      details: error?.message || String(error)
    });
  }
}