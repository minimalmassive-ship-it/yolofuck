import { supabase } from './supabase';

let lastRequestTime = 0;
const MIN_REQUEST_GAP = 1500; // v7.3.0: Lowered for High-Frequency Mode (VAD will handle bulk)

export const groqService = {
    async transcribeAudio(blob: Blob, language: string = 'en', promptContext?: string, customApiKey?: string, retryCount = 0): Promise<string> {
        const now = Date.now();
        if (now - lastRequestTime < MIN_REQUEST_GAP && retryCount === 0) {
            console.warn(`[Groq Service] Throttling... Wait: ${MIN_REQUEST_GAP - (now-lastRequestTime)}ms`);
            return ""; 
        }
        lastRequestTime = now;

        const formData = new FormData();
        const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `recording.${ext}`, { type: blob.type || 'audio/webm' });
        
        formData.append('file', file);
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('response_format', 'json');
        formData.append('temperature', '0');

        if (language) {
            const langCode = language.split('-')[0];
            formData.append('language', langCode);
            const selectedPrompt = '.'; 
            formData.append('prompt', promptContext ? `${selectedPrompt} ${promptContext}` : selectedPrompt);
        }

        if (customApiKey) {
            formData.append('customApiKey', customApiKey);
        }

        try {
            const { data, error } = await supabase.functions.invoke('ai-transcribe', {
                body: formData
            });

            if (error) {
                if (error.message?.includes('429') && retryCount < 2) {
                    console.log(`[Groq Service] 429 Hit. Queuing retry ${retryCount + 1}/2 in 2s...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return this.transcribeAudio(blob, language, promptContext, customApiKey, retryCount + 1);
                }
                throw new Error(error.message || 'Transcription failed via Edge Function');
            }

            if (data?.error) {
                throw new Error(data.error);
            }

            let text = data?.text || '';

            // v15.0: ADVANCED HALLUCINATION SHIELD
            // 1. Multilingual Character Check (Ratio-based)
            const langCode = language.split('-')[0].toLowerCase();
            if (langCode === 'pl' || langCode === 'en') {
                // eslint-disable-next-line no-control-regex
                const nonLatinRegex = /[^\u0000-\u024F\u1E00-\u1EFF\s\d\p{P}]/gu; 
                const matches = text.match(nonLatinRegex) || [];
                if (matches.length > 0 && text.length > 5) {
                    const ratio = matches.length / text.length;
                    if (ratio > 0.2) {
                        console.warn(`[Groq Service] Discarding multilingual hallucination (Ratio: ${ratio.toFixed(2)})`);
                        return "";
                    }
                }
            }

            // 2. Expanded Blacklist (Common low-energy Whisper noise)
            const blacklist = [
                "To jest polska mowa", "To jest polska mowa.", "Standard English speech.",
                "Sigma", "Brubis", "Yhe", "Tourism", "Turismo", 
                "Wszelkie prawa zastrzeżone", "Dziękuję za obejrzenie",
                "Subskrybuj", "Kanał", "Watching", "Subscribe",
                "Ingoruj ciszę", "Nie pisz nic", "Ignora el silencio",
                "Thanks for watching", "I hope you enjoyed", "In A amen",
                "Dziękuję za uwagę", "Dziękuję za uwagę.", "Dziękuję.", "Dzień dobry.", 
                "Zapraszam do subskrypcji", "Napisy stworzone przez społeczność"
            ];

            blacklist.forEach(phrase => {
                const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
                text = text.replace(regex, '');
            });

            return text.replace(/\s\s+/g, ' ').trim();
        } catch (error) {
            console.error('[Groq Service] Transcription Error:', error);
            throw new Error((error as any)?.message || String(error));
        }
    }
};

