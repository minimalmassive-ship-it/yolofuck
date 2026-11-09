import { DeepgramClient } from "@deepgram/sdk";

/**
 * Deepgram Service (v1.1)
 * High-performance transcription using Nova-2 and SDK v5.
 */
class DeepgramService {
    private activeConnection: WebSocket | null = null;
    private keepAliveInterval: any = null;

    async startStreaming(
        apiKey: string, 
        language: string,
        sampleRate: number,
        onResult: (result: { text: string; isFinal: boolean }) => void,
        onError?: (err: any) => void
    ): Promise<WebSocket> {
        this.stopStreaming();

        const normalizeLang = (l: string) => {
            if (!l) return 'en';
            const clean = l.toLowerCase().trim();
            if (clean.startsWith('pl')) return 'pl';
            if (clean.startsWith('en')) return 'en';
            if (clean.startsWith('de')) return 'de';
            if (clean.startsWith('es')) return 'es';
            return clean.split('-')[0] || 'en';
        };

        const targetLang = normalizeLang(language);

        return new Promise((resolve, reject) => {
            try {
                // Native WebSocket connection with Nova-2
                const url = `wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000&language=${targetLang}&interim_results=true&smart_format=true&endpointing=500`;
                
                // In browsers, Authorization headers aren't supported in WebSockets.
                // Deepgram supports the sub-protocol fallback: ['token', 'YOUR_KEY']
                const socket = new WebSocket(url, ['token', apiKey]);
                this.activeConnection = socket;

                console.log(`[Deepgram] Native WebSocket Handshake. URL: ...model=nova-2&language=${targetLang}, KeyPrefix: ${apiKey.slice(0, 4)}...`);

                let isConnectionEstablished = false;

                socket.onopen = () => {
                    isConnectionEstablished = true;
                    console.log("[Deepgram] WebSocket OPEN event. readyState:", socket.readyState);
                    
                    // KeepAlive every 8 seconds to guarantee connection never drops during long recording sessions / silences (60+ minutes)
                    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
                    this.keepAliveInterval = setInterval(() => {
                        if (this.activeConnection && this.activeConnection.readyState === WebSocket.OPEN) {
                            try {
                                this.activeConnection.send(JSON.stringify({ type: 'KeepAlive' }));
                            } catch (e) {
                                console.warn("[Deepgram] KeepAlive ping failed:", e);
                            }
                        }
                    }, 8000);

                    resolve(socket);
                };

                socket.onmessage = (message) => {
                    try {
                        const data = JSON.parse(message.data);
                        
                        // Deepgram sends metadata and results. We only care about channel alternatives.
                        if (data.channel && data.channel.alternatives) {
                            const transcript = data.channel.alternatives[0].transcript;
                            if (transcript !== undefined) {
                                onResult({
                                    text: transcript,
                                    isFinal: data.is_final
                                });
                            }
                        }
                    } catch (e) {
                        console.warn("[Deepgram] Failed to parse message JSON:", e);
                    }
                };

                socket.onerror = (err) => {
                    console.error("[Deepgram] WebSocket Error event:", err);
                    if (!isConnectionEstablished || socket.readyState === 0) {
                        reject(new Error("Deepgram WebSocket handshake failed"));
                    } else {
                        onError?.(err);
                    }
                };

                socket.onclose = (event) => {
                    if (this.keepAliveInterval) {
                        clearInterval(this.keepAliveInterval);
                        this.keepAliveInterval = null;
                    }
                    if (event.code === 1005 || event.code === 1000) {
                        // Graceful client termination (e.g., language switch or modal close)
                        console.log("[Deepgram] WebSocket closed gracefully.");
                    } else {
                        console.warn("[Deepgram] WebSocket closed. Code:", event.code, "Reason:", event.reason);
                    }
                    if (event.code === 4001) {
                        console.error("[Deepgram] AUTH_FAILURE: The API Key is likely invalid or unauthorized for this origin.");
                    } else if (event.code === 1011) {
                        console.error("[Deepgram] SERVER_ERROR: If reason states 'did not receive audio', check the audio stream.");
                    }
                };

            } catch (err) {
                console.error("[Deepgram] Initial WebSocket creation failed:", err);
                reject(err);
            }
        });
    }

    sendRaw(data: ArrayBuffer | Blob) {
        if (!this.activeConnection) return;
        
        // WebSocket readyState (1 = OPEN)
        const state = this.activeConnection.readyState;
        
        if (state === 1) {
            this.activeConnection.send(data);
        } else {
            if (state === 0) {
                console.warn("[Deepgram] Attempted to send while CONNECTING.");
            } else {
                console.error("[Deepgram] Attempted to send while state is", state);
            }
        }
    }

    stopStreaming() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        if (this.activeConnection) {
            console.log("[Deepgram] Closing native WebSocket cleanly...");
            const ws = this.activeConnection;
            this.activeConnection = null;
            try {
                // Detach all listeners before closing so closing events don't trigger ghost onError / fallback
                ws.onmessage = null;
                ws.onerror = null;
                ws.onclose = null;
                if (ws.readyState === WebSocket.OPEN) {
                    ws.onopen = null;
                    ws.close(1000, "Client normal closure");
                } else if (ws.readyState === WebSocket.CONNECTING) {
                    // If still connecting during rapid switch, wait for open before closing to avoid Chrome warning
                    ws.onopen = () => {
                        try {
                            ws.close(1000, "Client normal closure");
                        } catch (_) {}
                    };
                } else {
                    ws.onopen = null;
                }
            } catch (e) {
                console.warn("[Deepgram] Error during close:", e);
            }
        }
    }
}

export const deepgramService = new DeepgramService();
