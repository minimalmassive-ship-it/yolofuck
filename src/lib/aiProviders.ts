/**
 * aiProviders.ts — yolofuck
 *
 * Centralized registry of AI Think (Reasoning) and Listen (Transcription) engines.
 * BYOK (Bring Your Own Key) architecture: each user connects their own private API keys.
 * Matches Ideanite engine options with zero vendor lock-in.
 */

export interface AiModel {
    id: string;
    name: string;
    description?: string;
}

export interface AiProvider {
    id: string;
    name: string;
    apiKeyUrl: string;
    description: string;
    models: AiModel[];
}

export interface ScribeProvider {
    id: string;
    name: string;
    apiKeyUrl: string;
    requiresKey: boolean;
    description: string;
    models: AiModel[];
}

// ── Think / Cognition Providers (BYOK) ───────────────────────────────────────
export const AI_PROVIDERS: AiProvider[] = [
    {
        id: 'groq',
        name: 'Groq',
        apiKeyUrl: 'https://console.groq.com/keys',
        description: 'Ultra-fast LPU inference engine with generous rate limits',
        models: [
            { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B (Best Quality / Highest Quota)' },
            { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B (Ultra Fast)' },
            { id: 'qwen/qwen3.6-27b', name: 'Qwen 3.6 27B' },
            { id: 'groq/compound', name: 'Groq Compound' },
        ]
    },
    {
        id: 'gemini',
        name: 'Google Gemini',
        apiKeyUrl: 'https://aistudio.google.com/app/apikey',
        description: 'Google DeepMind multimodal reasoning models',
        models: [
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Fast & Capable)' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
        ]
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        apiKeyUrl: 'https://platform.deepseek.com/',
        description: 'State-of-the-art coding and deep reasoning intelligence',
        models: [
            { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)' },
            { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoning)' },
        ]
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        apiKeyUrl: 'https://openrouter.ai/keys',
        description: 'Unified gateway to hundreds of open-source and proprietary models',
        models: [
            { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' },
            { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B' },
            { id: 'qwen/qwen2.5-72b-instruct', name: 'Qwen 2.5 72B' },
        ]
    },
];

// ── Listen / Transcription Providers (Scribe) ──────────────────────────────
export const SCRIBE_PROVIDERS: ScribeProvider[] = [
    {
        id: 'browser',
        name: 'Native Browser (Web Speech API)',
        apiKeyUrl: '',
        requiresKey: false,
        description: 'Instant on-device speech recognition without any API key or cost',
        models: [
            { id: 'native', name: 'Browser Continuous Speech Recognition' }
        ]
    },
    {
        id: 'deepgram',
        name: 'Deepgram',
        apiKeyUrl: 'https://console.deepgram.com/',
        requiresKey: true,
        description: 'Industry-leading real-time streaming speech-to-text',
        models: [
            { id: 'nova-2', name: 'Nova-2 (Default / Ultra-Fast)' },
            { id: 'nova-2-medical', name: 'Nova-2 Medical' }
        ]
    },
    {
        id: 'openai',
        name: 'OpenAI (Whisper)',
        apiKeyUrl: 'https://platform.openai.com/api-keys',
        requiresKey: true,
        description: 'Official OpenAI Whisper audio transcription',
        models: [
            { id: 'whisper-1', name: 'Whisper (v2 Large)' }
        ]
    },
    {
        id: 'groq',
        name: 'Groq (Whisper)',
        apiKeyUrl: 'https://console.groq.com/keys',
        requiresKey: true,
        description: 'Whisper running on Groq LPUs at up to 216x real-time speed',
        models: [
            { id: 'whisper-large-v3-turbo', name: 'Whisper Large v3 Turbo (Blazing Fast)' },
            { id: 'whisper-large-v3', name: 'Whisper Large v3' }
        ]
    },
    {
        id: 'gladia',
        name: 'Gladia',
        apiKeyUrl: 'https://app.gladia.io/',
        requiresKey: true,
        description: 'Multilingual real-time audio intelligence',
        models: [
            { id: 'whisper-a-zero', name: 'Whisper-A-Zero' }
        ]
    },
    {
        id: 'assemblyai',
        name: 'AssemblyAI',
        apiKeyUrl: 'https://www.assemblyai.com/dashboard/api-keys',
        requiresKey: true,
        description: 'High-accuracy speech-to-text models',
        models: [
            { id: 'universal-1', name: 'Universal-1 (Best Accuracy)' },
            { id: 'conformer-2', name: 'Conformer-2 (Fast)' }
        ]
    }
];

export function getAiProviderById(id: string): AiProvider | undefined {
    return AI_PROVIDERS.find(p => p.id === id);
}

export function getScribeProviderById(id: string): ScribeProvider | undefined {
    return SCRIBE_PROVIDERS.find(p => p.id === id);
}
