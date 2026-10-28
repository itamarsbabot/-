// Server-side proxy to Claude. The API key never reaches the iPad.
// Env vars: ANTHROPIC_API_KEY (required), TUTOR_ACCESS_CODE (recommended).
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "../../public/js/prompts.js";

const MODEL = "claude-opus-5-5";
const client = new Anthropic();

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const required = process.env.TUTOR_ACCESS_CODE;
  if (required && req.headers.get("x-access-code") !== required) {
    return json(401, { error: "קוד גישה שגוי" });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad json" });
  }
  const { mode = "tutor", subject = "math", messages = [], effort, focus = [] } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json(400, { error: "messages required" });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const s = client.beta.messages.stream({
          model: MODEL,
          max_tokens: 32000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: effort || (mode === "exam-grade" || mode === "exam-make" ? "high" : "medium") },
          system: [
            { type: "text", text: buildSystemPrompt(mode, subject, Array.isArray(focus) ? focus.slice(0, 60) : []), cache_control: { type: "ephemeral" } },
          ],
          messages,
        });
        for await (const event of s) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            send({ t: event.delta.text });
          }
        }
        const final = await s.finalMessage();
        if (final.stop_reason === "refusal") send({ error: "המורה לא יכול לענות על זה. נסי לנסח אחרת." });
        send({ done: true, stop: final.stop_reason });
      } catch (err) {
        console.error(err);
        const status = err?.status;
        const msg =
          status === 401 ? "מפתח API לא תקין בשרת" :
          status === 429 ? "יותר מדי בקשות – נסי שוב בעוד דקה" :
          status >= 500 ? "השרת של Claude עמוס – נסי שוב" :
          "שגיאה בחיבור למורה";
        send({ error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" },
  });
};

export const config = { path: "/api/tutor" };
