import 'dotenv/config';
import { OpenAI } from 'openai';
import { ChatOpenAI } from "@langchain/openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// In-memory email store
const emails = [];

export default async function routes(fastify) {
  // List emails
  fastify.get('/emails', async () => emails.slice().reverse());

  // Save email
  fastify.post('/emails', async (req, res) => {
    const { to, cc, bcc, subject, body, business } = req.body || {};
    const item = {
      id: String(Date.now()),
      to: to || '',
      cc: cc || '',
      bcc: bcc || '',
      business: business || '',
      subject: subject || '',
      body: body || '',
      createdAt: new Date().toISOString(),
    };
    emails.push(item);
    return item;
  });

  // AI streaming route using LangChain
  fastify.get('/ai/stream', async (req, reply) => {
    const { prompt = '', recipient = '', business = '' } = req.query || {};

    console.log("AI stream request:", { prompt, recipient, business });

    // --- Router step (classification) ---
    let mode = 'sales'; // safer default
    try {
      const router = new ChatOpenAI({
        model: "gpt-4o",
        temperature: 0,
        apiKey: process.env.OPENAI_API_KEY,
      });

      const routeResp = await router.invoke([
        {
          role: "system",
          content: `You are a strict classifier.
Classify the intent as exactly one word: "sales" or "followup".

Definitions:
- "sales" = any cold outreach, initial contact, prospecting, demo request, pitching a product or service, introducing the company.
- "followup" = any reminder, checking in, following up after a prior interaction, referencing an earlier conversation.

Rules:
- Output must be *exactly* one word: "sales" or "followup".
- Never output explanations or extra text.`,
        },
        { role: "user", content: `Prompt: "${prompt}". Business: "${business}".` },
      ]);

      const answer = routeResp.content[0]?.text?.trim().toLowerCase();

      if (answer === "sales" || answer === "followup") {
        mode = answer;
      } else {
        console.warn("Unexpected router output:", answer);
      }
    } catch (err) {
      console.error("Router classification error:", err);
    }

    // --- Heuristic fallback ---
    if (/follow\s?up|checking in|reminder/i.test(prompt)) {
      mode = "followup";
    } else if (/cold|outreach|prospect|demo|pitch|sales/i.test(prompt)) {
      mode = "sales";
    }

    console.log("Router classified:", mode);

    // --- Streaming setup ---
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Transfer-Encoding': 'chunked',
    });
    reply.raw.flushHeaders?.();

    const sysForMode =
      mode === "sales"
        ? `You are Sales Assistant. Generate a short sales email <= 40 words, max 7–10 words per sentence. Tailor it to recipient "${recipient}" and their business "${business}". Return SUBJECT and BODY.`
        : `You are Follow-up Assistant. Generate a polite follow-up email addressed to "${recipient}". Return SUBJECT and BODY.`;

    const userPrompt =
      `User intent: "${prompt}". Recipient: "${recipient}". Business: "${business}".\n` +
      `Format:\nSUBJECT: <short subject>\nBODY:\n<email body>`;

    try {
      console.log("🚀 Starting LLM stream...");
      const llm = new ChatOpenAI({
        model: "gpt-4o",
        streaming: true,
        apiKey: process.env.OPENAI_API_KEY,
      });

      const stream = await llm.stream([
        { role: "system", content: sysForMode },
        { role: "user", content: userPrompt },
      ]);

      console.log("✅ Stream object created, iterating...");

      let target = "subject";
      let seenBodyHeader = false;

      for await (const chunk of stream) {
        // console.log("📩 Raw chunk:", JSON.stringify(chunk, null, 2));

        let delta = "";
        if (Array.isArray(chunk.content)) {
          delta = chunk.content.map((c) => c?.text ?? "").join("");
        } else if (typeof chunk.content === "string") {
          delta = chunk.content;
        }

        if (!delta) {
          // console.log("⚠️ Empty delta, skipping.");
          continue;
        }

        console.log(`📝 Delta (${target}):`, delta);

        if (!seenBodyHeader) {
          const idx = delta.indexOf("BODY:");
          if (idx >= 0) {
            const before = delta.slice(0, idx);
            if (before) {
              console.log("✉️ Sending subject part:", before);
              reply.raw.write(`event: subject\ndata: ${before}\n\n`);
            }
            seenBodyHeader = true;
            target = "body";
            const after = delta.slice(idx + "BODY:".length);
            if (after) {
              console.log("✉️ Sending first body part:", after);
              reply.raw.write(`event: body\ndata: ${after}\n\n`);
            }
            continue;
          }
        }

        console.log("✉️ Sending delta:", delta);
        reply.raw.write(`event: ${target}\ndata: ${delta}\n\n`);
      }


      console.log("✅ Stream complete, sending done event.");
      reply.raw.write("event: done\ndata: ok\n\n");
      reply.raw.end();
    } catch (err) {
      console.error("🔥 LangChain streaming error:", err);
      reply.raw.write(`event: error\ndata: ${err.message}\n\n`);
      reply.raw.end();
    }
  });
}