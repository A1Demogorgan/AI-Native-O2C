let lastAgentSdkError: string | null = null;

function getErrorMessage(err: unknown) {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function getTextFromResponse(result: unknown) {
  if (typeof result !== "object" || result === null) {
    return "";
  }

  const response = result as {
    output_text?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

export async function runWithAgentSdk(systemPrompt: string, input: string): Promise<string | null> {
  const hasAzure =
    Boolean(process.env.AZURE_OPENAI_API_KEY) &&
    Boolean(process.env.AZURE_OPENAI_ENDPOINT) &&
    Boolean(process.env.AZURE_OPENAI_DEPLOYMENT);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

  if (!hasAzure && !hasOpenAI) {
    lastAgentSdkError = "Missing credentials: set AZURE_OPENAI_* or OPENAI_API_KEY.";
    return null;
  }

  try {
    type OpenAISdkModule = {
      default?: new (config: { apiKey: string }) => unknown;
      AzureOpenAI?: new (config: {
        apiKey: string;
        apiVersion: string;
        endpoint: string;
        deployment: string;
      }) => unknown;
    };
    type OpenAIClient = {
      responses?: {
        create: (params: {
          model: string;
          instructions: string;
          input: string;
        }) => Promise<unknown>;
      };
      chat?: {
        completions?: {
          create: (params: {
            model: string;
            messages: Array<{ role: "system" | "user"; content: string }>;
          }) => Promise<unknown>;
        };
      };
    };

    const openaiSdk = (await import("openai")) as OpenAISdkModule;

    let client: OpenAIClient;
    let modelName: string;

    if (hasAzure) {
      const AzureOpenAI = openaiSdk.AzureOpenAI;
      if (!AzureOpenAI) {
        lastAgentSdkError = "OpenAI Azure SDK class was not found.";
        return null;
      }

      client = new AzureOpenAI({
        apiKey: process.env.AZURE_OPENAI_API_KEY!,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2025-03-01-preview",
        endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT!,
      }) as OpenAIClient;
      modelName = process.env.AZURE_OPENAI_DEPLOYMENT!;
    } else {
      const OpenAI = openaiSdk.default;
      if (!OpenAI) {
        lastAgentSdkError = "OpenAI SDK default client was not found.";
        return null;
      }

      client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
      }) as OpenAIClient;
      modelName = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
    }

    if (client.responses?.create) {
      const result = await client.responses.create({
        model: modelName,
        instructions: systemPrompt,
        input,
      });
      const text = getTextFromResponse(result);
      lastAgentSdkError = text ? null : "OpenAI response did not include text output.";
      return text || null;
    }

    if (client.chat?.completions?.create) {
      const result = await client.chat.completions.create({
        model: modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: input },
        ],
      });
      const text = getTextFromResponse(result);
      lastAgentSdkError = text ? null : "OpenAI chat completion did not include text output.";
      return text || null;
    }

    lastAgentSdkError = "OpenAI SDK client could not be initialized.";
    return null;
  } catch (err) {
    lastAgentSdkError = getErrorMessage(err);
    return null;
  }
}

export async function runWithAgentSdkStrict(systemPrompt: string, input: string): Promise<string> {
  const output = await runWithAgentSdk(systemPrompt, input);
  if (!output) {
    const reason = lastAgentSdkError ? ` Reason: ${lastAgentSdkError}` : "";
    throw new Error(
      `Order Capture requires a configured model via Azure OpenAI or OpenAI API key. Set AZURE_OPENAI_* or OPENAI_API_KEY.${reason}`,
    );
  }
  return output;
}
