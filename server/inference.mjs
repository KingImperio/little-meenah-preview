import { statusError } from "./security.mjs";

/** Reassemble a bounded OpenAI-compatible stream without exposing reasoning. */
export async function readKiloCompletion(response, onText = () => {}) {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = await response.json();
    const choice = data.choices?.[0];
    const message = choice?.message && {
      ...choice.message,
      finish_reason: choice.finish_reason,
    };
    if (message?.content) onText(message.content);
    return message;
  }
  if (!response.body) throw statusError("The model stream was empty.", 502);
  const reader = response.body.getReader(),
    decoder = new TextDecoder(),
    calls = new Map();
  let buffer = "",
    content = "",
    finished = false,
    finishReason;
  function frame(text) {
    const data = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    if (data.trim() === "[DONE]") {
      finished = true;
      return;
    }
    const item = JSON.parse(data);
    if (item.error)
      throw statusError(
        "The model connection ended unexpectedly. Your draft can be sent again.",
        502,
      );
    const choice = item.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason === "error")
      throw statusError("The model could not finish this reply.", 502);
    if (choice.finish_reason) {
      finished = true;
      finishReason = choice.finish_reason;
    }
    const delta = choice.delta || {};
    if (typeof delta.content === "string") {
      content += delta.content;
      if (content.length > 16000)
        throw statusError(
          "The model reply exceeded this request’s limit.",
          502,
        );
      onText(delta.content);
    }
    for (const part of delta.tool_calls || []) {
      if (!Number.isInteger(part.index) || part.index < 0 || part.index > 3)
        throw statusError("Too many proposed tools.", 502);
      const call = calls.get(part.index) || {
        id: "",
        type: "function",
        function: { name: "", arguments: "" },
      };
      if (part.id) call.id = part.id;
      call.function.name += part.function?.name || "";
      call.function.arguments += part.function?.arguments || "";
      if (
        call.function.name.length > 100 ||
        call.function.arguments.length > 16000
      )
        throw statusError("The proposed action was too large.", 502);
      calls.set(part.index, call);
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      if (buffer.length > 262144)
        throw statusError("The model stream exceeded its limit.", 502);
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        frame(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
      if (done) {
        if (buffer.trim()) frame(buffer);
        break;
      }
    }
    if (!finished)
      throw statusError(
        "The connection ended before Butler finished. Try sending your draft again.",
        502,
      );
    const tool_calls = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, call]) => call);
    if (tool_calls.some((call) => !call.id || !call.function.name))
      throw statusError(
        "The model returned an incomplete proposed action.",
        502,
      );
    return {
      role: "assistant",
      content,
      finish_reason: finishReason,
      ...(tool_calls.length ? { tool_calls } : {}),
    };
  } finally {
    await reader.cancel().catch(() => {});
  }
}
