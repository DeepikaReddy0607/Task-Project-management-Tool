// Clean LLM Provider Interface
// Allows optional integration with external AI providers (e.g. Gemini, OpenAI) via environment variables.
// If no API key is provided, gracefully falls back to the deterministic local intelligence engine.

export const callLlmProvider = async ({ systemPrompt, prompt, context, conversationHistory }) => {
    // If Gemini API Key is configured in environment
    if (process.env.GEMINI_API_KEY) {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

            const contents = [];
            
            // System instructions
            if (systemPrompt) {
                contents.push({
                    role: "user",
                    parts: [{ text: `System Instructions: ${systemPrompt}\n\nTaskFlow Context Data: ${JSON.stringify(context || {})}` }]
                });
                contents.push({
                    role: "model",
                    parts: [{ text: "Understood. I will act as Quackie, using only the verified TaskFlow data provided." }]
                });
            }

            // Conversation history
            if (Array.isArray(conversationHistory)) {
                for (const turn of conversationHistory.slice(-6)) {
                    contents.push({
                        role: turn.role === "assistant" ? "model" : "user",
                        parts: [{ text: turn.content }]
                    });
                }
            }

            // Current prompt
            contents.push({
                role: "user",
                parts: [{ text: prompt }]
            });

            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents,
                    generationConfig: {
                        temperature: 0.2,
                        maxOutputTokens: 800,
                    }
                })
            });

            if (res.ok) {
                const data = await res.json();
                const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (reply) {
                    return reply.trim();
                }
            }
        } catch (error) {
            console.warn("LLM provider call failed, falling back to deterministic engine:", error.message);
        }
    }

    // No external LLM provider configured or call failed
    return null;
};
